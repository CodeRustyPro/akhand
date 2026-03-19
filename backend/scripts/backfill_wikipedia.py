#!/usr/bin/env python3
"""
Backfill missing passages using Wikipedia article summaries via Wikidata QIDs.

For each entry with a Wikidata QID but no passage, fetches the linked Wikipedia
article summary. This provides plot descriptions for notable books.

Usage:
  python -m backend.scripts.backfill_wikipedia
  python -m backend.scripts.backfill_wikipedia --limit 500
  python -m backend.scripts.backfill_wikipedia --input path/to/file.json
"""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

import httpx

DEFAULT_INPUT = Path(__file__).parent.parent / "data" / "generated" / "literary_places_passages_backfilled.json"
DEFAULT_OUTPUT = DEFAULT_INPUT

WIKIPEDIA_USER_AGENT = "Akhand Literary Geography Platform/0.1 (https://github.com/akhand)"


def _has_passage(entry: dict) -> bool:
    return bool((entry.get("passage") or "").strip())


async def _get_wikipedia_url_from_qid(client: httpx.AsyncClient, qid: str) -> str | None:
    """Get English Wikipedia article URL from a Wikidata QID."""
    url = f"https://www.wikidata.org/w/api.php"
    params = {
        "action": "wbgetentities",
        "ids": qid,
        "props": "sitelinks",
        "sitefilter": "enwiki",
        "format": "json",
    }
    try:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        entity = resp.json().get("entities", {}).get(qid, {})
        sitelinks = entity.get("sitelinks", {})
        enwiki = sitelinks.get("enwiki", {})
        title = enwiki.get("title")
        return title
    except Exception:
        return None


async def _get_wikipedia_summary(client: httpx.AsyncClient, title: str) -> str | None:
    """Fetch Wikipedia article summary via the REST API."""
    encoded = title.replace(" ", "_")
    url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{encoded}"
    try:
        resp = await client.get(url)
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        data = resp.json()
        extract = data.get("extract", "")
        if extract and len(extract) > 30:
            return extract[:800]
        return None
    except Exception:
        return None


async def _enrich_entry(client: httpx.AsyncClient, entry: dict) -> bool:
    """Try to fetch Wikipedia summary for an entry via its Wikidata QID."""
    qid = (entry.get("wikidataBookQid") or "").strip()
    if not qid:
        return False

    wiki_title = await _get_wikipedia_url_from_qid(client, qid)
    if not wiki_title:
        return False

    summary = await _get_wikipedia_summary(client, wiki_title)
    if not summary:
        return False

    entry["passage"] = summary
    return True


async def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill passages from Wikipedia summaries")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--limit", type=int, default=0, help="Max entries to attempt (0 = all)")
    parser.add_argument("--delay-seconds", type=float, default=0.3, help="Delay between requests")
    parser.add_argument("--timeout-seconds", type=float, default=12.0)
    args = parser.parse_args()

    if not args.input.exists():
        raise SystemExit(f"Input not found: {args.input}")

    with open(args.input) as f:
        payload = json.load(f)
    places = payload.get("places", [])

    candidates = [p for p in places if not _has_passage(p) and p.get("wikidataBookQid")]
    if args.limit > 0:
        candidates = candidates[:args.limit]

    print(f"Total places: {len(places)}")
    print(f"Candidates (no passage, has QID): {len(candidates)}")

    success = 0
    attempted = 0

    async with httpx.AsyncClient(
        timeout=args.timeout_seconds,
        headers={"User-Agent": WIKIPEDIA_USER_AGENT},
        follow_redirects=True,
    ) as client:
        for idx, entry in enumerate(candidates, start=1):
            attempted += 1
            ok = await _enrich_entry(client, entry)
            if ok:
                success += 1
                print(f"[{idx}/{len(candidates)}] OK  {entry.get('bookTitle', '')}")
            else:
                print(f"[{idx}/{len(candidates)}] SKIP {entry.get('bookTitle', '')}")
            await asyncio.sleep(args.delay_seconds)

    if "stats" not in payload or not isinstance(payload.get("stats"), dict):
        payload["stats"] = {}
    payload["stats"]["wikipedia_backfill_attempted"] = attempted
    payload["stats"]["wikipedia_backfill_success"] = success

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    print("=" * 72)
    print(f"Wikipedia backfill complete")
    print(f"Attempted: {attempted}")
    print(f"Successful: {success}")
    print(f"Output: {args.output}")


if __name__ == "__main__":
    asyncio.run(main())
