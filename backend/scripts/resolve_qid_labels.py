#!/usr/bin/env python3
"""
Resolve unresolved Wikidata QID titles in generated Akhand datasets.

This script patches entries where bookTitle is still a raw QID string (e.g. Q12345)
by calling Wikidata's wbgetentities API in batches and selecting the best available
label using a language fallback chain.

Usage:
  python -m backend.scripts.resolve_qid_labels
  python -m backend.scripts.resolve_qid_labels --in-place
  python -m backend.scripts.resolve_qid_labels --drop-unresolved
"""

from __future__ import annotations

import argparse
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

DEFAULT_INPUT = Path(__file__).parent.parent / "data" / "generated" / "literary_places_wikidata.json"
DEFAULT_OUTPUT = Path(__file__).parent.parent / "data" / "generated" / "literary_places_wikidata_resolved.json"

WIKIDATA_API = "https://www.wikidata.org/w/api.php"

QID_RE = re.compile(r"^Q\d+$")


def _is_unresolved_qid_title(value: str) -> bool:
    return bool(QID_RE.fullmatch((value or "").strip()))


def _batched(items: list[str], size: int) -> list[list[str]]:
    return [items[i : i + size] for i in range(0, len(items), size)]


def _pick_label(labels: dict, lang_order: list[str]) -> str | None:
    for lang in lang_order:
        item = labels.get(lang)
        if item and item.get("value"):
            return item["value"]

    # Fallback to any available label if preferred languages are absent.
    for item in labels.values():
        value = item.get("value")
        if value:
            return value

    return None


def _fetch_labels_batch(qids: list[str], languages: list[str], user_agent: str) -> dict[str, str]:
    params = {
        "action": "wbgetentities",
        "format": "json",
        "props": "labels",
        "ids": "|".join(qids),
        "languages": "|".join(languages),
    }
    url = f"{WIKIDATA_API}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": user_agent})

    with urllib.request.urlopen(req, timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8", errors="ignore"))

    resolved: dict[str, str] = {}
    entities = payload.get("entities", {})
    for qid, entity in entities.items():
        labels = entity.get("labels", {})
        label = _pick_label(labels, languages)
        if label:
            resolved[qid] = label

    return resolved


def main() -> None:
    parser = argparse.ArgumentParser(description="Resolve unresolved Wikidata QID titles")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="Input merged dataset JSON")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Output patched dataset JSON")
    parser.add_argument("--in-place", action="store_true", help="Write back to input file")
    parser.add_argument("--drop-unresolved", action="store_true", help="Drop entries still unresolved after label lookup")
    parser.add_argument("--batch-size", type=int, default=50, help="Wikidata API IDs per request (max 50)")
    parser.add_argument("--sleep-seconds", type=float, default=0.2, help="Pause between API batches")
    parser.add_argument(
        "--languages",
        type=str,
        default="en,fr,de,es,it,sv,ja,ar",
        help="Language priority list for label resolution",
    )
    parser.add_argument(
        "--user-agent",
        type=str,
        default="Akhand Literary Geography Platform/0.1 (+https://github.com/akhand)",
        help="User-Agent for Wikidata API requests",
    )
    args = parser.parse_args()

    if not args.input.exists():
        raise SystemExit(f"Input file not found: {args.input}")

    with open(args.input) as f:
        payload = json.load(f)

    places = payload.get("places", [])
    langs = [x.strip() for x in args.languages.split(",") if x.strip()]

    targets = []
    unresolved_qids: set[str] = set()

    for idx, place in enumerate(places):
        if place.get("source") != "wikidata":
            continue

        title = str(place.get("bookTitle", "")).strip()
        if not _is_unresolved_qid_title(title):
            continue

        qid = str(place.get("wikidataBookQid", "")).strip() or title
        if not QID_RE.fullmatch(qid):
            continue

        targets.append((idx, qid))
        unresolved_qids.add(qid)

    print(f"Total places: {len(places)}")
    print(f"Unresolved QID-title entries: {len(targets)}")
    print(f"Unique unresolved book QIDs: {len(unresolved_qids)}")

    resolved_map: dict[str, str] = {}
    qid_list = sorted(unresolved_qids)
    batches = _batched(qid_list, max(1, min(args.batch_size, 50)))

    for i, batch in enumerate(batches, start=1):
        try:
            partial = _fetch_labels_batch(batch, languages=langs, user_agent=args.user_agent)
            resolved_map.update(partial)
            print(f"[{i}/{len(batches)}] fetched labels: {len(partial)}/{len(batch)}")
        except Exception as e:
            print(f"[{i}/{len(batches)}] batch failed: {e}")
        time.sleep(args.sleep_seconds)

    patched = 0
    for idx, qid in targets:
        label = resolved_map.get(qid)
        if label:
            places[idx]["bookTitle"] = label
            patched += 1

    still_unresolved_before_drop = 0
    for idx, _qid in targets:
        if _is_unresolved_qid_title(str(places[idx].get("bookTitle", "")).strip()):
            still_unresolved_before_drop += 1

    dropped = 0
    if args.drop_unresolved:
        filtered = []
        for place in places:
            if place.get("source") == "wikidata" and _is_unresolved_qid_title(str(place.get("bookTitle", "")).strip()):
                dropped += 1
                continue
            filtered.append(place)
        places = filtered
        payload["places"] = places

    payload["total"] = len(places)

    stats = payload.get("stats", {})
    stats["qid_titles_initial"] = len(targets)
    stats["qid_titles_patched"] = patched
    stats["qid_titles_still_unresolved"] = still_unresolved_before_drop
    stats["qid_titles_dropped"] = dropped
    payload["stats"] = stats

    output_path = args.input if args.in_place else args.output
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    print("=" * 72)
    print("QID label resolution complete")
    print("=" * 72)
    print(f"Patched titles: {patched}")
    print(f"Still unresolved: {still_unresolved_before_drop}")
    print(f"Dropped unresolved: {dropped}")
    print(f"Output: {output_path}")


if __name__ == "__main__":
    main()
