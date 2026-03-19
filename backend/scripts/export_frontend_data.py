#!/usr/bin/env python3
"""
Export enriched literary places JSON to frontend/src/lib/data.ts.

Reads the best available enriched JSON and generates a TypeScript file
with all entries as a typed array, plus an updated THEMES list extracted
from all entries.

Usage:
  python -m backend.scripts.export_frontend_data
  python -m backend.scripts.export_frontend_data --input path/to/file.json
"""

import json
import argparse
from pathlib import Path
from collections import Counter

CANDIDATES = [
    Path(__file__).parent.parent / "data" / "releases",
    Path(__file__).parent.parent / "data" / "generated" / "literary_places_release_v1.json",
    Path(__file__).parent.parent / "data" / "generated" / "literary_places_cleaned_enriched.json",
    Path(__file__).parent.parent / "data" / "generated" / "literary_places_wikidata_enriched.json",
    Path(__file__).parent.parent / "data" / "generated" / "literary_places_enriched.json",
    Path(__file__).parent.parent / "data" / "generated" / "literary_places.json",
]

OUTPUT = Path(__file__).parent.parent.parent / "frontend" / "src" / "lib" / "data.ts"


def _js_string(s: str) -> str:
    """Escape a string for JS single-quoted literal."""
    return s.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n").replace("\r", "")


def _js_array(items: list[str], quote: bool = True) -> str:
    if not items:
        return "[]"
    if quote:
        return "[" + ", ".join(f"'{_js_string(s)}'" for s in items) + "]"
    return "[" + ", ".join(str(s) for s in items) + "]"


def _compute_quality_tier(p: dict) -> str:
    """Derive Gold/Silver/Stub tier when missing from source."""
    sent = p.get("sentiment", {})
    themes = sent.get("themes", []) or []
    emotions = sent.get("dominantEmotions", []) or []
    has_passage = bool((p.get("passage") or "").strip())
    passage_len = len((p.get("passage") or "").strip())
    passage_type = (p.get("passageType") or "").strip().lower()
    place_granularity = (p.get("placeGranularity") or "city").strip().lower()
    polarity = float(sent.get("polarity", 0.0) or 0.0)

    if has_passage and passage_len >= 150 and passage_type not in {"none", "short_stub", "wikidata_stub"} and len(themes) >= 3 and len(emotions) >= 2 and polarity != 0.0:
        return "gold"

    has_core = bool((p.get("bookTitle") or "").strip() and (p.get("author") or "").strip() and int(p.get("publishYear") or 0) > 0)
    if has_core and place_granularity != "region":
        return "silver"

    return "stub"


def place_to_ts(p: dict) -> str:
    """Convert a place dict to a TypeScript object literal."""
    sent = p.get("sentiment", {})
    polarity = sent.get("polarity", 0.0)
    emotions = sent.get("dominantEmotions", [])
    themes = sent.get("themes", [])
    quality_tier = p.get("qualityTier") or _compute_quality_tier(p)

    coords = p.get("coordinates", [0, 0])
    passage = _js_string(p.get("passage", "") or "")
    cover = p.get("coverUrl") or ""

    lines = [
        "  {",
        f"    id: '{_js_string(p.get('id', ''))}',",
        f"    bookTitle: '{_js_string(p.get('bookTitle', ''))}',",
        f"    author: '{_js_string(p.get('author', 'Unknown'))}',",
        f"    publishYear: {p.get('publishYear', 0)},",
        f"    placeName: '{_js_string(p.get('placeName', ''))}',",
        f"    coordinates: [{coords[0]}, {coords[1]}] as [number, number],",
        f"    placeType: '{p.get('placeType', 'real')}',",
        f"    settingType: '{p.get('settingType', 'primary')}',",
        f"    narrativeEra: '{_js_string(p.get('narrativeEra', ''))}',",
        f"    passage: '{passage}',",
        f"    sentiment: {{ polarity: {polarity}, dominantEmotions: {_js_array(emotions)}, themes: {_js_array(themes)} }},",
        f"    qualityTier: '{quality_tier}' as const,",
        f"    passageType: '{_js_string(p.get('passageType', 'none'))}',",
        f"    passageSource: '{_js_string(p.get('passageSource', 'unknown'))}',",
        f"    enrichmentMethod: '{_js_string(p.get('enrichmentMethod', 'none'))}',",
        f"    language: '{_js_string(p.get('language', 'English'))}',",
        f"    genres: {_js_array(p.get('genres', []))},",
        f"    region: '{_js_string(p.get('region', ''))}',",
    ]

    if cover:
        lines.append(f"    coverUrl: '{_js_string(cover)}',")

    ol_key = p.get("openLibraryKey")
    if ol_key:
        lines.append(f"    openLibraryKey: '{_js_string(ol_key)}',")

    lines.append("  }")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Export enriched data to frontend data.ts")
    parser.add_argument("--input", type=Path, default=None, help="Input JSON path")
    parser.add_argument("--hero-limit", type=int, default=0, help="Limit to top N entries (by quality score) for a slim fallback bundle. 0 = all.")
    args = parser.parse_args()

    # Find input
    input_path = args.input
    if input_path is None:
        releases_root = CANDIDATES[0]
        if releases_root.exists() and releases_root.is_dir():
            release_candidates = sorted(releases_root.glob("*/literary_places.json"), reverse=True)
            if release_candidates:
                input_path = release_candidates[0]
        if input_path is None:
            for candidate in CANDIDATES:
                if candidate.is_dir():
                    continue
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

    # Apply hero limit if set — keep entries with best enrichment scores
    if args.hero_limit and args.hero_limit > 0 and len(places) > args.hero_limit:
        def _hero_score(p: dict) -> float:
            """Quick quality heuristic for hero selection."""
            s = 0.0
            sent = p.get("sentiment", {}) or {}
            if len(sent.get("dominantEmotions", []) or []) >= 3:
                s += 2
            if len(sent.get("themes", []) or []) >= 2:
                s += 2
            if sent.get("polarity", 0.0) != 0.0:
                s += 1
            if p.get("passage") and len(p.get("passage", "")) > 50:
                s += 2
            if p.get("coverUrl"):
                s += 1
            return s

        places = sorted(places, key=_hero_score, reverse=True)[:args.hero_limit]
        print(f"Hero limit applied: keeping top {args.hero_limit} entries")

    # Collect all themes
    theme_counter: Counter = Counter()
    for p in places:
        for t in p.get("sentiment", {}).get("themes", []):
            theme_counter[t] = theme_counter.get(t, 0) + 1
    # Keep themes that appear at least twice
    all_themes = sorted(t for t, c in theme_counter.items() if c >= 2)
    print(f"Unique themes (appearing 2+ times): {len(all_themes)}")

    # Build JSON payload for data export to avoid giant TS literal inference costs.
    export_rows = []
    for p in places:
        row = dict(p)
        row["qualityTier"] = row.get("qualityTier") or _compute_quality_tier(row)
        row["placeGranularity"] = row.get("placeGranularity") or "city"
        row["passageType"] = row.get("passageType") or "none"
        row["passageSource"] = row.get("passageSource") or "unknown"
        row["enrichmentMethod"] = row.get("enrichmentMethod") or "none"
        export_rows.append(row)

    # Use a double-encoded JSON string literal so JS parsing is always safe.
    places_json_literal = json.dumps(json.dumps(export_rows, ensure_ascii=False), ensure_ascii=False)

    ts_content = f"""import {{ LiteraryPlace }} from './types';

export function sentimentColor(polarity: number): [number, number, number] {{
    if (polarity >= 0.2) return [34, 197, 94];
    if (polarity <= -0.2) return [239, 68, 68];
    return [196, 154, 108];
}}

export const THEMES: string[] = {_js_array(all_themes)}.sort();

export const literaryPlaces: LiteraryPlace[] = JSON.parse({places_json_literal}) as LiteraryPlace[];
"""

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT, "w") as f:
        f.write(ts_content)

    size_kb = OUTPUT.stat().st_size / 1024
    print(f"Wrote: {OUTPUT} ({size_kb:.0f} KB, {len(places)} entries)")


if __name__ == "__main__":
    main()
