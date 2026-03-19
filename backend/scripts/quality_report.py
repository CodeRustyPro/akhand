#!/usr/bin/env python3
"""
Project-level quality report for generated literary datasets.

Checks:
- Completeness (passage/sentiment fields)
- Duplicate pressure by normalized title+author
- Non-fiction leakage heuristics
- Coordinate sanity (range/null-island)
- Diversity snapshots (source/region/language)

Usage:
  python -m backend.scripts.quality_report
  python -m backend.scripts.quality_report --input backend/data/generated/literary_places_wikidata_enriched.json
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path

DEFAULT_INPUT = Path(__file__).parent.parent / "data" / "generated" / "literary_places_wikidata_enriched.json"
DEFAULT_OUTPUT = Path(__file__).parent.parent / "data" / "generated" / "quality_metrics_v2.json"

NONFICTION_TOKENS = {
    "study guide",
    "supersummary",
    "sparknotes",
    "cliffsnotes",
    "encyclopedia",
    "dictionary",
    "gazetteer",
    "manual",
    "textbook",
    "history of",
}


def _norm(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().lower())


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate quality metrics for Akhand datasets")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="Input dataset JSON")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Write metrics JSON report")
    args = parser.parse_args()

    if not args.input.exists():
        raise SystemExit(f"Input file not found: {args.input}")

    payload = json.loads(args.input.read_text())
    places = payload.get("places", [])

    total = len(places)
    no_passage = 0
    no_emotions = 0
    no_themes = 0
    bad_coords = 0
    null_island = 0
    suspected_nonfiction = []
    passage_type_counter = Counter()
    passage_source_counter = Counter()
    quality_tier_counter = Counter()

    source_counter = Counter()
    region_counter = Counter()
    language_counter = Counter()
    key_counter = Counter()

    for p in places:
        title = p.get("bookTitle", "")
        author = p.get("author", "")
        source = p.get("source", "unknown") or "unknown"
        region = p.get("region", "Unknown") or "Unknown"
        language = p.get("language", "Unknown") or "Unknown"

        source_counter[source] += 1
        region_counter[region] += 1
        language_counter[language] += 1
        passage_type_counter[p.get("passageType", "unknown") or "unknown"] += 1
        passage_source_counter[p.get("passageSource", "unknown") or "unknown"] += 1
        quality_tier_counter[p.get("qualityTier", "unknown") or "unknown"] += 1
        key_counter[(_norm(title), _norm(author))] += 1

        passage = (p.get("passage") or "").strip()
        if not passage:
            no_passage += 1

        sentiment = p.get("sentiment", {}) or {}
        emotions = sentiment.get("dominantEmotions", []) or []
        themes = sentiment.get("themes", []) or []
        if not emotions:
            no_emotions += 1
        if not themes:
            no_themes += 1

        coords = p.get("coordinates", [])
        if not (isinstance(coords, list) and len(coords) == 2):
            bad_coords += 1
        else:
            lon, lat = coords
            if not isinstance(lon, (int, float)) or not isinstance(lat, (int, float)):
                bad_coords += 1
            else:
                if not (-180 <= lon <= 180 and -90 <= lat <= 90):
                    bad_coords += 1
                if abs(lon) < 0.01 and abs(lat) < 0.01:
                    null_island += 1

        title_lower = title.lower()
        if any(token in title_lower for token in NONFICTION_TOKENS):
            suspected_nonfiction.append(
                {
                    "title": title,
                    "author": author,
                    "source": source,
                    "place": p.get("placeName", ""),
                }
            )

    exact_dupe_rows = sum(v - 1 for v in key_counter.values() if v > 1)

    print("=" * 72)
    print("Akhand Quality Report")
    print("=" * 72)
    print(f"Input: {args.input}")
    print(f"Total entries: {total}")
    print("-" * 72)
    print(f"Missing passage: {no_passage}")
    print(f"Missing emotions: {no_emotions}")
    print(f"Missing themes: {no_themes}")
    print(f"Exact duplicate rows (title+author): {exact_dupe_rows}")
    print(f"Bad coordinates: {bad_coords}")
    print(f"Null island rows: {null_island}")
    print(f"Suspected non-fiction (heuristic): {len(suspected_nonfiction)}")
    print("-" * 72)
    print(f"Top sources: {source_counter.most_common(8)}")
    print(f"Top passage types: {passage_type_counter.most_common(8)}")
    print(f"Top passage sources: {passage_source_counter.most_common(8)}")
    print(f"Quality tiers: {quality_tier_counter.most_common(6)}")
    print(f"Top regions: {region_counter.most_common(8)}")
    print(f"Top languages: {language_counter.most_common(10)}")

    if suspected_nonfiction:
        print("-" * 72)
        print("Sample suspected non-fiction entries:")
        for row in suspected_nonfiction[:15]:
            print(f"  - {row['title']} | {row['author']} | {row['source']} | {row['place']}")

    metrics = {
        "input": str(args.input),
        "total": total,
        "missing": {
            "passage": no_passage,
            "emotions": no_emotions,
            "themes": no_themes,
        },
        "duplicates": {
            "exact_title_author": exact_dupe_rows,
        },
        "coordinates": {
            "bad": bad_coords,
            "null_island": null_island,
        },
        "suspected_nonfiction": len(suspected_nonfiction),
        "counters": {
            "source": dict(source_counter),
            "passageType": dict(passage_type_counter),
            "passageSource": dict(passage_source_counter),
            "qualityTier": dict(quality_tier_counter),
            "region": dict(region_counter),
            "language": dict(language_counter),
        },
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(metrics, indent=2, ensure_ascii=False))
    print("-" * 72)
    print(f"Metrics JSON written: {args.output}")


if __name__ == "__main__":
    main()
