#!/usr/bin/env python3
"""
Extract canonical genres from Open Library subject tags.

For entries with an openLibraryKey, fetches the work's subjects from the OL API
and maps them to canonical genre labels. Updates the entry's genres array.

Usage:
  python -m backend.scripts.extract_ol_genres
  python -m backend.scripts.extract_ol_genres --limit 100 --dry-run
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
from pathlib import Path

import httpx

GENERATED = Path(__file__).parent.parent / "data" / "generated"
DEFAULT_INPUT = GENERATED / "literary_places_passages_merged.json"
DEFAULT_OUTPUT = DEFAULT_INPUT

OL_USER_AGENT = "Akhand Literary Geography Platform/0.1 (https://github.com/akhand)"

# Mapping from OL subject substrings (lowercased) to canonical genre labels.
# Order matters — first match wins for each subject string, but an entry can
# match multiple subjects → multiple genres.
SUBJECT_TO_GENRE: list[tuple[str, str]] = [
    # Specific genres first
    ("detective", "mystery"),
    ("mystery", "mystery"),
    ("crime", "crime fiction"),
    ("thriller", "thriller"),
    ("suspense", "thriller"),
    ("horror", "horror"),
    ("ghost stor", "horror"),
    ("supernatural", "horror"),
    ("gothic", "gothic fiction"),
    ("science fiction", "science fiction"),
    ("sci-fi", "science fiction"),
    ("dystopi", "science fiction"),
    ("utopi", "science fiction"),
    ("cyberpunk", "science fiction"),
    ("fantasy", "fantasy"),
    ("magic", "fantasy"),
    ("fairy tale", "fantasy"),
    ("romance", "romance"),
    ("love stor", "romance"),
    ("historical fiction", "historical fiction"),
    ("historical", "historical fiction"),
    ("war", "war fiction"),
    ("world war", "war fiction"),
    ("military", "war fiction"),
    ("adventure", "adventure"),
    ("satire", "satire"),
    ("humor", "humor"),
    ("humorous", "humor"),
    ("comic", "humor"),
    ("coming of age", "coming-of-age"),
    ("bildungsroman", "coming-of-age"),
    ("young adult", "young adult"),
    ("children", "children's"),
    ("juvenile", "children's"),
    ("picture book", "children's"),
    ("autobiography", "autobiography"),
    ("memoir", "memoir"),
    ("biography", "biography"),
    ("travel", "travel writing"),
    ("philosophical", "philosophical fiction"),
    ("existential", "philosophical fiction"),
    ("absurd", "absurdist fiction"),
    ("magical realism", "magical realism"),
    ("postmodern", "postmodern fiction"),
    ("experimental", "experimental fiction"),
    ("epistolary", "epistolary fiction"),
    ("noir", "noir"),
    ("western", "western"),
    ("spy", "spy fiction"),
    ("espionage", "spy fiction"),
    ("political", "political fiction"),
    ("social", "social realism"),
    ("realism", "literary fiction"),
    ("literary", "literary fiction"),
    ("domestic fiction", "domestic fiction"),
    ("family", "family saga"),
    ("saga", "family saga"),
    ("psychological", "psychological fiction"),
    ("feminist", "feminist fiction"),
    ("allegory", "allegory"),
    ("fable", "fable"),
    ("short stor", "short stories"),
    ("poetry", "poetry"),
    ("drama", "drama"),
    ("play", "drama"),
]

# Subjects to ignore (too vague or not genres)
IGNORE_SUBJECTS = {
    "fiction", "novel", "novels", "literature", "english literature",
    "american literature", "french literature", "german literature",
    "accessible book", "protected daisy", "in library", "overdrive",
    "lending library", "large type books", "open library staff picks",
    "new york times bestseller", "reading level",
    "nyt:combined-print-and-e-book-fiction",
}


def _classify_subject(subject: str) -> str | None:
    """Map a single OL subject string to a canonical genre, or None."""
    low = subject.lower().strip()
    if low in IGNORE_SUBJECTS or len(low) < 3:
        return None
    for pattern, genre in SUBJECT_TO_GENRE:
        if pattern in low:
            return genre
    return None


def _extract_genres_from_subjects(subjects: list[str]) -> list[str]:
    """Extract unique canonical genres from a list of OL subjects."""
    genres: list[str] = []
    seen: set[str] = set()
    for subj in subjects:
        genre = _classify_subject(subj)
        if genre and genre not in seen:
            seen.add(genre)
            genres.append(genre)
    return genres


async def _fetch_ol_subjects(client: httpx.AsyncClient, ol_key: str) -> list[str]:
    """Fetch subjects for an Open Library work."""
    url = f"https://openlibrary.org{ol_key}.json"
    try:
        resp = await client.get(url)
        if resp.status_code == 404:
            return []
        resp.raise_for_status()
        data = resp.json()
        subjects = data.get("subjects", [])
        # OL subjects can be strings or dicts with 'name' key
        result = []
        for s in subjects:
            if isinstance(s, str):
                result.append(s)
            elif isinstance(s, dict) and "name" in s:
                result.append(s["name"])
        return result
    except Exception:
        return []


async def main() -> None:
    parser = argparse.ArgumentParser(description="Extract genres from Open Library subjects")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--limit", type=int, default=0, help="Max entries to fetch (0 = all)")
    parser.add_argument("--delay-seconds", type=float, default=0.3)
    parser.add_argument("--timeout-seconds", type=float, default=12.0)
    parser.add_argument("--dry-run", action="store_true", help="Fetch and print but don't write")
    parser.add_argument("--min-existing-genres", type=int, default=0,
                        help="Only process entries with fewer than N existing genres (0 = all with OL key)")
    args = parser.parse_args()

    if not args.input.exists():
        raise SystemExit(f"Input not found: {args.input}")

    with open(args.input) as f:
        payload = json.load(f)
    places = payload.get("places", [])

    # Find candidates: entries with OL key
    candidates = []
    for p in places:
        ol_key = (p.get("openLibraryKey") or "").strip()
        if not ol_key:
            continue
        existing_genres = p.get("genres", [])
        if args.min_existing_genres > 0 and len(existing_genres) >= args.min_existing_genres:
            continue
        candidates.append(p)

    if args.limit > 0:
        candidates = candidates[:args.limit]

    print(f"Total places: {len(places)}")
    print(f"Candidates with OL key: {len(candidates)}")

    updated = 0
    new_genres_added = 0

    async with httpx.AsyncClient(
        timeout=args.timeout_seconds,
        headers={"User-Agent": OL_USER_AGENT},
        follow_redirects=True,
    ) as client:
        for idx, entry in enumerate(candidates, start=1):
            ol_key = entry["openLibraryKey"]
            subjects = await _fetch_ol_subjects(client, ol_key)

            if subjects:
                extracted = _extract_genres_from_subjects(subjects)
                existing = set(g.lower() for g in (entry.get("genres") or []))
                new_genres = [g for g in extracted if g.lower() not in existing]

                if new_genres or extracted:
                    # Merge: keep existing + add new
                    merged = list(entry.get("genres") or [])
                    for g in new_genres:
                        merged.append(g)
                    entry["genres"] = merged[:8]  # Cap at 8 genres
                    entry["openLibrarySubjects"] = subjects[:20]  # Store raw subjects for provenance
                    updated += 1
                    new_genres_added += len(new_genres)

                    if args.dry_run:
                        print(f"[{idx}/{len(candidates)}] {entry.get('bookTitle', '')}")
                        print(f"  Subjects: {subjects[:6]}")
                        print(f"  Extracted: {extracted}")
                        print(f"  New: {new_genres}")
                    else:
                        print(f"[{idx}/{len(candidates)}] OK  {entry.get('bookTitle', '')} +{len(new_genres)} genres")
                else:
                    print(f"[{idx}/{len(candidates)}] SKIP {entry.get('bookTitle', '')} (no mappable subjects)")
            else:
                print(f"[{idx}/{len(candidates)}] SKIP {entry.get('bookTitle', '')} (no subjects from OL)")

            await asyncio.sleep(args.delay_seconds)

    if args.dry_run:
        print(f"\n[DRY RUN] Would update {updated} entries, adding {new_genres_added} new genre tags")
        return

    if "stats" not in payload or not isinstance(payload.get("stats"), dict):
        payload["stats"] = {}
    payload["stats"]["ol_genre_extraction_updated"] = updated
    payload["stats"]["ol_genre_extraction_new_tags"] = new_genres_added

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    print("=" * 60)
    print(f"Genre extraction complete")
    print(f"  Entries updated: {updated}")
    print(f"  New genre tags added: {new_genres_added}")
    print(f"  Output: {args.output}")


if __name__ == "__main__":
    asyncio.run(main())
