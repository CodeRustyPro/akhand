"""
Open Library API client for literary geography data acquisition.

Open Library (openlibrary.org) is the single best free data source for
bootstrapping Akhand. Their search API supports geographic queries:
  openlibrary.org/search.json?place=Mumbai
returns books with place-tagged metadata.

Rate limit: 3 requests/second with User-Agent header.
License: CC0 for metadata, various for full texts.

Results include: title, author, publication year, cover ID, subjects,
subject places, languages, and Open Library work key (for fetching
descriptions via the Works API).
"""

import time
import logging
from dataclasses import dataclass, field

import httpx

logger = logging.getLogger(__name__)

BASE_URL = "https://openlibrary.org"
SEARCH_URL = f"{BASE_URL}/search.json"
COVERS_URL = "https://covers.openlibrary.org/b/id"
USER_AGENT = "Akhand Literary Geography Platform/0.1 (https://github.com/akhand)"

SEARCH_FIELDS = [
    "key", "title", "author_name", "first_publish_year",
    "subject_places", "subject", "language", "cover_i",
    "number_of_pages_median", "edition_count",
]

REQUEST_DELAY = 0.4  # seconds between requests (stay under 3/sec)


@dataclass
class OpenLibraryBook:
    work_key: str
    title: str
    authors: list[str] = field(default_factory=list)
    first_publish_year: int | None = None
    subjects: list[str] = field(default_factory=list)
    subject_places: list[str] = field(default_factory=list)
    languages: list[str] = field(default_factory=list)
    cover_id: int | None = None
    cover_url: str | None = None
    description: str | None = None
    page_count: int | None = None
    edition_count: int = 0

    @property
    def cover_url_medium(self) -> str | None:
        if self.cover_id:
            return f"{COVERS_URL}/{self.cover_id}-M.jpg"
        return None

    @property
    def cover_url_large(self) -> str | None:
        if self.cover_id:
            return f"{COVERS_URL}/{self.cover_id}-L.jpg"
        return None

    @property
    def openlibrary_url(self) -> str:
        return f"{BASE_URL}{self.work_key}"


async def search_by_place(
    place: str,
    limit: int = 25,
    language: str | None = None,
) -> list[OpenLibraryBook]:
    """
    Search Open Library for books tagged with a specific place.

    Returns real metadata: titles, authors, years, covers, subjects.
    This is the fastest path to real literary geography data — no NLP needed.
    """
    params = {
        "place": place,
        "limit": limit,
        "fields": ",".join(SEARCH_FIELDS),
    }
    if language:
        params["language"] = language

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            SEARCH_URL,
            params=params,
            headers={"User-Agent": USER_AGENT},
        )
        response.raise_for_status()
        data = response.json()

    books = []
    for doc in data.get("docs", []):
        book = OpenLibraryBook(
            work_key=doc.get("key", ""),
            title=doc.get("title", ""),
            authors=doc.get("author_name", []),
            first_publish_year=doc.get("first_publish_year"),
            subjects=doc.get("subject", []),
            subject_places=doc.get("subject_places", []),
            languages=doc.get("language", []),
            cover_id=doc.get("cover_i"),
            page_count=doc.get("number_of_pages_median"),
            edition_count=doc.get("edition_count", 0),
        )
        books.append(book)

    logger.info(f"Open Library: {len(books)} books for place '{place}' (of {data.get('numFound', 0)} total)")
    return books


async def fetch_work_description(work_key: str) -> str | None:
    """
    Fetch the description for a specific work from the Works API.

    Used to get summaries for Gemini-based structured extraction.
    """
    url = f"{BASE_URL}{work_key}.json"

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.get(
                url, headers={"User-Agent": USER_AGENT}
            )
            response.raise_for_status()
            data = response.json()

            desc = data.get("description")
            if isinstance(desc, dict):
                return desc.get("value")
            if isinstance(desc, str):
                return desc
            return None
        except Exception as e:
            logger.debug(f"Failed to fetch description for {work_key}: {e}")
            return None


async def search_multiple_places(
    places: list[str],
    limit_per_place: int = 15,
    delay: float = REQUEST_DELAY,
) -> dict[str, list[OpenLibraryBook]]:
    """
    Search Open Library for multiple places with rate limiting.

    Returns a dict mapping place names to their book results.
    """
    results: dict[str, list[OpenLibraryBook]] = {}

    for i, place in enumerate(places):
        try:
            books = await search_by_place(place, limit=limit_per_place)
            results[place] = books
            logger.info(f"[{i+1}/{len(places)}] {place}: {len(books)} books")
        except Exception as e:
            logger.error(f"Failed to search for '{place}': {e}")
            results[place] = []

        if i < len(places) - 1:
            await _async_sleep(delay)

    return results


async def enrich_with_descriptions(
    books: list[OpenLibraryBook],
    max_books: int = 10,
    delay: float = REQUEST_DELAY,
) -> list[OpenLibraryBook]:
    """Fetch descriptions for a batch of books. Rate-limited."""
    enriched = 0
    for book in books[:max_books]:
        if book.work_key:
            desc = await fetch_work_description(book.work_key)
            if desc:
                book.description = desc
                enriched += 1
            await _async_sleep(delay)

    logger.info(f"Enriched {enriched}/{min(len(books), max_books)} books with descriptions")
    return books


async def _async_sleep(seconds: float):
    import asyncio
    await asyncio.sleep(seconds)
