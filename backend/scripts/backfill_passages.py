#!/usr/bin/env python3
"""
Backfill missing `passage` values in generated datasets using Open Library works.

This script is intended for quality improvements after bulk ingest/merge.
It only updates entries with empty passages and leaves all other fields intact.

Usage:
  python -m backend.scripts.backfill_passages
  python -m backend.scripts.backfill_passages --limit 200
  python -m backend.scripts.backfill_passages --source wikidata --delay-seconds 0.5
"""

from __future__ import annotations

import argparse
import asyncio
import json
import urllib.parse
import urllib.request
from pathlib import Path

import httpx

from backend.data.openlibrary import USER_AGENT as OL_USER_AGENT
from backend.data.openlibrary import fetch_work_description

DEFAULT_INPUT = Path(__file__).parent.parent / "data" / "generated" / "literary_places_wikidata_enriched.json"
DEFAULT_OUTPUT = DEFAULT_INPUT


def _has_passage(entry: dict) -> bool:
    return bool((entry.get("passage") or "").strip())


async def _search_openlibrary_work_key(title: str, author: str, timeout: float) -> str | None:
    params = {
        "title": title,
        "author": author,
        "limit": 1,
        "fields": "key,title,author_name",
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.get(
            "https://openlibrary.org/search.json",
            params=params,
            headers={"User-Agent": OL_USER_AGENT},
        )
        resp.raise_for_status()
        docs = resp.json().get("docs", [])
    if not docs:
        return None
    key = docs[0].get("key")
    return key if isinstance(key, str) and key.startswith("/works/") else None


async def _enrich_entry(entry: dict, timeout: float) -> bool:
    title = (entry.get("bookTitle") or "").strip()
    author = (entry.get("author") or "").strip()
    if not title:
        return False

    try:
        if entry.get("openLibraryKey"):
            work_key = entry["openLibraryKey"]
        else:
            work_key = await _search_openlibrary_work_key(title=title, author=author, timeout=timeout)
        if not work_key:
            return False

        desc = await fetch_work_description(work_key)
        if not desc:
            return False

        entry["passage"] = desc[:800]
        entry["openLibraryKey"] = work_key
        entry["openLibraryUrl"] = f"https://openlibrary.org{work_key}"
        return True
    except Exception:
        return False


def _fetch_wikidata_description(qid: str, languages: list[str], user_agent: str) -> str | None:
    if not qid or not qid.startswith("Q"):
        return None

    params = {
        "action": "wbgetentities",
        "format": "json",
        "props": "descriptions",
        "ids": qid,
        "languages": "|".join(languages),
    }
    url = f"https://www.wikidata.org/w/api.php?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": user_agent})
    with urllib.request.urlopen(req, timeout=20) as response:
        payload = json.loads(response.read().decode("utf-8", errors="ignore"))

    entity = (payload.get("entities") or {}).get(qid, {})
    descriptions = entity.get("descriptions", {})

    for lang in languages:
        candidate = descriptions.get(lang, {})
        text = (candidate.get("value") or "").strip()
        if text:
            return text

    for candidate in descriptions.values():
        text = (candidate.get("value") or "").strip()
        if text:
            return text
    return None


async def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill missing passages from Open Library")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="Input generated dataset")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Output dataset path")
    parser.add_argument(
        "--source",
        type=str,
        default="wikidata",
        help="Only backfill entries with this source (use 'all' to include every source)",
    )
    parser.add_argument("--limit", type=int, default=200, help="Max entries to attempt")
    parser.add_argument("--delay-seconds", type=float, default=0.4, help="Delay between requests")
    parser.add_argument("--timeout-seconds", type=float, default=12.0, help="HTTP timeout")
    parser.add_argument(
        "--wikidata-fallback",
        action="store_true",
        help="Use Wikidata descriptions as fallback when Open Library descriptions are missing",
    )
    parser.add_argument(
        "--wikidata-languages",
        type=str,
        default="en,fr,de,es,it,sv,ja,ar",
        help="Preferred language order for Wikidata description fallback",
    )
    parser.add_argument(
        "--wikidata-user-agent",
        type=str,
        default="Akhand Literary Geography Platform/0.1 (+https://github.com/akhand)",
        help="User-Agent for Wikidata API requests",
    )
    args = parser.parse_args()

    if not args.input.exists():
        raise SystemExit(f"Input not found: {args.input}")

    with open(args.input) as f:
        payload = json.load(f)
    places = payload.get("places", [])

    candidates = []
    for entry in places:
        if _has_passage(entry):
            continue
        if args.source != "all" and (entry.get("source") or "") != args.source:
            continue
        candidates.append(entry)

    if args.limit > 0:
        candidates = candidates[: args.limit]

    print(f"Total places: {len(places)}")
    print(f"Candidates with empty passage (source={args.source}): {len(candidates)}")

    wd_languages = [x.strip() for x in args.wikidata_languages.split(",") if x.strip()]

    success = 0
    attempted = 0
    fallback_success = 0
    for idx, entry in enumerate(candidates, start=1):
        attempted += 1
        ok = await _enrich_entry(entry, timeout=args.timeout_seconds)
        if not ok and args.wikidata_fallback:
            qid = (entry.get("wikidataBookQid") or entry.get("wikidataBookId") or "").strip()
            if not qid and isinstance(entry.get("bookTitle"), str) and entry.get("bookTitle", "").startswith("Q"):
                qid = entry["bookTitle"]
            try:
                wd_desc = _fetch_wikidata_description(
                    qid=qid,
                    languages=wd_languages,
                    user_agent=args.wikidata_user_agent,
                )
                if wd_desc:
                    entry["passage"] = wd_desc[:800]
                    ok = True
                    fallback_success += 1
            except Exception:
                ok = False
        if ok:
            success += 1
            print(f"[{idx}/{len(candidates)}] OK  {entry.get('bookTitle', '')}")
        else:
            print(f"[{idx}/{len(candidates)}] SKIP {entry.get('bookTitle', '')}")
        await asyncio.sleep(args.delay_seconds)

    if "stats" not in payload or not isinstance(payload.get("stats"), dict):
        payload["stats"] = {}
    payload["stats"]["passage_backfill_attempted"] = attempted
    payload["stats"]["passage_backfill_success"] = success
    payload["stats"]["passage_backfill_wikidata_fallback_success"] = fallback_success
    payload["stats"]["passage_backfill_source"] = args.source

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    print("=" * 72)
    print("Passage backfill complete")
    print("=" * 72)
    print(f"Attempted: {attempted}")
    print(f"Successful: {success}")
    print(f"Wikidata fallback successful: {fallback_success}")
    print(f"Output: {args.output}")


if __name__ == "__main__":
    asyncio.run(main())