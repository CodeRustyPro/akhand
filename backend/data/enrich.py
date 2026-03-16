"""
Enrich literary_places.json with descriptions, covers, and read links
from Open Library's Works API.

Reads existing data, fetches missing descriptions and cover URLs,
adds openLibraryUrl for "Read it" links, and writes back.

Usage:
  python -m backend.data.enrich
  python -m backend.data.enrich --dry-run     # preview without writing
  python -m backend.data.enrich --limit 50    # only enrich first N missing
"""

import asyncio
import json
import logging
import argparse
from pathlib import Path

import httpx

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

BASE_URL = "https://openlibrary.org"
COVERS_URL = "https://covers.openlibrary.org/b/id"
USER_AGENT = "Akhand Literary Geography Platform/0.2 (https://github.com/CodeRustyPro/akhand)"
DATA_PATH = Path(__file__).parent / "generated" / "literary_places.json"
REQUEST_DELAY = 0.35


async def fetch_work(work_key: str, client: httpx.AsyncClient) -> dict | None:
    url = f"{BASE_URL}{work_key}.json"
    try:
        resp = await client.get(url, headers={"User-Agent": USER_AGENT})
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.debug(f"Failed {work_key}: {e}")
        return None


def extract_description(work_data: dict) -> str:
    desc = work_data.get("description")
    if isinstance(desc, dict):
        return desc.get("value", "")
    if isinstance(desc, str):
        return desc
    return ""


def extract_cover_id(work_data: dict) -> int | None:
    covers = work_data.get("covers", [])
    for c in covers:
        if isinstance(c, int) and c > 0:
            return c
    return None


async def enrich(limit: int | None = None, dry_run: bool = False):
    with open(DATA_PATH) as f:
        data = json.load(f)

    places = data["places"]
    ol_places = [p for p in places if p.get("openLibraryKey")]

    needs_desc = [p for p in ol_places if not p.get("passage") or len(p["passage"].strip()) < 10]
    needs_cover = [p for p in ol_places if not p.get("coverUrl")]
    needs_work = list({p["id"]: p for p in needs_desc + needs_cover}.values())

    if limit:
        needs_work = needs_work[:limit]

    logger.info(f"Total OL entries: {len(ol_places)}")
    logger.info(f"Missing description: {len(needs_desc)}")
    logger.info(f"Missing cover: {len(needs_cover)}")
    logger.info(f"Will fetch: {len(needs_work)} works")

    if dry_run:
        logger.info("Dry run, exiting")
        return

    # Add openLibraryUrl to ALL OL entries
    for p in ol_places:
        if p.get("openLibraryKey"):
            p["openLibraryUrl"] = f"{BASE_URL}{p['openLibraryKey']}"

    # Add readUrl for CIF entries (search link)
    for p in places:
        if not p.get("openLibraryKey") and not p.get("openLibraryUrl"):
            title = p.get("bookTitle", "")
            author = p.get("author", "")
            if title:
                q = f"{title} {author}".strip().replace(" ", "+")
                p["goodreadsUrl"] = f"https://www.google.com/search?q={q}+book"

    enriched_desc = 0
    enriched_cover = 0
    failed = 0

    async with httpx.AsyncClient(timeout=12.0) as client:
        for i, place in enumerate(needs_work):
            work_key = place["openLibraryKey"]
            work_data = await fetch_work(work_key, client)

            if work_data:
                if not place.get("passage") or len(place["passage"].strip()) < 10:
                    desc = extract_description(work_data)
                    if desc:
                        truncated = desc[:400] + "..." if len(desc) > 400 else desc
                        place["passage"] = truncated
                        enriched_desc += 1

                if not place.get("coverUrl"):
                    cover_id = extract_cover_id(work_data)
                    if cover_id:
                        place["coverUrl"] = f"{COVERS_URL}/{cover_id}-M.jpg"
                        enriched_cover += 1
            else:
                failed += 1

            if (i + 1) % 50 == 0:
                logger.info(f"Progress: {i+1}/{len(needs_work)} (desc: +{enriched_desc}, cover: +{enriched_cover}, failed: {failed})")

            await asyncio.sleep(REQUEST_DELAY)

    logger.info(f"Done. Descriptions: +{enriched_desc}, Covers: +{enriched_cover}, Failed: {failed}")

    data["places"] = places
    data["version"] = "0.6.0"
    data["enriched"] = True

    with open(DATA_PATH, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    logger.info(f"Wrote {len(places)} places to {DATA_PATH}")


async def main():
    parser = argparse.ArgumentParser(description="Enrich literary places with OL descriptions and covers")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of works to fetch")
    args = parser.parse_args()

    await enrich(limit=args.limit, dry_run=args.dry_run)


if __name__ == "__main__":
    asyncio.run(main())
