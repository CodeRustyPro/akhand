#!/usr/bin/env python3
"""
Select a high-impact, geographically diverse subset of unenriched rows for Gemini enrichment.

Selection priorities:
1) High Open Library edition counts (proxy for cultural prominence)
2) Canonical authors (frequency in corpus)
3) Geographic diversity across regions/countries/places

Outputs:
- newline-delimited row keys for nlp_batch --selection-file
- JSON report with diagnostics and selected rows
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import re
from collections import Counter
from pathlib import Path
from typing import Any

import httpx

DEFAULT_INPUT = Path(__file__).parent.parent / "data" / "generated" / "literary_places_cleaned_v2_tiered.json"
DEFAULT_KEYS_OUT = Path(__file__).parent.parent / "data" / "generated" / "selective_enrichment_top500.keys.txt"
DEFAULT_REPORT_OUT = Path(__file__).parent.parent / "data" / "generated" / "selective_enrichment_top500.report.json"
DEFAULT_CACHE = Path(__file__).parent.parent / "data" / "generated" / "selective_edition_cache.json"

OL_SEARCH_URL = "https://openlibrary.org/search.json"
USER_AGENT = "Akhand Selective Enrichment/1.0"


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def _row_key(index: int, row: dict[str, Any]) -> str:
    return f"{index}:{row.get('id', '')}"


def _is_unenriched(row: dict[str, Any]) -> bool:
    return (row.get("enrichmentMethod") or "none") == "none"


def _z(value: float, min_v: float, max_v: float) -> float:
    if max_v <= min_v:
        return 0.0
    return (value - min_v) / (max_v - min_v)


async def _fetch_edition_count(
    client: httpx.AsyncClient,
    semaphore: asyncio.Semaphore,
    title: str,
    author: str,
) -> int:
    params = {
        "title": title,
        "author": author,
        "limit": 1,
        "fields": "edition_count,key,title,author_name",
    }
    async with semaphore:
        try:
            resp = await client.get(OL_SEARCH_URL, params=params)
            resp.raise_for_status()
            docs = (resp.json() or {}).get("docs", [])
            if not docs:
                return 0
            return int(docs[0].get("edition_count") or 0)
        except Exception:
            return 0


async def _resolve_edition_counts(
    rows: list[tuple[int, dict[str, Any]]],
    cache: dict[str, int],
    concurrency: int,
) -> tuple[dict[str, int], int, int]:
    to_lookup: list[tuple[str, str, str]] = []
    for _idx, row in rows:
        title = str(row.get("bookTitle") or "").strip()
        author = str(row.get("author") or "").strip()
        if not title:
            continue
        k = f"{_norm(title)}||{_norm(author)}"
        if k not in cache:
            to_lookup.append((k, title, author))

    if not to_lookup:
        return cache, 0, 0

    semaphore = asyncio.Semaphore(max(concurrency, 1))
    looked_up = 0
    non_zero = 0

    async with httpx.AsyncClient(
        timeout=20.0,
        headers={"User-Agent": USER_AGENT},
    ) as client:
        tasks = [
            _fetch_edition_count(client, semaphore, title=title, author=author)
            for _k, title, author in to_lookup
        ]
        results = await asyncio.gather(*tasks)

    for (k, _t, _a), count in zip(to_lookup, results):
        cache[k] = int(count)
        looked_up += 1
        if count > 0:
            non_zero += 1

    return cache, looked_up, non_zero


def build_selection(
    rows: list[tuple[int, dict[str, Any]]],
    edition_cache: dict[str, int],
    limit: int,
) -> list[dict[str, Any]]:
    all_rows = [r for _idx, r in rows]
    author_freq = Counter(_norm(r.get("author", "")) for r in all_rows)

    author_titles: dict[str, set[str]] = {}
    for r in all_rows:
        a = _norm(r.get("author", ""))
        author_titles.setdefault(a, set()).add(_norm(r.get("bookTitle", "")))

    candidates: list[dict[str, Any]] = []
    for idx, row in rows:
        title = str(row.get("bookTitle") or "")
        author = str(row.get("author") or "")
        key = f"{_norm(title)}||{_norm(author)}"
        edition_count = int(edition_cache.get(key, 0))
        a_key = _norm(author)
        canon_raw = (0.6 * math.log1p(author_freq.get(a_key, 0))) + (
            0.4 * math.log1p(len(author_titles.get(a_key, set())))
        )
        passage_bonus = 0.15 if (row.get("passage") or "").strip() else 0.0

        candidates.append(
            {
                "index": idx,
                "id": row.get("id", ""),
                "row_key": _row_key(idx, row),
                "bookTitle": title,
                "author": author,
                "placeName": row.get("placeName", ""),
                "region": row.get("region", "Unknown") or "Unknown",
                "country": row.get("country", "Unknown") or "Unknown",
                "edition_count": edition_count,
                "canon_raw": canon_raw,
                "passage_bonus": passage_bonus,
            }
        )

    if not candidates:
        return []

    ed_min = min(c["edition_count"] for c in candidates)
    ed_max = max(c["edition_count"] for c in candidates)
    ca_min = min(c["canon_raw"] for c in candidates)
    ca_max = max(c["canon_raw"] for c in candidates)

    for c in candidates:
        c["edition_score"] = _z(c["edition_count"], ed_min, ed_max)
        c["canon_score"] = _z(c["canon_raw"], ca_min, ca_max)
        c["base_score"] = (0.72 * c["edition_score"]) + (0.28 * c["canon_score"]) + c["passage_bonus"]

    # Allocate region floors using sqrt-proportional quotas (less domination by huge regions).
    by_region: dict[str, list[dict[str, Any]]] = {}
    for c in candidates:
        by_region.setdefault(c["region"], []).append(c)

    total = len(candidates)
    regions = sorted(by_region.keys())
    sqrt_sum = sum(math.sqrt(len(by_region[r]) / total) for r in regions if len(by_region[r]) > 0)

    region_quota: dict[str, int] = {}
    for r in regions:
        if len(by_region[r]) == 0:
            region_quota[r] = 0
            continue
        q = int(limit * (math.sqrt(len(by_region[r]) / total) / max(sqrt_sum, 1e-9)))
        q = max(15, q)
        region_quota[r] = min(q, len(by_region[r]))

    # Normalize quotas to fit limit.
    quota_total = sum(region_quota.values())
    if quota_total > limit:
        ordered = sorted(regions, key=lambda r: region_quota[r], reverse=True)
        i = 0
        while quota_total > limit and ordered:
            r = ordered[i % len(ordered)]
            if region_quota[r] > 15:
                region_quota[r] -= 1
                quota_total -= 1
            i += 1
    elif quota_total < limit:
        ordered = sorted(regions, key=lambda r: len(by_region[r]) - region_quota[r], reverse=True)
        i = 0
        while quota_total < limit and ordered:
            r = ordered[i % len(ordered)]
            if region_quota[r] < len(by_region[r]):
                region_quota[r] += 1
                quota_total += 1
            i += 1

    selected: list[dict[str, Any]] = []
    region_counts: Counter = Counter()
    country_counts: Counter = Counter()
    place_counts: Counter = Counter()

    def _pick_from_pool(pool: list[dict[str, Any]], budget: int) -> list[dict[str, Any]]:
        picked: list[dict[str, Any]] = []
        local_pool = list(pool)
        while local_pool and len(picked) < budget:
            best_i = -1
            best_score = -1e9
            for i, c in enumerate(local_pool[: max(budget * 6, 400)]):
                diversity = (
                    (0.22 / (1 + region_counts[c["region"]]))
                    + (0.12 / (1 + country_counts[c["country"]]))
                    + (0.10 / (1 + place_counts[c["placeName"]]))
                )
                score = c["base_score"] + diversity
                if score > best_score:
                    best_score = score
                    best_i = i
            if best_i < 0:
                break
            c = local_pool.pop(best_i)
            c["final_score"] = best_score
            picked.append(c)
            region_counts[c["region"]] += 1
            country_counts[c["country"]] += 1
            place_counts[c["placeName"]] += 1
        return picked

    # Phase 1: satisfy region quotas.
    for r in regions:
        pool = sorted(by_region[r], key=lambda x: x["base_score"], reverse=True)
        selected.extend(_pick_from_pool(pool, region_quota[r]))

    # Phase 2: fill remainder globally with diversity bonuses.
    selected_row_keys = {s["row_key"] for s in selected}
    remainder_pool = [c for c in sorted(candidates, key=lambda x: x["base_score"], reverse=True) if c["row_key"] not in selected_row_keys]
    remaining_budget = max(0, limit - len(selected))
    if remaining_budget > 0:
        selected.extend(_pick_from_pool(remainder_pool, remaining_budget))

    return selected[:limit]


def main() -> None:
    parser = argparse.ArgumentParser(description="Select top-N unenriched rows for targeted enrichment")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--keys-out", type=Path, default=DEFAULT_KEYS_OUT)
    parser.add_argument("--report-out", type=Path, default=DEFAULT_REPORT_OUT)
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--limit", type=int, default=500)
    parser.add_argument("--concurrency", type=int, default=12)
    parser.add_argument("--refresh-cache", action="store_true")
    args = parser.parse_args()

    if not args.input.exists():
        raise SystemExit(f"Input not found: {args.input}")

    payload = json.loads(args.input.read_text())
    places = payload.get("places", [])

    candidates = [(idx, row) for idx, row in enumerate(places) if _is_unenriched(row)]

    if args.refresh_cache or not args.cache.exists():
        cache: dict[str, int] = {}
    else:
        cache = json.loads(args.cache.read_text())

    cache, looked_up, non_zero = asyncio.run(
        _resolve_edition_counts(candidates, cache=cache, concurrency=args.concurrency)
    )

    args.cache.parent.mkdir(parents=True, exist_ok=True)
    args.cache.write_text(json.dumps(cache, indent=2, ensure_ascii=False))

    selected = build_selection(candidates, edition_cache=cache, limit=args.limit)

    args.keys_out.parent.mkdir(parents=True, exist_ok=True)
    args.keys_out.write_text("\n".join(s["row_key"] for s in selected) + "\n")

    report = {
        "input": str(args.input),
        "candidates_unenriched": len(candidates),
        "selected": len(selected),
        "limit": args.limit,
        "edition_cache_size": len(cache),
        "edition_lookups_this_run": looked_up,
        "edition_non_zero_this_run": non_zero,
        "regions": dict(Counter(s["region"] for s in selected)),
        "countries": dict(Counter(s["country"] for s in selected)),
        "top20": selected[:20],
        "selected_rows": selected,
    }

    args.report_out.parent.mkdir(parents=True, exist_ok=True)
    args.report_out.write_text(json.dumps(report, indent=2, ensure_ascii=False))

    print("=" * 64)
    print("SELECTIVE ENRICHMENT SELECTION COMPLETE")
    print("=" * 64)
    print(f"Candidates (unenriched): {len(candidates)}")
    print(f"Selected: {len(selected)}")
    print(f"Edition cache size: {len(cache)}")
    print(f"Edition lookups this run: {looked_up} (non-zero: {non_zero})")
    print(f"Keys out: {args.keys_out}")
    print(f"Report out: {args.report_out}")


if __name__ == "__main__":
    main()
