#!/usr/bin/env python3
"""
Merge passage backfill outputs into the base dataset.

Combines passages from multiple backfill sources (OL/Wikidata, Wikipedia)
into a single dataset. When multiple sources have a passage for the same
entry, keeps the longer one.

Usage:
  python -m backend.scripts.merge_passages
  python -m backend.scripts.merge_passages --base path/to/base.json --sources a.json b.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

GENERATED = Path(__file__).parent.parent / "data" / "generated"

DEFAULT_BASE = GENERATED / "literary_places_cleaned_for_enrichment.json"
DEFAULT_SOURCES = [
    GENERATED / "literary_places_passages_backfilled.json",
    GENERATED / "literary_places_wikipedia_backfilled.json",
]
DEFAULT_OUTPUT = GENERATED / "literary_places_passages_merged.json"

# Minimum passage length to accept. Shorter values are usually Wikidata
# descriptions like "book", "Kinderbuch", "Bande dessinée" — not useful.
MIN_PASSAGE_LENGTH = 60


def _passage_text(entry: dict) -> str:
    return (entry.get("passage") or "").strip()


def main() -> None:
    parser = argparse.ArgumentParser(description="Merge passage backfill outputs")
    parser.add_argument("--base", type=Path, default=DEFAULT_BASE, help="Base dataset (scaffold)")
    parser.add_argument("--sources", type=Path, nargs="+", default=DEFAULT_SOURCES, help="Backfill output files to merge from")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--min-length", type=int, default=MIN_PASSAGE_LENGTH,
                        help=f"Reject passages shorter than N chars (default {MIN_PASSAGE_LENGTH})")
    args = parser.parse_args()

    if not args.base.exists():
        raise SystemExit(f"Base file not found: {args.base}")

    with open(args.base) as f:
        base_data = json.load(f)
    base_places = base_data.get("places", [])

    # Build index: id -> list index (handle duplicates by keeping all)
    id_to_indices: dict[str, list[int]] = {}
    for i, p in enumerate(base_places):
        pid = p.get("id", "")
        if pid:
            id_to_indices.setdefault(pid, []).append(i)

    # Collect best passage per ID from all sources
    best_passages: dict[str, tuple[str, str]] = {}
    source_stats: dict[str, int] = {}

    for source_path in args.sources:
        if not source_path.exists():
            print(f"SKIP (not found): {source_path}")
            continue

        print(f"Reading source: {source_path}")
        with open(source_path) as f:
            source_data = json.load(f)
        source_places = source_data.get("places", [])

        contributed = 0
        rejected_short = 0
        for sp in source_places:
            pid = sp.get("id", "")
            passage = _passage_text(sp)
            if not pid or not passage:
                continue
            if len(passage) < args.min_length:
                rejected_short += 1
                continue

            existing, _src = best_passages.get(pid, ("", "unknown"))
            if len(passage) > len(existing):
                source_name = source_path.name.lower()
                if "openlibrary" in source_name or "passages_backfilled" in source_name:
                    source_tag = "openlibrary"
                elif "wikipedia" in source_name:
                    source_tag = "wikipedia"
                else:
                    source_tag = "unknown"
                best_passages[pid] = (passage, source_tag)
                contributed += 1

        source_stats[source_path.name] = contributed
        print(f"  Entries with passages: {contributed}")
        if rejected_short:
            print(f"  Rejected (too short, <{args.min_length} chars): {rejected_short}")

    # Strip stub passages from base that are below minimum length
    base_stubs_cleared = 0
    for p in base_places:
        passage = _passage_text(p)
        if passage and len(passage) < args.min_length:
            p["passage"] = ""
            base_stubs_cleared += 1
    if base_stubs_cleared:
        print(f"Cleared {base_stubs_cleared} stub passages from base (<{args.min_length} chars)")

    # Apply merged passages to base
    applied = 0
    upgraded = 0
    for pid, packed in best_passages.items():
        passage, source_tag = packed
        indices = id_to_indices.get(pid, [])
        for idx in indices:
            old_passage = _passage_text(base_places[idx])
            if not old_passage:
                applied += 1
            elif len(passage) > len(old_passage):
                upgraded += 1
            base_places[idx]["passage"] = passage
            base_places[idx]["passageSource"] = source_tag

    # Update stats
    if "stats" not in base_data or not isinstance(base_data.get("stats"), dict):
        base_data["stats"] = {}
    base_data["stats"]["passage_merge_sources"] = {k: v for k, v in source_stats.items()}
    base_data["stats"]["passage_merge_new"] = applied
    base_data["stats"]["passage_merge_upgraded"] = upgraded
    base_data["stats"]["passage_merge_total"] = applied + upgraded

    # Count passage coverage
    has_passage = sum(1 for p in base_places if _passage_text(p))
    total = len(base_places)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w") as f:
        json.dump(base_data, f, indent=2, ensure_ascii=False)

    print("=" * 60)
    print(f"Merge complete")
    print(f"  New passages added: {applied}")
    print(f"  Passages upgraded (longer): {upgraded}")
    print(f"  Total with passage: {has_passage}/{total} ({100*has_passage/total:.1f}%)")
    print(f"  Output: {args.output}")


if __name__ == "__main__":
    main()
