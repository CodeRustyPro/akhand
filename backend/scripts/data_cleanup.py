#!/usr/bin/env python3
"""
Research-grade cleanup pipeline for literary places datasets.

Applies hard filters and provenance enrichment in a strict order:
1) Vague/non-specific places
2) Non-fiction and reference contamination
3) Ambiguous/generic titles
4) Title-city mismatch (conservative)
5) Deduplication by (title, author, place)

Adds provenance fields:
- passageType
- passageSource
- enrichmentMethod

Also normalizes language labels.
"""

from __future__ import annotations

import argparse
import json
import re
from copy import deepcopy
from collections import Counter, defaultdict
from pathlib import Path


DEFAULT_INPUT = Path(__file__).parent.parent / "data" / "generated" / "literary_places_passages_merged.json"
DEFAULT_OUTPUT = Path(__file__).parent.parent / "data" / "generated" / "literary_places_cleaned_v2.json"
DEFAULT_MANIFEST = Path(__file__).parent.parent / "data" / "generated" / "cleanup_manifest.json"


CITY_ALIASES = {
    "bombay": "mumbai",
    "mumbai": "mumbai",
    "constantinople": "istanbul",
    "istanbul": "istanbul",
    "new york city": "new york",
    "new york": "new york",
}


CITY_DEMONYMS = {
    "dubliners": "dublin",
    "londoners": "london",
    "parisians": "paris",
    "new yorker": "new york",
    "new yorkers": "new york",
}


ALL_VAGUE_PLACES = {
    "world", "earth", "global", "international",
    "africa", "europe", "asia", "north america", "south america", "latin america", "middle east",
    "southeast asia", "central asia", "east asia", "west asia", "oceania", "arctic", "antarctica",
    "united states", "usa", "us", "u.s.", "united kingdom", "uk", "great britain", "britain",
    "england", "scotland", "wales", "ireland", "france", "germany", "india", "china", "japan",
    "russia", "canada", "australia", "spain", "italy", "turkey", "greece", "egypt", "mexico",
    "brazil", "argentina", "pakistan", "bangladesh", "nepal", "sri lanka", "afghanistan",
    "roman empire", "ottoman empire", "byzantine empire", "russian empire", "british empire",
    "atlantic ocean", "pacific ocean", "indian ocean", "mediterranean", "colosseum", "eiffel tower",
}

# Expanded coarse geographies: keep entries but tag as region-level granularity.
US_STATES = {
    "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware",
    "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky",
    "louisiana", "maine", "maryland", "massachusetts", "michigan", "minnesota", "mississippi",
    "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey", "new mexico",
    "new york state", "north carolina", "north dakota", "ohio", "oklahoma", "oregon", "pennsylvania",
    "rhode island", "south carolina", "south dakota", "tennessee", "texas", "utah", "vermont",
    "virginia", "washington", "west virginia", "wisconsin", "wyoming", "district of columbia",
}

UK_COUNTIES = {
    "yorkshire", "greater london", "greater manchester", "west midlands", "merseyside", "kent", "essex",
    "surrey", "hampshire", "sussex", "norfolk", "suffolk", "devon", "cornwall", "dorset", "somerset",
    "gloucestershire", "oxfordshire", "buckinghamshire", "berkshire", "hertfordshire", "cambridgeshire",
    "bedfordshire", "leicestershire", "northamptonshire", "warwickshire", "worcestershire", "herefordshire",
    "shropshire", "staffordshire", "derbyshire", "nottinghamshire", "lincolnshire", "lancashire", "cheshire",
    "cumbria", "northumberland", "durham", "tyne and wear", "west yorkshire", "south yorkshire", "east riding of yorkshire",
    "isle of wight", "isle of man", "anglesey", "powys", "gwynedd", "dyfed", "clwyd", "gwent", "mid glamorgan",
    "south glamorgan", "west glamorgan", "aberdeenshire", "argyll", "fife", "perthshire", "lanarkshire", "ayrshire",
}

INDIAN_STATES_UTS = {
    "andhra pradesh", "arunachal pradesh", "assam", "bihar", "chhattisgarh", "goa", "gujarat", "haryana",
    "himachal pradesh", "jharkhand", "karnataka", "kerala", "madhya pradesh", "maharashtra", "manipur",
    "meghalaya", "mizoram", "nagaland", "odisha", "punjab", "rajasthan", "sikkim", "tamil nadu", "telangana",
    "tripura", "uttar pradesh", "uttarakhand", "west bengal", "andaman and nicobar islands", "chandigarh",
    "dadra and nagar haveli", "daman and diu", "lakshadweep", "puducherry", "jammu and kashmir", "ladakh",
}

COUNTRY_NAMES = {
    "afghanistan", "albania", "algeria", "andorra", "angola", "antigua and barbuda", "argentina", "armenia",
    "australia", "austria", "azerbaijan", "bahamas", "bahrain", "bangladesh", "barbados", "belarus", "belgium",
    "belize", "benin", "bhutan", "bolivia", "bosnia and herzegovina", "botswana", "brazil", "brunei", "bulgaria",
    "burkina faso", "burundi", "cambodia", "cameroon", "canada", "cape verde", "central african republic", "chad",
    "chile", "china", "colombia", "comoros", "congo", "costa rica", "croatia", "cuba", "cyprus", "czech republic",
    "denmark", "djibouti", "dominica", "dominican republic", "ecuador", "egypt", "el salvador", "equatorial guinea",
    "eritrea", "estonia", "eswatini", "ethiopia", "fiji", "finland", "france", "gabon", "gambia", "georgia",
    "germany", "ghana", "greece", "grenada", "guatemala", "guinea", "guinea-bissau", "guyana", "haiti", "honduras",
    "hungary", "iceland", "india", "indonesia", "iran", "iraq", "ireland", "israel", "italy", "ivory coast",
    "jamaica", "japan", "jordan", "kazakhstan", "kenya", "kiribati", "kuwait", "kyrgyzstan", "laos", "latvia",
    "lebanon", "lesotho", "liberia", "libya", "liechtenstein", "lithuania", "luxembourg", "madagascar", "malawi",
    "malaysia", "maldives", "mali", "malta", "marshall islands", "mauritania", "mauritius", "mexico", "micronesia",
    "moldova", "monaco", "mongolia", "montenegro", "morocco", "mozambique", "myanmar", "namibia", "nauru", "nepal",
    "netherlands", "new zealand", "nicaragua", "niger", "nigeria", "north korea", "north macedonia", "norway", "oman",
    "pakistan", "palau", "panama", "papua new guinea", "paraguay", "peru", "philippines", "poland", "portugal", "qatar",
    "romania", "russia", "rwanda", "saint kitts and nevis", "saint lucia", "saint vincent and the grenadines", "samoa",
    "san marino", "sao tome and principe", "saudi arabia", "senegal", "serbia", "seychelles", "sierra leone", "singapore",
    "slovakia", "slovenia", "solomon islands", "somalia", "south africa", "south korea", "south sudan", "spain", "sri lanka",
    "sudan", "suriname", "sweden", "switzerland", "syria", "taiwan", "tajikistan", "tanzania", "thailand", "timor-leste",
    "togo", "tonga", "trinidad and tobago", "tunisia", "turkey", "turkmenistan", "tuvalu", "uganda", "ukraine",
    "united arab emirates", "united kingdom", "united states", "uruguay", "uzbekistan", "vanuatu", "vatican city", "venezuela",
    "vietnam", "yemen", "zambia", "zimbabwe",
}

ALL_VAGUE_PLACES.update(US_STATES)
ALL_VAGUE_PLACES.update(UK_COUNTIES)
ALL_VAGUE_PLACES.update(INDIAN_STATES_UTS)
ALL_VAGUE_PLACES.update(COUNTRY_NAMES)


VAGUE_PLACE_PATTERNS = [
    re.compile(r"\b(empire|continent|subcontinent|hemisphere)\b", re.IGNORECASE),
]

COMPOSITE_SPLIT_REGEX = re.compile(r"\s*(?:;|/|\||&|\band\b)\s*", re.IGNORECASE)


NONFICTION_PATTERNS = [
    r"\bgazetteer\b",
    r"\bcensus\b",
    r"\bsurvey of\b",
    r"\bencyclop(?:a|e)dia\b",
    r"\bdictionary\b",
    r"\balmanac\b",
    r"\bhandbook\b",
    r"\bdirectory\b",
    r"\bbibliography\b",
    r"\bproceedings\b",
    r"\bjournal of\b",
    r"\btextbook\b",
    r"\bintroduction to\b",
    r"\bprinciples of\b",
    r"\bstudy guide\b",
    r"\bfield guide\b",
    r"\btravel guide\b",
]

NONFICTION_REGEXES = [re.compile(p, re.IGNORECASE) for p in NONFICTION_PATTERNS]

NONFICTION_SAFELIST = {
    "a lady cyclist's guide to kashgar",
    "an atlas of impossible longing",
    "the brief wondrous life of oscar wao",
    "a brief history of seven killings",
    "a dictionary of maqiao",
    "the future dictionary of america",
    "almanac of the dead",
    "principles of prediction",
    "the patna manual of style",
}


GENERIC_TITLES = {
    "poems", "selected works", "diary", "fragments", "letters", "complete works",
    "collected", "works", "songs", "verses",
}


LANGUAGE_NORMALIZATION = {
    "american english": "English",
    "british english": "English",
    "eng": "English",
    "en": "English",
    "unknown": "Unknown",
}


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def _canonical_city(s: str) -> str:
    n = _norm(s)
    return CITY_ALIASES.get(n, n)


def _is_vague_place(place_name: str) -> bool:
    p = _norm(place_name)
    if not p:
        return True
    if p in ALL_VAGUE_PLACES:
        return True
    for rgx in VAGUE_PLACE_PATTERNS:
        if rgx.search(p):
            return True
    return False


def _is_nonfiction_title(title: str) -> bool:
    t = _norm(title)
    if not t:
        return False
    if t in NONFICTION_SAFELIST:
        return False
    return any(rgx.search(t) for rgx in NONFICTION_REGEXES)


def _is_ambiguous_title(title: str) -> bool:
    t = _norm(title)
    if not t:
        return True
    if re.fullmatch(r"q\d+", t):
        return True
    if t in GENERIC_TITLES:
        return True
    if len(t) <= 2:
        return True
    return False


def _place_granularity(entry: dict) -> str:
    place_name = _norm(entry.get("placeName", ""))
    if not place_name:
        return "region"
    if _is_vague_place(place_name):
        return "region"
    # Multi-place strings are usually broader than a single precise map pin.
    if _is_composite_place_name(place_name):
        return "region"
    return "city"


def _is_composite_place_name(place_name: str) -> bool:
    p = _norm(place_name)
    if not p:
        return False
    parts = [x.strip() for x in COMPOSITE_SPLIT_REGEX.split(p) if x.strip()]
    return len(parts) > 1


def _split_place_name(place_name: str) -> list[str]:
    parts = [p.strip(" ,.-") for p in COMPOSITE_SPLIT_REGEX.split(place_name or "") if p.strip(" ,.-")]
    out: list[str] = []
    for p in parts:
        # Keep title casing from source but normalize repeated whitespace.
        n = re.sub(r"\s+", " ", p).strip()
        if n and n not in out:
            out.append(n)
    return out


def _average_coords(coords_list: list[tuple[float, float]]) -> tuple[float, float]:
    if not coords_list:
        return (0.0, 0.0)
    lon = sum(c[0] for c in coords_list) / len(coords_list)
    lat = sum(c[1] for c in coords_list) / len(coords_list)
    return (lon, lat)


def _build_place_coordinate_reference(rows: list[dict]) -> dict[str, tuple[float, float]]:
    buckets: dict[str, list[tuple[float, float]]] = defaultdict(list)
    for row in rows:
        place_name = str(row.get("placeName") or "").strip()
        if not place_name:
            continue
        if _is_composite_place_name(place_name):
            continue
        granularity = _place_granularity(row)
        if granularity != "city":
            continue
        coords = row.get("coordinates") or []
        if not (isinstance(coords, list) and len(coords) == 2):
            continue
        lon, lat = coords
        if not isinstance(lon, (int, float)) or not isinstance(lat, (int, float)):
            continue
        buckets[_norm(place_name)].append((float(lon), float(lat)))

    reference: dict[str, tuple[float, float]] = {}
    for place_key, coords_list in buckets.items():
        reference[place_key] = _average_coords(coords_list)
    return reference


def _enrich_geolocation_fields(row: dict) -> None:
    granularity = _place_granularity(row)
    row["placeGranularity"] = granularity

    source = str(row.get("coordinateSource") or row.get("source") or "dataset").strip().lower()
    if not source:
        source = "dataset"

    if granularity == "city":
        row.setdefault("coordinatePrecisionKm", 15)
        row.setdefault("coordinateConfidence", 0.85)
    else:
        row.setdefault("coordinatePrecisionKm", 120)
        row.setdefault("coordinateConfidence", 0.45)

    row["coordinateSource"] = source
    row["geolocationNeedsReview"] = bool(row.get("geolocationNeedsReview", False))


def _explode_composite_places(rows: list[dict], drop_unresolved: bool) -> tuple[list[dict], list[dict], int]:
    reference = _build_place_coordinate_reference(rows)
    kept: list[dict] = []
    removed: list[dict] = []
    expanded_count = 0

    for row in rows:
        place_name = str(row.get("placeName") or "").strip()
        if not _is_composite_place_name(place_name):
            kept.append(row)
            continue

        parts = _split_place_name(place_name)
        if len(parts) <= 1:
            kept.append(row)
            continue

        expanded_count += 1
        base_id = str(row.get("id") or "")
        unresolved_in_row = False

        for idx, part in enumerate(parts, start=1):
            part_key = _norm(part)
            clone = deepcopy(row)
            clone["id"] = f"{base_id}::p{idx}" if base_id else f"composite::{idx}::{part_key}"
            clone["placeName"] = part
            clone["compositeSourcePlaceName"] = place_name
            clone["compositeSplitPart"] = idx
            clone["compositeSplitTotal"] = len(parts)

            ref_coords = reference.get(part_key)
            if ref_coords is not None:
                clone["coordinates"] = [round(ref_coords[0], 6), round(ref_coords[1], 6)]
                clone["coordinateSource"] = "composite_split_reference"
                clone["coordinateConfidence"] = 0.8
                clone["coordinatePrecisionKm"] = 20
                clone["geolocationNeedsReview"] = False
            else:
                unresolved_in_row = True
                clone["coordinateSource"] = "composite_split_unresolved"
                clone["coordinateConfidence"] = 0.3
                clone["coordinatePrecisionKm"] = 250
                clone["geolocationNeedsReview"] = True

            _enrich_geolocation_fields(clone)

            if clone.get("geolocationNeedsReview") and drop_unresolved:
                removed.append(clone)
            else:
                kept.append(clone)

        if unresolved_in_row and drop_unresolved:
            removed.append(
                {
                    "id": row.get("id", ""),
                    "bookTitle": row.get("bookTitle", ""),
                    "author": row.get("author", ""),
                    "placeName": row.get("placeName", ""),
                    "reason": "composite_place_unresolved",
                }
            )

    return kept, removed, expanded_count


def _title_city_mentions(title: str) -> set[str]:
    t = _norm(title)
    mentions: set[str] = set()
    for alias, city in CITY_ALIASES.items():
        if alias in t:
            mentions.add(city)
    for demonym, city in CITY_DEMONYMS.items():
        if demonym in t:
            mentions.add(city)
    return mentions


def _is_title_city_mismatch(title: str, place_name: str) -> bool:
    mentions = _title_city_mentions(title)
    if len(mentions) != 1:
        return False
    mentioned = next(iter(mentions))
    place = _canonical_city(place_name)
    return mentioned != place


def _passage_source(entry: dict) -> str:
    src = _norm(str(entry.get("source", "")))
    if "openlibrary" in src:
        return "openlibrary"
    if src == "wikidata":
        return "wikidata"
    if "wiki" in src:
        return "wikipedia"
    if entry.get("openLibraryUrl"):
        return "openlibrary"
    return src or "unknown"


def _passage_type(entry: dict) -> str:
    passage = (entry.get("passage") or "").strip()
    if not passage:
        return "none"

    source = _passage_source(entry)
    plen = len(passage)
    low = passage.lower()

    if plen < 60:
        return "short_stub"

    if source == "wikidata" and plen < 320:
        return "wikidata_stub"

    if source == "openlibrary":
        return "ol_description"

    if source == "wikipedia":
        return "wikipedia_summary"

    # Heuristic: dialog-rich or long narrative-like text probably closer to excerpt
    dialogish = passage.count('"') >= 2 or "'" in passage
    if plen >= 400 and dialogish and not low.startswith(("this ", "a ", "an ", "the ")):
        return "literary_excerpt"

    return "other"


def _enrichment_method(entry: dict) -> str:
    sent = entry.get("sentiment", {}) or {}
    has_enrichment = bool(sent.get("themes") or sent.get("dominantEmotions"))
    has_passage = bool((entry.get("passage") or "").strip())
    if not has_enrichment:
        return "none"
    return "gemini_passage" if has_passage else "gemini_reputation"


def _normalize_language(entry: dict) -> None:
    raw = _norm(str(entry.get("language", "")))
    if raw in LANGUAGE_NORMALIZATION:
        entry["language"] = LANGUAGE_NORMALIZATION[raw]


def _quality_proxy(entry: dict) -> tuple:
    sent = entry.get("sentiment", {}) or {}
    themes = sent.get("themes", []) or []
    emotions = sent.get("dominantEmotions", []) or []
    passage_len = len((entry.get("passage") or "").strip())
    has_cover = bool(entry.get("coverUrl"))
    return (len(themes), len(emotions), passage_len, int(has_cover))


def _apply_filter(rows: list[dict], name: str, predicate) -> tuple[list[dict], list[dict]]:
    kept: list[dict] = []
    removed: list[dict] = []
    for row in rows:
        if predicate(row):
            removed.append(row)
        else:
            kept.append(row)
    return kept, removed


def _record_removed(removed_rows: list[dict], reason: str) -> list[dict]:
    out: list[dict] = []
    for r in removed_rows:
        out.append(
            {
                "id": r.get("id", ""),
                "bookTitle": r.get("bookTitle", ""),
                "author": r.get("author", ""),
                "placeName": r.get("placeName", ""),
                "reason": reason,
            }
        )
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Research-grade dataset cleanup")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument(
        "--keep-unresolved-composites",
        action="store_true",
        help="Keep unresolved composite-place split rows for manual review (strict mode drops by default)",
    )
    args = parser.parse_args()

    if not args.input.exists():
        raise SystemExit(f"Input file not found: {args.input}")

    payload = json.loads(args.input.read_text())
    rows = payload.get("places", [])
    original_total = len(rows)

    removed_manifest: list[dict] = []
    stage_counts: Counter = Counter()

    # Stage 1: vague places — retain rows but tag granularity for UI behavior.
    vague_tagged = 0
    for row in rows:
        granularity = _place_granularity(row)
        row["placeGranularity"] = granularity
        if granularity == "region":
            vague_tagged += 1
    stage_counts["vague_places_tagged"] = vague_tagged

    # Stage 2: non-fiction contamination
    rows, removed = _apply_filter(rows, "nonfiction", lambda r: _is_nonfiction_title(r.get("bookTitle", "")))
    stage_counts["nonfiction"] = len(removed)
    removed_manifest.extend(_record_removed(removed, "nonfiction_title"))

    # Stage 3: ambiguous title
    rows, removed = _apply_filter(rows, "ambiguous", lambda r: _is_ambiguous_title(r.get("bookTitle", "")))
    stage_counts["ambiguous_titles"] = len(removed)
    removed_manifest.extend(_record_removed(removed, "ambiguous_title"))

    # Stage 4: title-city mismatch
    rows, removed = _apply_filter(
        rows,
        "title_city_mismatch",
        lambda r: _is_title_city_mismatch(r.get("bookTitle", ""), r.get("placeName", "")),
    )
    stage_counts["title_city_mismatch"] = len(removed)
    removed_manifest.extend(_record_removed(removed, "title_city_mismatch"))

    # Stage 4b: split composite place labels into atomic places, and drop unresolved rows in strict mode.
    rows, composite_removed, expanded = _explode_composite_places(rows, drop_unresolved=not args.keep_unresolved_composites)
    stage_counts["composite_places_expanded"] = expanded
    stage_counts["composite_places_removed"] = len(composite_removed)
    removed_manifest.extend(
        composite_removed
        if composite_removed and isinstance(composite_removed[0], dict) and composite_removed[0].get("reason")
        else _record_removed(composite_removed, "composite_place_unresolved")
    )

    # Stage 5: dedupe by (title, author, place)
    grouped: dict[tuple[str, str, str], list[dict]] = defaultdict(list)
    for row in rows:
        key = (_norm(row.get("bookTitle", "")), _norm(row.get("author", "")), _norm(row.get("placeName", "")))
        grouped[key].append(row)

    deduped_rows: list[dict] = []
    dedup_removed: list[dict] = []
    for candidates in grouped.values():
        if len(candidates) == 1:
            deduped_rows.append(candidates[0])
            continue
        best = sorted(candidates, key=_quality_proxy, reverse=True)[0]
        deduped_rows.append(best)
        for c in candidates:
            if c is not best:
                dedup_removed.append(c)

    stage_counts["deduplicated"] = len(dedup_removed)
    removed_manifest.extend(_record_removed(dedup_removed, "duplicate_title_author_place"))
    rows = deduped_rows

    # Enrich provenance + normalize language
    for row in rows:
        _normalize_language(row)
        _enrich_geolocation_fields(row)
        row["passageSource"] = _passage_source(row)
        row["passageType"] = _passage_type(row)
        row["enrichmentMethod"] = _enrichment_method(row)

    output_payload = {**payload, "places": rows, "total": len(rows)}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output_payload, indent=2, ensure_ascii=False))

    manifest_payload = {
        "input": str(args.input),
        "output": str(args.output),
        "original_total": original_total,
        "final_total": len(rows),
        "removed_total": len(removed_manifest),
        "stage_counts": dict(stage_counts),
        "removed_entries": removed_manifest,
    }
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(json.dumps(manifest_payload, indent=2, ensure_ascii=False))

    print("=" * 68)
    print("DATA CLEANUP COMPLETE")
    print("=" * 68)
    print(f"Input total:  {original_total}")
    print(f"Final total:  {len(rows)}")
    print(f"Removed:      {len(removed_manifest)}")
    print("Stage removals:")
    for k, v in stage_counts.items():
        print(f"  - {k}: {v}")
    print(f"Cleaned output: {args.output}")
    print(f"Manifest:       {args.manifest}")


if __name__ == "__main__":
    main()
