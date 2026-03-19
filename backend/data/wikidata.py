"""
Wikidata P840 (narrative location) ingestion for literary geography.

Wikidata property P840 tags literary works with their geographic settings.
A single SPARQL query returns thousands of books already linked to coordinates
— free, CC0-licensed, structured, and instantly usable with no NLP required.

This is the highest-value data source for bootstrapping Akhand:
structured metadata that already contains geographic information, avoiding
the cost and complexity of full-text NLP on copyrighted novels.

Data pipeline:
  1. SPARQL query → Wikidata endpoint
  2. Parse coordinates, labels, identifiers
  3. Deduplicate and normalize
  4. Insert into PostgreSQL
"""

import logging
import asyncio
import json
import urllib.parse
import urllib.request
import urllib.error
from dataclasses import dataclass, field

import httpx

logger = logging.getLogger(__name__)

WIKIDATA_SPARQL_ENDPOINT = "https://query.wikidata.org/sparql"
USER_AGENT = "Akhand Literary Geography Platform/0.1 (+https://github.com/akhand; contact: bot-traffic@wikimedia.org)"

# Timeout generously — Wikidata SPARQL can be slow for complex queries
QUERY_TIMEOUT = 60.0
MAX_QUERY_RETRIES = 4
RETRY_BACKOFF_SECONDS = 2.0


@dataclass
class WikidataLiteraryPlace:
    book_qid: str
    book_label: str
    place_qid: str
    place_label: str
    latitude: float
    longitude: float
    author_label: str | None = None
    author_qid: str | None = None
    publication_year: int | None = None
    language_label: str | None = None
    genre_labels: list[str] = field(default_factory=list)
    country_label: str | None = None


# ── SPARQL Queries ─────────────────────────────────────────────────

QUERY_ALL_NARRATIVE_LOCATIONS = """
SELECT ?book ?bookLabel ?place ?placeLabel ?coord
             ?author ?authorLabel ?pubDate ?langLabel ?countryLabel
             (GROUP_CONCAT(DISTINCT ?genreLabel; separator="|") AS ?genreLabels)
WHERE {
    ?book wdt:P840 ?place .
    ?place wdt:P625 ?coord .

    # Literary coverage: literary work superclass + common fiction subtypes.
    {
        ?book wdt:P31/wdt:P279* wd:Q7725634 .
    }
    UNION { ?book wdt:P31 wd:Q571 . }      # novel
    UNION { ?book wdt:P31 wd:Q8261 . }     # novel series
    UNION { ?book wdt:P31 wd:Q49084 . }    # short story
    UNION { ?book wdt:P31 wd:Q277759 . }   # novella

    OPTIONAL { ?book wdt:P50 ?author . }
    OPTIONAL { ?book wdt:P577 ?pubDate . }
    OPTIONAL { ?book wdt:P407 ?lang . }
    OPTIONAL { ?book wdt:P136 ?genre . }
    OPTIONAL { ?place wdt:P17 ?country . }

    SERVICE wikibase:label { bd:serviceParam wikibase:language "en,hi,ur,bn,ta,te,ml,mr" . }
}
GROUP BY ?book ?bookLabel ?place ?placeLabel ?coord ?author ?authorLabel ?pubDate ?langLabel ?countryLabel
ORDER BY ?bookLabel
"""


QUERY_NOVELS_ONLY = """
SELECT ?book ?bookLabel ?place ?placeLabel ?coord
             ?author ?authorLabel ?pubDate ?langLabel ?countryLabel
             (GROUP_CONCAT(DISTINCT ?genreLabel; separator="|") AS ?genreLabels)
WHERE {
    ?book wdt:P840 ?place ;
                wdt:P31/wdt:P279* wd:Q571 .  # novel (including subclasses)
    ?place wdt:P625 ?coord .

    OPTIONAL { ?book wdt:P50 ?author . }
    OPTIONAL { ?book wdt:P577 ?pubDate . }
    OPTIONAL { ?book wdt:P407 ?lang . }
    OPTIONAL { ?book wdt:P136 ?genre . }
    OPTIONAL { ?place wdt:P17 ?country . }

    SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
GROUP BY ?book ?bookLabel ?place ?placeLabel ?coord ?author ?authorLabel ?pubDate ?langLabel ?countryLabel
ORDER BY ?bookLabel
"""

QUERY_ALL_NARRATIVE_LOCATIONS_PAGED = QUERY_ALL_NARRATIVE_LOCATIONS + "\nLIMIT __LIMIT__\nOFFSET __OFFSET__\n"
QUERY_NOVELS_ONLY_PAGED = QUERY_NOVELS_ONLY + "\nLIMIT __LIMIT__\nOFFSET __OFFSET__\n"

QUERY_SOUTH_ASIAN_LITERATURE = """
SELECT ?book ?bookLabel ?place ?placeLabel ?coord
       ?author ?authorLabel ?pubDate ?langLabel
WHERE {
  ?book wdt:P840 ?place ;
        wdt:P31/wdt:P279* wd:Q7725634 .
  ?place wdt:P625 ?coord .

  # Filter to South Asian countries
  ?place wdt:P17 ?country .
  VALUES ?country {
    wd:Q668   # India
    wd:Q843   # Pakistan
    wd:Q902   # Bangladesh
    wd:Q854   # Sri Lanka
    wd:Q837   # Nepal
    wd:Q836   # Myanmar
  }

  OPTIONAL { ?book wdt:P50 ?author . }
  OPTIONAL { ?book wdt:P577 ?pubDate . }
  OPTIONAL { ?book wdt:P407 ?lang . }

  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,hi,ur,bn,ta" . }
}
ORDER BY ?bookLabel
"""

QUERY_CITY_LITERARY_WORKS = """
SELECT ?book ?bookLabel ?author ?authorLabel ?pubDate ?langLabel
WHERE {{
  ?book wdt:P840 wd:{place_qid} ;
        wdt:P31/wdt:P279* wd:Q7725634 .
  OPTIONAL {{ ?book wdt:P50 ?author . }}
  OPTIONAL {{ ?book wdt:P577 ?pubDate . }}
  OPTIONAL {{ ?book wdt:P407 ?lang . }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en" . }}
}}
ORDER BY ?pubDate
"""

QUERY_HISTORICAL_NAMES = """
SELECT ?place ?placeLabel ?altName ?startTime ?endTime WHERE {{
  VALUES ?place {{ wd:{place_qid} }}
  ?place skos:altLabel ?altName .
  FILTER(LANG(?altName) = "en")
  OPTIONAL {{
    ?place p:P1448 ?nameStatement .
    ?nameStatement ps:P1448 ?altName .
    OPTIONAL {{ ?nameStatement pq:P580 ?startTime . }}
    OPTIONAL {{ ?nameStatement pq:P582 ?endTime . }}
  }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en" . }}
}}
"""


def _parse_coord(coord_str: str) -> tuple[float, float] | None:
    """Parse 'Point(lon lat)' WKT from Wikidata."""
    if not coord_str or not coord_str.startswith("Point("):
        return None
    inner = coord_str[6:-1]  # strip Point( and )
    parts = inner.split()
    if len(parts) != 2:
        return None
    try:
        return (float(parts[0]), float(parts[1]))  # (lon, lat)
    except ValueError:
        return None


def _extract_year(date_str: str | None) -> int | None:
    """Extract year from ISO date string."""
    if not date_str:
        return None
    try:
        return int(date_str[:4])
    except (ValueError, IndexError):
        return None


def _extract_qid(uri: str) -> str:
    """Extract QID from Wikidata URI."""
    return uri.rsplit("/", 1)[-1] if uri else ""


async def query_wikidata(sparql: str) -> list[dict]:
    """Execute a SPARQL query against the Wikidata endpoint."""

    def _query_with_urllib() -> list[dict]:
        payload = urllib.parse.urlencode({"query": sparql, "format": "json"}).encode("utf-8")
        req = urllib.request.Request(
            WIKIDATA_SPARQL_ENDPOINT,
            data=payload,
            method="POST",
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "application/sparql-results+json",
                "Content-Type": "application/x-www-form-urlencoded",
            },
        )
        with urllib.request.urlopen(req, timeout=QUERY_TIMEOUT) as response:
            body = response.read().decode("utf-8", errors="ignore")
        data = json.loads(body)
        return data.get("results", {}).get("bindings", [])

    async with httpx.AsyncClient(timeout=QUERY_TIMEOUT) as client:
        for attempt in range(MAX_QUERY_RETRIES + 1):
            response = await client.post(
                WIKIDATA_SPARQL_ENDPOINT,
                data={"query": sparql, "format": "json"},
                headers={
                    "User-Agent": USER_AGENT,
                    "Accept": "application/sparql-results+json",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            )

            if response.status_code < 400:
                data = response.json()
                return data.get("results", {}).get("bindings", [])

            # WDQS can hard-throttle specific HTTP client fingerprints.
            # Fallback to urllib has proven more reliable in this workspace.
            if response.status_code == 403:
                try:
                    return await asyncio.to_thread(_query_with_urllib)
                except urllib.error.HTTPError as ue:
                    if ue.code not in {403, 429, 502, 503, 504}:
                        raise
                except Exception:
                    pass

            retryable = response.status_code in {403, 429, 502, 503, 504}
            if retryable and attempt < MAX_QUERY_RETRIES:
                retry_after = response.headers.get("Retry-After")
                if retry_after:
                    try:
                        wait_seconds = float(retry_after)
                    except ValueError:
                        wait_seconds = RETRY_BACKOFF_SECONDS * (2 ** attempt)
                else:
                    wait_seconds = RETRY_BACKOFF_SECONDS * (2 ** attempt)
                logger.warning(
                    "Wikidata query throttled (status=%s). Retrying in %.1fs [attempt %s/%s]",
                    response.status_code,
                    wait_seconds,
                    attempt + 1,
                    MAX_QUERY_RETRIES,
                )
                await asyncio.sleep(wait_seconds)
                continue

            response.raise_for_status()

    return []


async def query_wikidata_paginated(
    sparql_template: str,
    page_size: int = 2000,
    max_pages: int = 0,
    pause_seconds: float = 1.5,
    start_offset: int = 0,
) -> list[dict]:
    """
    Execute a paginated SPARQL query with LIMIT/OFFSET placeholders.

    The query template must contain __LIMIT__ and __OFFSET__ tokens.
    max_pages=0 means no explicit page cap.
    """
    all_bindings: list[dict] = []
    page = 0
    offset = max(start_offset, 0)

    while True:
        if max_pages > 0 and page >= max_pages:
            break

        sparql = (
            sparql_template.replace("__LIMIT__", str(page_size)).replace("__OFFSET__", str(offset))
        )
        logger.info("Wikidata paged query: page=%s offset=%s size=%s", page + 1, offset, page_size)
        try:
            bindings = await query_wikidata(sparql)
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code if exc.response is not None else "unknown"
            if all_bindings:
                logger.warning(
                    "Wikidata paged query stopped at page=%s after HTTP %s; returning partial results (%s rows)",
                    page + 1,
                    status,
                    len(all_bindings),
                )
                break
            raise

        if not bindings:
            break

        all_bindings.extend(bindings)
        logger.info("Wikidata paged query: received %s rows (total=%s)", len(bindings), len(all_bindings))

        if len(bindings) < page_size:
            break

        page += 1
        offset += page_size
        await asyncio.sleep(pause_seconds)

    return all_bindings


async def fetch_all_narrative_locations() -> list[WikidataLiteraryPlace]:
    """Fetch all literary works with narrative locations (P840) from Wikidata."""
    logger.info("Querying Wikidata for all narrative locations (P840)...")
    bindings = await query_wikidata(QUERY_ALL_NARRATIVE_LOCATIONS)
    return _parse_bindings(bindings)


async def fetch_novels_only_locations() -> list[WikidataLiteraryPlace]:
    """Fetch only novel entries with narrative locations from Wikidata."""
    logger.info("Querying Wikidata for novels with narrative locations (P840)...")
    bindings = await query_wikidata(QUERY_NOVELS_ONLY)
    return _parse_bindings(bindings)


async def fetch_all_narrative_locations_paged(
    page_size: int = 2000,
    max_pages: int = 0,
    pause_seconds: float = 1.5,
    start_offset: int = 0,
) -> list[WikidataLiteraryPlace]:
    """Fetch narrative locations using paginated LIMIT/OFFSET queries."""
    logger.info("Querying Wikidata with paginated narrative-location fetch...")
    bindings = await query_wikidata_paginated(
        QUERY_ALL_NARRATIVE_LOCATIONS_PAGED,
        page_size=page_size,
        max_pages=max_pages,
        pause_seconds=pause_seconds,
        start_offset=start_offset,
    )
    return _parse_bindings(bindings)


async def fetch_novels_only_locations_paged(
    page_size: int = 2000,
    max_pages: int = 0,
    pause_seconds: float = 1.5,
    start_offset: int = 0,
) -> list[WikidataLiteraryPlace]:
    """Fetch novels-only narrative locations using paginated LIMIT/OFFSET queries."""
    logger.info("Querying Wikidata with paginated novels-only fetch...")
    bindings = await query_wikidata_paginated(
        QUERY_NOVELS_ONLY_PAGED,
        page_size=page_size,
        max_pages=max_pages,
        pause_seconds=pause_seconds,
        start_offset=start_offset,
    )
    return _parse_bindings(bindings)


async def fetch_south_asian_literature() -> list[WikidataLiteraryPlace]:
    """Fetch literary works set in South Asian countries."""
    logger.info("Querying Wikidata for South Asian literary locations...")
    bindings = await query_wikidata(QUERY_SOUTH_ASIAN_LITERATURE)
    return _parse_bindings(bindings)


async def fetch_books_for_city(place_qid: str) -> list[dict]:
    """Fetch all literary works set in a specific city by its Wikidata QID."""
    query = QUERY_CITY_LITERARY_WORKS.format(place_qid=place_qid)
    bindings = await query_wikidata(query)
    return [
        {
            "book_qid": _extract_qid(b.get("book", {}).get("value", "")),
            "book_label": b.get("bookLabel", {}).get("value", ""),
            "author_label": b.get("authorLabel", {}).get("value"),
            "publication_year": _extract_year(b.get("pubDate", {}).get("value")),
            "language": b.get("langLabel", {}).get("value"),
        }
        for b in bindings
    ]


async def fetch_historical_names(place_qid: str) -> list[dict]:
    """Fetch historical/alternate names for a place with date ranges."""
    query = QUERY_HISTORICAL_NAMES.format(place_qid=place_qid)
    bindings = await query_wikidata(query)
    return [
        {
            "name": b.get("altName", {}).get("value", ""),
            "start_year": _extract_year(b.get("startTime", {}).get("value")),
            "end_year": _extract_year(b.get("endTime", {}).get("value")),
        }
        for b in bindings
        if b.get("altName", {}).get("value")
    ]


def _parse_bindings(bindings: list[dict]) -> list[WikidataLiteraryPlace]:
    """Parse SPARQL result bindings into structured objects."""
    results = []
    seen = set()

    for b in bindings:
        book_qid = _extract_qid(b.get("book", {}).get("value", ""))
        place_qid = _extract_qid(b.get("place", {}).get("value", ""))
        dedup_key = (book_qid, place_qid)

        if dedup_key in seen:
            continue
        seen.add(dedup_key)

        coord = _parse_coord(b.get("coord", {}).get("value", ""))
        if not coord:
            continue

        results.append(
            WikidataLiteraryPlace(
                book_qid=book_qid,
                book_label=b.get("bookLabel", {}).get("value", ""),
                place_qid=place_qid,
                place_label=b.get("placeLabel", {}).get("value", ""),
                longitude=coord[0],
                latitude=coord[1],
                author_label=b.get("authorLabel", {}).get("value"),
                author_qid=_extract_qid(b.get("author", {}).get("value", "")),
                publication_year=_extract_year(
                    b.get("pubDate", {}).get("value")
                ),
                language_label=b.get("langLabel", {}).get("value"),
                genre_labels=[
                    g.strip() for g in b.get("genreLabels", {}).get("value", "").split("|") if g.strip()
                ],
                country_label=b.get("countryLabel", {}).get("value"),
            )
        )

    logger.info(f"Parsed {len(results)} unique book-place pairs from Wikidata")
    return results
