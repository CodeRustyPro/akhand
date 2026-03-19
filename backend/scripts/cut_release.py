#!/usr/bin/env python3
"""
Create a versioned dataset release from a cleaned literary places JSON.

Usage:
  python -m backend.scripts.cut_release \
    --input backend/data/generated/literary_places_release_v1.json \
    --report backend/data/generated/quality_report.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import date
from pathlib import Path

RELEASES_ROOT = Path(__file__).parent.parent / "data" / "releases"


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description="Cut a versioned Akhand dataset release")
    parser.add_argument("--input", type=Path, required=True, help="Cleaned canonical dataset JSON")
    parser.add_argument("--report", type=Path, default=None, help="Quality report JSON")
    parser.add_argument("--version", type=str, default=None, help="Release version (default: YYYY-MM-DD)")
    parser.add_argument(
        "--min-passing-ratio",
        type=float,
        default=0.60,
        help="Minimum passing/total ratio required in quality report when --report is provided",
    )
    args = parser.parse_args()

    if not args.input.exists():
        raise SystemExit(f"Input not found: {args.input}")
    if args.report and not args.report.exists():
        raise SystemExit(f"Report not found: {args.report}")

    version = args.version or date.today().isoformat()
    release_dir = RELEASES_ROOT / version
    release_dir.mkdir(parents=True, exist_ok=True)

    payload = json.loads(args.input.read_text())
    places = payload.get("places", [])

    out_data = release_dir / "literary_places.json"
    out_data.write_text(json.dumps(payload, indent=2, ensure_ascii=False))

    out_report = None
    report_meta = {}
    if args.report:
        report_obj = json.loads(args.report.read_text())
        total = int(report_obj.get("total") or 0)
        passing = int(report_obj.get("passing") or 0)
        ratio = (passing / total) if total else 0.0
        if ratio < args.min_passing_ratio:
            raise SystemExit(
                f"Refusing release cut: passing ratio {ratio:.3f} is below min {args.min_passing_ratio:.3f}."
            )

        out_report = release_dir / "quality_report.json"
        out_report.write_text(json.dumps(report_obj, indent=2, ensure_ascii=False))
        report_meta = {
            "threshold": report_obj.get("threshold"),
            "passing": report_obj.get("passing"),
            "failing": report_obj.get("failing"),
            "passing_ratio": round(ratio, 4),
        }

    manifest = release_dir / "MANIFEST.md"
    lines = [
        f"# Akhand Dataset Release {version}",
        "",
        "## Files",
        f"- literary_places.json: {len(places)} entries",
        f"- literary_places.json sha256: {_sha256(out_data)}",
    ]
    if out_report:
        lines.extend(
            [
                f"- quality_report.json sha256: {_sha256(out_report)}",
                "",
                "## Quality",
                f"- threshold: {report_meta.get('threshold')}",
                f"- passing: {report_meta.get('passing')}",
                f"- failing: {report_meta.get('failing')}",
                f"- passing_ratio: {report_meta.get('passing_ratio')}",
            ]
        )

    lines.extend(
        [
            "",
            "## Repro Commands",
            "1. Run nlp_batch enrichment on cleaned scaffold",
            "2. Run quality_gate with --reject",
            "3. Run cut_release with --input and --report",
            "",
            f"Built on: {date.today().isoformat()}",
        ]
    )

    manifest.write_text("\n".join(lines) + "\n")

    print(f"Release created: {release_dir}")
    print(f"Canonical dataset: {out_data}")
    print(f"Entries: {len(places)}")


if __name__ == "__main__":
    main()
