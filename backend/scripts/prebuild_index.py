#!/usr/bin/env python3
"""
Generate a slim static index + per-entry detail JSONs for the frontend.

Outputs:
  frontend/public/data/index.json       — slim array for map rendering
  frontend/public/data/details/{id}.json — full data per entry (loaded on click)

Usage:
  python -m backend.scripts.prebuild_index
  python -m backend.scripts.prebuild_index --input path/to/file.json
"""

import argparse
import base64
import json
from pathlib import Path

CANDIDATES = [
    Path(__file__).parent.parent / "data" / "generated" / "literary_places_release_v1.json",
    Path(__file__).parent.parent / "data" / "generated" / "literary_places_cleaned_enriched.json",
    Path(__file__).parent.parent / "data" / "generated" / "literary_places_wikidata_enriched.json",
    Path(__file__).parent.parent / "data" / "generated" / "literary_places_enriched.json",
    Path(__file__).parent.parent / "data" / "generated" / "literary_places.json",
]

FRONTEND_PUBLIC = Path(__file__).parent.parent.parent / "frontend" / "public" / "data"


def detail_filename(entry_id: str) -> str:
    """Return a static-server-safe filename for a detail JSON entry."""
    encoded = base64.urlsafe_b64encode(entry_id.encode("utf-8")).decode("ascii").rstrip("=")
    return f"{encoded}.json"


def _compute_quality_tier(p: dict) -> str:
    """Derive Gold/Silver/Stub quality tier from entry data."""
    sent = p.get("sentiment", {})
    themes = sent.get("themes", []) or []
    emotions = sent.get("dominantEmotions", []) or []
    polarity = float(sent.get("polarity", 0.0) or 0.0)
    has_passage = bool((p.get("passage") or "").strip())
    passage_len = len((p.get("passage") or "").strip())
    passage_type = str(p.get("passageType") or "").strip().lower()
    place_granularity = str(p.get("placeGranularity") or "city").strip().lower()

    if has_passage and passage_len >= 150 and passage_type not in {"none", "short_stub", "wikidata_stub"} and len(themes) >= 3 and len(emotions) >= 2 and polarity != 0.0:
        return "gold"

    has_core = bool((p.get("bookTitle") or "").strip() and (p.get("author") or "").strip() and int(p.get("publishYear") or 0) > 0)
    if has_core and place_granularity != "region":
        return "silver"

    return "stub"


def slim_entry(p: dict) -> dict:
    """Extract only the fields needed for map rendering and search list."""
    coords = p.get("coordinates", [0, 0])
    genres = p.get("genres", []) or []
    themes = p.get("sentiment", {}).get("themes", []) or []
    return {
        "id": p.get("id", ""),
        "bookTitle": p.get("bookTitle", ""),
        "author": p.get("author", ""),
        "placeName": p.get("placeName", ""),
        "coordinates": coords,
        "region": p.get("region", ""),
        "sp": p.get("sentiment", {}).get("polarity", 0.0),
        "qt": p.get("qualityTier") or _compute_quality_tier(p),
        "pg": p.get("placeGranularity", "city"),
        "publishYear": p.get("publishYear", 0),
        "coverUrl": p.get("coverUrl") or "",
        "language": p.get("language", "English"),
        "g": genres[:3] if genres else [],  # Top 3 genres for filters
        "t": themes[:5] if themes else [],  # Top 5 themes for filters
    }


def detail_entry_with_schema(p: dict) -> dict:
    """Attach Schema.org-compatible fields to detail payloads."""
    detail = dict(p)
    coords = p.get("coordinates", [None, None])
    same_as: list[str] = []

    wikidata_id = p.get("wikidataBookId")
    if wikidata_id:
        same_as.append(f"https://www.wikidata.org/wiki/{wikidata_id}")

    ol_url = p.get("openLibraryUrl")
    ol_key = p.get("openLibraryKey")
    if ol_url:
        same_as.append(str(ol_url))
    elif ol_key:
        same_as.append(f"https://openlibrary.org{ol_key}")

    if isinstance(coords, list) and len(coords) == 2:
        detail["@context"] = "https://schema.org"
        detail["@type"] = "Book"
        detail["spatialCoverage"] = {
            "@type": "Place",
            "name": p.get("placeName", ""),
            "geo": {
                "@type": "GeoCoordinates",
                "longitude": coords[0],
                "latitude": coords[1],
            },
        }
        detail["contentLocation"] = detail["spatialCoverage"]

    if same_as:
        detail["sameAs"] = same_as

    return detail


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate frontend static data files")
    parser.add_argument("--input", type=Path, default=None, help="Input JSON path")
    parser.add_argument("--output-dir", type=Path, default=FRONTEND_PUBLIC, help="Output directory")
    args = parser.parse_args()

    # Find input
    input_path = args.input
    if input_path is None:
        releases_root = Path(__file__).parent.parent / "data" / "releases"
        if releases_root.exists() and releases_root.is_dir():
            release_candidates = sorted(releases_root.glob("*/literary_places.json"), reverse=True)
            if release_candidates:
                input_path = release_candidates[0]
        if input_path is None:
            for candidate in CANDIDATES:
                if candidate.exists():
                    input_path = candidate
                    break
    if input_path is None or not input_path.exists():
        raise SystemExit(f"No input file found. Tried: {CANDIDATES}")

    print(f"Reading: {input_path}")
    with open(input_path) as f:
        data = json.load(f)
    places = data.get("places", [])
    print(f"Total entries: {len(places)}")

    output_dir = args.output_dir
    details_dir = output_dir / "details"
    details_dir.mkdir(parents=True, exist_ok=True)

    # Remove stale detail artifacts so output stays deterministic across runs.
    for old_file in details_dir.glob("*.json"):
        old_file.unlink()

    # Write slim index
    index = [slim_entry(p) for p in places]
    index_path = output_dir / "index.json"
    index_path.write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")))
    index_kb = index_path.stat().st_size / 1024
    print(f"Wrote index: {index_path} ({index_kb:.0f} KB, {len(index)} entries)")

    # Write per-entry detail files
    for p in places:
        entry_id = p.get("id", "")
        if not entry_id:
            continue
        detail_path = details_dir / detail_filename(entry_id)
        detail_path.write_text(json.dumps(detail_entry_with_schema(p), ensure_ascii=False, separators=(",", ":")))

    print(f"Wrote {len(places)} detail files to {details_dir}/")


if __name__ == "__main__":
    main()
