#!/usr/bin/env python3
"""
Expand Akhand dataset with Wikidata P840 narrative-location entries.

Pipeline:
1) Query Wikidata (all narrative locations or novels-only)
2) Deduplicate against existing dataset by normalized (title, author)
3) Validate coordinates and add QA flags
4) Infer region/country from country labels or nearest known city
5) Optionally enrich a capped subset with Open Library descriptions
6) Write merged output JSON

Usage:
  python -m backend.scripts.wikidata_expand --dry-run
  python -m backend.scripts.wikidata_expand --limit 5000
  python -m backend.scripts.wikidata_expand --novels-only --description-cap 200
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import re
from collections import Counter
from pathlib import Path

import httpx

from backend.data.ingest import CITIES
from backend.data.openlibrary import USER_AGENT as OL_USER_AGENT
from backend.data.openlibrary import fetch_work_description
from backend.data.wikidata import (
    WikidataLiteraryPlace,
    fetch_all_narrative_locations,
    fetch_all_narrative_locations_paged,
    fetch_novels_only_locations,
    fetch_novels_only_locations_paged,
)

DATA_DIR = Path(__file__).parent.parent / "data" / "generated"
DEFAULT_INPUT = DATA_DIR / "literary_places_enriched.json"
DEFAULT_OUTPUT = DATA_DIR / "literary_places_wikidata.json"
DEFAULT_WIKIDATA_CACHE = DATA_DIR / "wikidata_p840_cache.json"

NULL_ISLAND_EPS = 0.01
FAR_FROM_KNOWN_CITY_KM = 500.0

# Country to region fallback map for countries outside the seed-city list.
COUNTRY_REGION = {
    "India": "South Asia",
    "Pakistan": "South Asia",
    "Bangladesh": "South Asia",
    "Sri Lanka": "South Asia",
    "Nepal": "South Asia",
    "Afghanistan": "South Asia",
    "Bhutan": "South Asia",
    "Maldives": "South Asia",
    "United Kingdom": "Europe",
    "UK": "Europe",
    "England": "Europe",
    "France": "Europe",
    "Germany": "Europe",
    "Italy": "Europe",
    "Spain": "Europe",
    "Portugal": "Europe",
    "Ireland": "Europe",
    "Russia": "Europe",
    "Turkey": "Middle East",
    "United States": "North America",
    "USA": "North America",
    "Canada": "North America",
    "Mexico": "Latin America",
    "Brazil": "Latin America",
    "Argentina": "Latin America",
    "Japan": "East Asia",
    "China": "East Asia",
    "South Korea": "East Asia",
    "Thailand": "Southeast Asia",
    "Singapore": "Southeast Asia",
    "Indonesia": "Southeast Asia",
    "Egypt": "Middle East",
    "Iran": "Middle East",
    "Iraq": "Middle East",
    "Lebanon": "Middle East",
    "Israel": "Middle East",
    "Nigeria": "Africa",
    "Kenya": "Africa",
    "South Africa": "Africa",
    "Ghana": "Africa",
    "Tanzania": "Africa",
}


def _normalize_text(value: str) -> str:
    s = (value or "").strip().lower()
    s = re.sub(r"\s+", " ", s)
    return s


def _norm_book_author_key(title: str, author: str) -> tuple[str, str]:
    return (_normalize_text(title), _normalize_text(author))


def _slug(text: str) -> str:
    s = _normalize_text(text)
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "unknown"


def _extract_place_qid(place_qid: str) -> str:
    return (place_qid or "").replace("http://www.wikidata.org/entity/", "").strip()


def _extract_book_qid(book_qid: str) -> str:
    return (book_qid or "").replace("http://www.wikidata.org/entity/", "").strip()


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return r * c


def _nearest_seed_city(lat: float, lon: float) -> tuple[str, dict, float]:
    best_city = ""
    best_info: dict = {}
    best_dist = float("inf")
    for city, info in CITIES.items():
        c_lon, c_lat = info["coords"]
        dist = _haversine_km(lat, lon, c_lat, c_lon)
        if dist < best_dist:
            best_dist = dist
            best_city = city
            best_info = info
    return best_city, best_info, best_dist


def _build_country_region_map() -> dict[str, str]:
    mapping = dict(COUNTRY_REGION)
    for _city, info in CITIES.items():
        country = info.get("country")
        region = info.get("region")
        if country and region and country not in mapping:
            mapping[country] = region
    return mapping


async def _search_openlibrary_work_key(title: str, author: str) -> str | None:
    params = {
        "title": title,
        "author": author,
        "limit": 1,
        "fields": "key,title,author_name",
    }
    async with httpx.AsyncClient(timeout=12.0) as client:
        resp = await client.get(
            "https://openlibrary.org/search.json",
            params=params,
            headers={"User-Agent": OL_USER_AGENT},
        )
        resp.raise_for_status()
        docs = resp.json().get("docs", [])
    if not docs:
        return None
    key = docs[0].get("key")
    return key if isinstance(key, str) and key.startswith("/works/") else None


async def _try_enrich_description(entry: dict) -> str | None:
    title = entry.get("bookTitle", "")
    author = entry.get("author", "")
    if not title:
        return None

    try:
        work_key = await _search_openlibrary_work_key(title=title, author=author)
        if not work_key:
            return None
        desc = await fetch_work_description(work_key)
        if desc:
            entry["openLibraryKey"] = work_key
            entry["openLibraryUrl"] = f"https://openlibrary.org{work_key}"
        return desc
    except Exception:
        return None


def _region_country_for_item(
    country_label: str | None,
    lat: float,
    lon: float,
    country_region_map: dict[str, str],
) -> tuple[str, str, bool, float, str]:
    country = (country_label or "").strip()
    region = country_region_map.get(country, "") if country else ""

    nearest_city, nearest_info, nearest_km = _nearest_seed_city(lat, lon)

    inferred = False
    if not region:
        region = nearest_info.get("region", "Unknown")
        inferred = True
    if not country:
        country = nearest_info.get("country", "Unknown")
        inferred = True

    if not region:
        region = "Unknown"

    return region, country or "Unknown", inferred, nearest_km, nearest_city


def _to_entry(
    wd: WikidataLiteraryPlace,
    country_region_map: dict[str, str],
) -> dict | None:
    lat = wd.latitude
    lon = wd.longitude

    if abs(lat) < NULL_ISLAND_EPS and abs(lon) < NULL_ISLAND_EPS:
        return None

    region, country, inferred_from_nearest, nearest_km, nearest_city = _region_country_for_item(
        country_label=wd.country_label,
        lat=lat,
        lon=lon,
        country_region_map=country_region_map,
    )

    place_name = wd.place_label or "Unknown Place"
    author = wd.author_label or "Unknown"
    book_qid = _extract_book_qid(wd.book_qid)
    place_qid = _extract_place_qid(wd.place_qid)
    stable_id = f"wd-{book_qid or 'unknown-book'}-{place_qid or _slug(place_name)}"

    qa_flags: list[str] = []
    if nearest_km > FAR_FROM_KNOWN_CITY_KM:
        qa_flags.append("far_from_known_city")

    narrative_era = f"{wd.publication_year}s" if wd.publication_year else ""

    return {
        "id": stable_id,
        "bookTitle": wd.book_label or "Unknown Title",
        "author": author,
        "publishYear": wd.publication_year or 0,
        "placeName": place_name,
        "coordinates": [lon, lat],
        "placeType": "real",
        "settingType": "primary",
        "narrativeEra": narrative_era,
        "passage": "",
        "sentiment": {
            "polarity": 0.0,
            "dominantEmotions": [],
            "themes": [],
        },
        "language": wd.language_label or "Unknown",
        "genres": wd.genre_labels or [],
        "region": region,
        "country": country,
        "source": "wikidata",
        "openLibraryKey": None,
        "wikidataBookQid": book_qid,
        "wikidataPlaceQid": place_qid,
        "qaFlags": qa_flags,
        "nearestKnownCity": nearest_city,
        "nearestKnownCityDistanceKm": round(nearest_km, 2),
        "regionInferred": inferred_from_nearest,
    }


def _load_existing(path: Path) -> tuple[dict, list[dict]]:
    with open(path) as f:
        data = json.load(f)
    places = data.get("places", [])
    return data, places


def _wd_to_cache_record(item: WikidataLiteraryPlace) -> dict:
    return {
        "book_qid": item.book_qid,
        "book_label": item.book_label,
        "place_qid": item.place_qid,
        "place_label": item.place_label,
        "latitude": item.latitude,
        "longitude": item.longitude,
        "author_label": item.author_label,
        "author_qid": item.author_qid,
        "publication_year": item.publication_year,
        "language_label": item.language_label,
        "genre_labels": item.genre_labels,
        "country_label": item.country_label,
    }


def _wd_from_cache_record(record: dict) -> WikidataLiteraryPlace:
    return WikidataLiteraryPlace(
        book_qid=record.get("book_qid", ""),
        book_label=record.get("book_label", ""),
        place_qid=record.get("place_qid", ""),
        place_label=record.get("place_label", ""),
        latitude=float(record.get("latitude", 0.0)),
        longitude=float(record.get("longitude", 0.0)),
        author_label=record.get("author_label"),
        author_qid=record.get("author_qid"),
        publication_year=record.get("publication_year"),
        language_label=record.get("language_label"),
        genre_labels=record.get("genre_labels", []) or [],
        country_label=record.get("country_label"),
    )


def _write_wikidata_cache(path: Path, items: list[WikidataLiteraryPlace], query_mode: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "query_mode": query_mode,
        "total": len(items),
        "items": [_wd_to_cache_record(item) for item in items],
    }
    with open(path, "w") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)


def _merge_wikidata_items(existing: list[WikidataLiteraryPlace], incoming: list[WikidataLiteraryPlace]) -> list[WikidataLiteraryPlace]:
    merged = list(existing)
    seen = {(item.book_qid, item.place_qid) for item in existing}
    for item in incoming:
        key = (item.book_qid, item.place_qid)
        if key in seen:
            continue
        seen.add(key)
        merged.append(item)
    return merged


def _load_wikidata_cache(path: Path) -> tuple[str, list[WikidataLiteraryPlace]]:
    with open(path) as f:
        payload = json.load(f)
    query_mode = payload.get("query_mode", "unknown")
    items = [_wd_from_cache_record(record) for record in payload.get("items", [])]
    return query_mode, items


async def main() -> None:
    parser = argparse.ArgumentParser(description="Expand Akhand dataset from Wikidata P840")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="Input JSON path")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Output JSON path")
    parser.add_argument(
        "--wikidata-cache",
        type=Path,
        default=DEFAULT_WIKIDATA_CACHE,
        help="Path to cached Wikidata records",
    )
    parser.add_argument(
        "--refresh-wikidata-cache",
        action="store_true",
        help="Force re-fetch from Wikidata and overwrite cache",
    )
    parser.add_argument(
        "--disable-wikidata-cache",
        action="store_true",
        help="Do not read/write cache for this run",
    )
    parser.add_argument(
        "--paged-fetch",
        action="store_true",
        help="Use paginated LIMIT/OFFSET fetch to reduce per-request load",
    )
    parser.add_argument(
        "--page-size",
        type=int,
        default=2000,
        help="Rows per page when --paged-fetch is enabled",
    )
    parser.add_argument(
        "--max-pages",
        type=int,
        default=0,
        help="Maximum pages to fetch when --paged-fetch is enabled (0=all)",
    )
    parser.add_argument(
        "--page-pause-seconds",
        type=float,
        default=1.5,
        help="Pause between pages when --paged-fetch is enabled",
    )
    parser.add_argument(
        "--start-offset",
        type=int,
        default=0,
        help="Start OFFSET for paged fetch (for resume/chunk runs)",
    )
    parser.add_argument(
        "--append-wikidata-cache",
        action="store_true",
        help="Append fetched records to existing same-mode cache instead of overwriting",
    )
    parser.add_argument("--dry-run", action="store_true", help="Only print expansion stats")
    parser.add_argument("--limit", type=int, default=0, help="Limit number of new entries")
    parser.add_argument("--novels-only", action="store_true", help="Use novels-only Wikidata query")
    parser.add_argument(
        "--description-cap",
        type=int,
        default=200,
        help="Max new entries to enrich with Open Library descriptions",
    )
    args = parser.parse_args()

    if not args.input.exists():
        raise SystemExit(f"Input file not found: {args.input}")

    input_meta, existing = _load_existing(args.input)
    existing_pairs = {
        _norm_book_author_key(p.get("bookTitle", ""), p.get("author", "")) for p in existing
    }

    query_mode = "novels-only" if args.novels_only else "all-narrative"
    wd_items: list[WikidataLiteraryPlace] = []

    use_cache = not args.disable_wikidata_cache
    can_read_cache = use_cache and args.wikidata_cache.exists() and not args.refresh_wikidata_cache

    if can_read_cache:
        cached_query_mode, cached_items = _load_wikidata_cache(args.wikidata_cache)
        if cached_query_mode == query_mode:
            wd_items = cached_items
            print(f"Loaded {len(wd_items)} Wikidata records from cache: {args.wikidata_cache}")
        else:
            print(
                "Cache query mode mismatch "
                f"(cache={cached_query_mode}, requested={query_mode}); fetching fresh data..."
            )

    if not wd_items:
        try:
            if args.novels_only:
                wd_items = (
                    await fetch_novels_only_locations_paged(
                        page_size=args.page_size,
                        max_pages=args.max_pages,
                        pause_seconds=args.page_pause_seconds,
                        start_offset=args.start_offset,
                    )
                    if args.paged_fetch
                    else await fetch_novels_only_locations()
                )
            else:
                wd_items = (
                    await fetch_all_narrative_locations_paged(
                        page_size=args.page_size,
                        max_pages=args.max_pages,
                        pause_seconds=args.page_pause_seconds,
                        start_offset=args.start_offset,
                    )
                    if args.paged_fetch
                    else await fetch_all_narrative_locations()
                )

            if use_cache:
                if args.append_wikidata_cache and args.wikidata_cache.exists():
                    cached_query_mode, cached_items = _load_wikidata_cache(args.wikidata_cache)
                    if cached_query_mode == query_mode:
                        wd_items = _merge_wikidata_items(cached_items, wd_items)
                    else:
                        print(
                            "Skipping cache append due to query mode mismatch "
                            f"(cache={cached_query_mode}, requested={query_mode})"
                        )
                _write_wikidata_cache(args.wikidata_cache, wd_items, query_mode=query_mode)
                print(f"Wrote Wikidata cache: {args.wikidata_cache}")

        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code if exc.response is not None else "unknown"
            print("=" * 72)
            print("Wikidata expansion aborted")
            print("=" * 72)
            print(f"Wikidata endpoint returned HTTP {status}.")
            print("This is usually temporary bot/rate limiting from query.wikidata.org.")
            print("Suggested next run:")
            print("  1) Wait 10-30 minutes before retry")
            print("  2) Use --paged-fetch --novels-only --page-size 1000")
            print("  3) Once successful, reuse cache with --wikidata-cache")
            print("  4) If persistent, run from CI/on a different IP")
            raise SystemExit(2)

    country_region_map = _build_country_region_map()

    new_entries: list[dict] = []
    deduped = 0
    rejected_null_island = 0
    flagged_far = 0

    for item in wd_items:
        title = item.book_label or ""
        author = item.author_label or "Unknown"
        key = _norm_book_author_key(title, author)
        if key in existing_pairs:
            deduped += 1
            continue

        entry = _to_entry(item, country_region_map=country_region_map)
        if entry is None:
            rejected_null_island += 1
            continue

        if "far_from_known_city" in entry.get("qaFlags", []):
            flagged_far += 1

        new_entries.append(entry)
        existing_pairs.add(key)

    if args.limit > 0:
        new_entries = new_entries[: args.limit]

    # Optional description enrichment, capped for rate/usage safety.
    enriched_descriptions = 0
    if not args.dry_run and args.description_cap > 0:
        cap = min(args.description_cap, len(new_entries))
        for idx in range(cap):
            desc = await _try_enrich_description(new_entries[idx])
            if desc:
                new_entries[idx]["passage"] = desc[:800]
                enriched_descriptions += 1

    region_counts = Counter(entry.get("region", "Unknown") for entry in new_entries)

    print("=" * 72)
    print("Wikidata expansion summary")
    print("=" * 72)
    print(f"Existing entries: {len(existing)}")
    print(f"Wikidata pairs fetched: {len(wd_items)}")
    print(f"Deduped against existing (title+author): {deduped}")
    print(f"Rejected (null island): {rejected_null_island}")
    print(f"Flagged far from known city (>500km): {flagged_far}")
    print(f"New entries prepared: {len(new_entries)}")
    print(f"Open Library descriptions added: {enriched_descriptions}")
    print("By region:")
    for region, count in region_counts.most_common():
        print(f"  {region}: {count}")

    if args.dry_run:
        return

    merged_places = [*existing, *new_entries]

    output_payload = {
        "version": input_meta.get("version", "0.7.0"),
        "source": "wikidata_expansion",
        "base_input": str(args.input),
        "total": len(merged_places),
        "stats": {
            "existing": len(existing),
            "wikidata_fetched": len(wd_items),
            "deduped_existing": deduped,
            "rejected_null_island": rejected_null_island,
            "flagged_far_from_known_city": flagged_far,
            "new_entries": len(new_entries),
            "description_enriched": enriched_descriptions,
        },
        "places": merged_places,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w") as f:
        json.dump(output_payload, f, indent=2, ensure_ascii=False)

    print(f"Wrote merged dataset: {args.output}")


if __name__ == "__main__":
    asyncio.run(main())
