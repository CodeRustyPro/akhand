#!/usr/bin/env python3
"""
Tier-based quality gate for literary places data.

Tiers:
- gold: strong evidence-backed enrichment
- silver: useful structured metadata with specific place granularity
- stub: incomplete or low-confidence rows kept for search/admin workflows
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path

DEFAULT_INPUT = Path(__file__).parent.parent / "data" / "generated" / "literary_places_cleaned_v2.json"
OUTPUT_DIR = Path(__file__).parent.parent / "data" / "generated"

PASSAGE_STUB_TYPES = {"none", "short_stub", "wikidata_stub"}

COMPOSITE_SEPARATORS = re.compile(r"\s*(?:;|/|\||&|\band\b)\s*", re.IGNORECASE)
BROAD_PLACE_HINTS = {
    "ocean",
    "sea",
    "coast",
    "peninsula",
    "kingdom",
    "region",
    "empire",
    "continent",
    "territory",
    "province",
    "state",
    "islands",
    "archipelago",
}
UNCERTAIN_LABEL_HINTS = {
    "unnamed",
    "unknown",
    "various",
    "multiple",
    "mixed",
    "unspecified",
}


def _norm(s: str) -> str:
    return (s or "").strip().lower()


def _has_gold_passage(entry: dict) -> bool:
    passage = (entry.get("passage") or "").strip()
    passage_type = _norm(entry.get("passageType", ""))
    return len(passage) >= 150 and passage_type not in PASSAGE_STUB_TYPES


def _themes_count(entry: dict) -> int:
    sent = entry.get("sentiment", {}) or {}
    return len(sent.get("themes", []) or [])


def _emotions_count(entry: dict) -> int:
    sent = entry.get("sentiment", {}) or {}
    return len(sent.get("dominantEmotions", []) or [])


def _polarity(entry: dict) -> float:
    sent = entry.get("sentiment", {}) or {}
    try:
        return float(sent.get("polarity", 0.0) or 0.0)
    except Exception:
        return 0.0


def _has_core_metadata(entry: dict) -> bool:
    title = (entry.get("bookTitle") or "").strip()
    author = (entry.get("author") or "").strip()
    year = int(entry.get("publishYear") or 0)
    return bool(title and author and year > 0)


def _specific_place(entry: dict) -> bool:
    granularity = _norm(entry.get("placeGranularity", "city"))
    return granularity != "region"


def _is_composite_label(entry: dict) -> bool:
    place_name = str(entry.get("placeName") or "")
    parts = [p.strip() for p in COMPOSITE_SEPARATORS.split(place_name) if p.strip()]
    return len(parts) > 1


def _is_broad_place_label(entry: dict) -> bool:
    place_name = _norm(entry.get("placeName", ""))
    granularity = _norm(entry.get("placeGranularity", "city"))
    if granularity == "region":
        return True
    return any(tok in place_name for tok in BROAD_PLACE_HINTS)


def _is_uncertain_label(entry: dict) -> bool:
    place_name = _norm(entry.get("placeName", ""))
    return any(tok in place_name for tok in UNCERTAIN_LABEL_HINTS)


def _coords_precision_risk(entry: dict) -> bool:
    coords = entry.get("coordinates") or []
    if not (isinstance(coords, list) and len(coords) == 2):
        return True
    lon, lat = coords
    if not isinstance(lon, (int, float)) or not isinstance(lat, (int, float)):
        return True
    # Very low decimal precision usually indicates coarse centroid placement.
    lon_decimals = len(str(abs(float(lon))).split(".")[1]) if "." in str(abs(float(lon))) else 0
    lat_decimals = len(str(abs(float(lat))).split(".")[1]) if "." in str(abs(float(lat))) else 0
    return min(lon_decimals, lat_decimals) <= 1


def geospatial_quality(entry: dict) -> tuple[float, list[str]]:
    score = 1.0
    reasons: list[str] = []

    if _is_composite_label(entry):
        score -= 0.45
        reasons.append("composite_place_label")

    if _is_broad_place_label(entry):
        score -= 0.30
        reasons.append("broad_or_region_place")

    if _is_uncertain_label(entry):
        score -= 0.35
        reasons.append("uncertain_place_label")

    if _coords_precision_risk(entry):
        score -= 0.15
        reasons.append("coarse_coordinate_precision")

    try:
        confidence = float(entry.get("coordinateConfidence", 0.0) or 0.0)
    except Exception:
        confidence = 0.0
    if confidence <= 0.35:
        score -= 0.25
        reasons.append("low_coordinate_confidence")

    try:
        precision_km = float(entry.get("coordinatePrecisionKm", 0.0) or 0.0)
    except Exception:
        precision_km = 0.0
    if precision_km >= 100:
        score -= 0.20
        reasons.append("low_spatial_precision")

    return max(0.0, score), reasons


def derive_tier(entry: dict) -> str:
    themes = _themes_count(entry)
    emotions = _emotions_count(entry)
    polarity = _polarity(entry)

    if _has_gold_passage(entry) and themes >= 3 and emotions >= 2 and polarity != 0.0:
        return "gold"

    if _has_core_metadata(entry) and _specific_place(entry):
        return "silver"

    return "stub"


def main() -> None:
    parser = argparse.ArgumentParser(description="Tier-based quality gate")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.55,
        help="Minimum overall quality score to pass when --reject is enabled",
    )
    parser.add_argument(
        "--geo-threshold",
        type=float,
        default=0.60,
        help="Minimum geospatial quality score required when --reject is enabled",
    )
    parser.add_argument(
        "--reject",
        action="store_true",
        help="Drop rows failing quality thresholds and keep passing rows only",
    )
    parser.add_argument(
        "--allow-composite",
        action="store_true",
        help="Do not auto-fail composite place labels (for exploratory runs)",
    )
    parser.add_argument("--output-report", type=Path, default=None)
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args()

    if not args.input.exists():
        raise SystemExit(f"Input file not found: {args.input}")

    payload = json.loads(args.input.read_text())
    places = payload.get("places", [])

    tier_counts: Counter = Counter()
    reason_counts: Counter = Counter()
    geo_reason_counts: Counter = Counter()
    tiered_places: list[dict] = []
    quality_entries: list[dict] = []
    passing_count = 0
    failing_count = 0

    for p in places:
        row = dict(p)
        tier = derive_tier(row)
        geo_score, geo_reasons = geospatial_quality(row)

        # Existing tier model remains primary, but geospatial confidence now matters.
        tier_score = {"gold": 1.0, "silver": 0.75, "stub": 0.35}[tier]
        overall_quality = round((tier_score * 0.7) + (geo_score * 0.3), 3)

        hard_fail = (not args.allow_composite) and ("composite_place_label" in geo_reasons)
        passes = (overall_quality >= args.threshold) and (geo_score >= args.geo_threshold) and (not hard_fail)

        row["qualityTier"] = tier
        row["geoQuality"] = geo_score
        row["geoRiskFlags"] = geo_reasons
        row["qualityScore"] = overall_quality
        row["qualityPassed"] = passes
        tiered_places.append(row)
        tier_counts[tier] += 1

        for reason in geo_reasons:
            geo_reason_counts[reason] += 1

        if passes:
            passing_count += 1
        else:
            failing_count += 1

        quality_entries.append(
            {
                "id": row.get("id", ""),
                "bookTitle": row.get("bookTitle", ""),
                "author": row.get("author", ""),
                "placeName": row.get("placeName", ""),
                "scores": {
                    "tier_score": tier_score,
                    "geo_score": geo_score,
                    "overall_quality": overall_quality,
                },
                "quality": overall_quality,
                "quality_passed": passes,
                "geo_risk_flags": geo_reasons,
            }
        )

        if tier == "stub":
            if not _specific_place(row):
                reason_counts["vague_or_region_place"] += 1
            if not _has_core_metadata(row):
                reason_counts["missing_core_metadata"] += 1
            if _themes_count(row) == 0 and _emotions_count(row) == 0:
                reason_counts["empty_enrichment"] += 1

    print("=" * 60)
    print("TIER QUALITY GATE")
    print("=" * 60)
    print(f"Input: {args.input}")
    print(f"Total: {len(tiered_places)}")
    print(f"Gold:  {tier_counts.get('gold', 0)}")
    print(f"Silver:{tier_counts.get('silver', 0)}")
    print(f"Stub:  {tier_counts.get('stub', 0)}")
    print(f"Pass:  {passing_count}  (threshold={args.threshold}, geo={args.geo_threshold})")
    print(f"Fail:  {failing_count}")

    report_path = args.output_report or (OUTPUT_DIR / "quality_report_v2.json")
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report = {
        "total": len(tiered_places),
        "threshold": args.threshold,
        "geo_threshold": args.geo_threshold,
        "passing": passing_count,
        "failing": failing_count,
        "tier_counts": dict(tier_counts),
        "stub_reasons": dict(reason_counts),
        "geo_risk_counts": dict(geo_reason_counts),
        "entries": quality_entries,
    }
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"Report written: {report_path}")

    if args.reject:
        kept = [p for p in tiered_places if bool(p.get("qualityPassed"))]
        out_path = args.output or args.input.with_stem(args.input.stem + "_tiered")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_payload = {**payload, "places": kept, "total": len(kept)}
        out_path.write_text(json.dumps(out_payload, indent=2, ensure_ascii=False))
        print(f"Cleaned file ({len(kept)} entries): {out_path}")
    else:
        out_path = args.output or args.input.with_stem(args.input.stem + "_tiered")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_payload = {**payload, "places": tiered_places, "total": len(tiered_places)}
        out_path.write_text(json.dumps(out_payload, indent=2, ensure_ascii=False))
        print(f"Tiered file ({len(tiered_places)} entries): {out_path}")


if __name__ == "__main__":
    main()
