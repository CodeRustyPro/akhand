"""
Data ingestion pipeline: pulls real literary geography data from live sources.

Sources:
  1. Open Library (primary) — search by place, get real metadata
  2. Wikidata P840 (when not rate-limited) — narrative locations with coordinates
  3. Gemini 3 Flash (optional) — structured extraction from descriptions

Output: JSON file usable by both the frontend and backend API.

Usage:
  python -m backend.data.ingest                  # basic (Open Library only)
  python -m backend.data.ingest --with-gemini     # + Gemini theme extraction
  python -m backend.data.ingest --limit 10        # limit per city
"""

import asyncio
import json
import logging
import os
import sys
import argparse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from backend.data.openlibrary import (
    search_by_place,
    search_multiple_places,
    enrich_with_descriptions,
    OpenLibraryBook,
    REQUEST_DELAY,
    _async_sleep,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── Historical name aliases ────────────────────────────────────────
# Search Open Library under both modern and historical names to catch
# books tagged with either. Deduplicate by work key, not by title.

HISTORICAL_ALIASES: dict[str, list[str]] = {
    "Mumbai": ["Bombay"],
    "Kolkata": ["Calcutta"],
    "Chennai": ["Madras"],
    "Bangalore": ["Bengaluru"],
    "Varanasi": ["Benaras", "Banaras", "Kashi"],
    "Kochi": ["Cochin"],
    "Pune": ["Poona"],
    "Mysore": ["Mysuru"],
    "St Petersburg": ["Leningrad", "Saint Petersburg"],
    "Istanbul": ["Constantinople"],
    "Srinagar": ["Kashmir"],
}

# ── Seed cities with pre-known coordinates ─────────────────────────
# Includes the original 34 + cities from the CIF spreadsheet that
# have a reasonable chance of returning Open Library results.

CITIES: dict[str, dict] = {
    # South Asia — the core focus
    "Mumbai": {"coords": [72.8777, 19.0760], "region": "South Asia", "country": "India"},
    "Delhi": {"coords": [77.2090, 28.6139], "region": "South Asia", "country": "India"},
    "Kolkata": {"coords": [88.3639, 22.5726], "region": "South Asia", "country": "India"},
    "Chennai": {"coords": [80.2707, 13.0827], "region": "South Asia", "country": "India"},
    "Bangalore": {"coords": [77.5946, 12.9716], "region": "South Asia", "country": "India"},
    "Hyderabad": {"coords": [78.4867, 17.3850], "region": "South Asia", "country": "India"},
    "Jaipur": {"coords": [75.7873, 26.9124], "region": "South Asia", "country": "India"},
    "Lucknow": {"coords": [80.9462, 26.8467], "region": "South Asia", "country": "India"},
    "Varanasi": {"coords": [83.0007, 25.3176], "region": "South Asia", "country": "India"},
    "Goa": {"coords": [74.1240, 15.2993], "region": "South Asia", "country": "India"},
    "Kochi": {"coords": [76.2673, 9.9312], "region": "South Asia", "country": "India"},
    "Pune": {"coords": [73.8567, 18.5204], "region": "South Asia", "country": "India"},
    "Ahmedabad": {"coords": [72.5714, 23.0225], "region": "South Asia", "country": "India"},
    "Amritsar": {"coords": [74.8723, 31.6340], "region": "South Asia", "country": "India"},
    "Shimla": {"coords": [77.1734, 31.1048], "region": "South Asia", "country": "India"},
    "Mysore": {"coords": [76.6394, 12.2958], "region": "South Asia", "country": "India"},
    "Lahore": {"coords": [74.3587, 31.5204], "region": "South Asia", "country": "Pakistan"},
    "Karachi": {"coords": [67.0011, 24.8607], "region": "South Asia", "country": "Pakistan"},
    "Islamabad": {"coords": [73.0479, 33.6844], "region": "South Asia", "country": "Pakistan"},
    "Dhaka": {"coords": [90.4125, 23.8103], "region": "South Asia", "country": "Bangladesh"},
    "Colombo": {"coords": [79.8612, 6.9271], "region": "South Asia", "country": "Sri Lanka"},
    "Kathmandu": {"coords": [85.3240, 27.7172], "region": "South Asia", "country": "Nepal"},
    # Added from CIF — cities with likely OL coverage
    "Patna": {"coords": [85.1376, 25.6093], "region": "South Asia", "country": "India"},
    "Srinagar": {"coords": [74.7973, 34.0837], "region": "South Asia", "country": "India"},
    "Darjeeling": {"coords": [88.2631, 27.0360], "region": "South Asia", "country": "India"},
    "Mussoorie": {"coords": [78.0644, 30.4598], "region": "South Asia", "country": "India"},
    "Gorakhpur": {"coords": [83.3732, 26.7606], "region": "South Asia", "country": "India"},
    "Aligarh": {"coords": [78.0880, 27.8974], "region": "South Asia", "country": "India"},
    "Bhopal": {"coords": [77.4126, 23.2599], "region": "South Asia", "country": "India"},
    "Shillong": {"coords": [91.8933, 25.5788], "region": "South Asia", "country": "India"},
    "Kalimpong": {"coords": [88.4700, 27.0660], "region": "South Asia", "country": "India"},
    "Jaisalmer": {"coords": [70.9083, 26.9157], "region": "South Asia", "country": "India"},
    "Jodhpur": {"coords": [73.0243, 26.2389], "region": "South Asia", "country": "India"},
    "Pondicherry": {"coords": [79.8083, 11.9416], "region": "South Asia", "country": "India"},
    "Agra": {"coords": [78.0081, 27.1767], "region": "South Asia", "country": "India"},
    "Dehradun": {"coords": [78.0322, 30.3165], "region": "South Asia", "country": "India"},
    "Udaipur": {"coords": [73.7125, 24.5854], "region": "South Asia", "country": "India"},
    "Madurai": {"coords": [78.1198, 9.9252], "region": "South Asia", "country": "India"},
    "Dharamshala": {"coords": [76.3234, 32.2190], "region": "South Asia", "country": "India"},
    "Kabul": {"coords": [69.1723, 34.5281], "region": "South Asia", "country": "Afghanistan"},
    "Kozhikode": {"coords": [75.7804, 11.2588], "region": "South Asia", "country": "India"},
    "Aizawl": {"coords": [92.7176, 23.7271], "region": "South Asia", "country": "India"},
    # Global literary capitals
    "London": {"coords": [-0.1276, 51.5074], "region": "Europe", "country": "UK"},
    "Paris": {"coords": [2.3522, 48.8566], "region": "Europe", "country": "France"},
    "Dublin": {"coords": [-6.2603, 53.3498], "region": "Europe", "country": "Ireland"},
    "New York": {"coords": [-74.0060, 40.7128], "region": "North America", "country": "USA"},
    "Istanbul": {"coords": [28.9784, 41.0082], "region": "Europe", "country": "Turkey"},
    "Cairo": {"coords": [31.2357, 30.0444], "region": "Middle East", "country": "Egypt"},
    "Tokyo": {"coords": [139.6917, 35.6895], "region": "East Asia", "country": "Japan"},
    "Lagos": {"coords": [3.3792, 6.5244], "region": "Africa", "country": "Nigeria"},
    "Buenos Aires": {"coords": [-58.3816, -34.6037], "region": "Latin America", "country": "Argentina"},
    "Moscow": {"coords": [37.6173, 55.7558], "region": "Europe", "country": "Russia"},
    "Nairobi": {"coords": [36.8219, -1.2921], "region": "Africa", "country": "Kenya"},
    "St Petersburg": {"coords": [30.3351, 59.9343], "region": "Europe", "country": "Russia"},
}

OUTPUT_DIR = Path(__file__).parent / "generated"


def _classify_genres(subjects: list[str]) -> list[str]:
    """Derive genre tags from Open Library subject headings."""
    genres = set()
    subject_text = " ".join(s.lower() for s in subjects)

    mappings = {
        "fiction": "literary fiction",
        "novel": "literary fiction",
        "historical fiction": "historical fiction",
        "mystery": "mystery",
        "detective": "mystery",
        "crime": "crime",
        "romance": "romance",
        "love stories": "romance",
        "science fiction": "science fiction",
        "fantasy": "fantasy",
        "thriller": "thriller",
        "suspense": "thriller",
        "horror": "horror",
        "poetry": "poetry",
        "short stories": "short stories",
        "memoir": "memoir",
        "autobiography": "memoir",
        "biography": "biography",
        "children": "children's",
        "young adult": "young adult",
        "magic": "magical realism",
        "postcolonial": "postcolonial",
        "satire": "satire",
        "political": "political fiction",
        "social": "social realism",
        "literary": "literary fiction",
    }

    for keyword, genre in mappings.items():
        if keyword in subject_text:
            genres.add(genre)

    return sorted(genres) if genres else ["literary fiction"]


def _extract_themes(subjects: list[str]) -> list[str]:
    """Extract literary themes from Open Library subject headings."""
    themes = set()
    subject_text = " ".join(s.lower() for s in subjects)

    theme_keywords = {
        "partition": "partition",
        "independence": "independence",
        "colonial": "colonialism",
        "caste": "caste",
        "poverty": "poverty",
        "family": "family",
        "marriage": "marriage",
        "identity": "identity",
        "migration": "migration",
        "immigrant": "diaspora",
        "diaspora": "diaspora",
        "war": "war",
        "revolution": "revolution",
        "religion": "religion",
        "women": "gender",
        "feminist": "gender",
        "race": "race",
        "class": "class",
        "love": "love",
        "death": "mortality",
        "memory": "memory",
        "home": "home",
        "exile": "exile",
        "corruption": "corruption",
        "urban": "urban_life",
        "rural": "rural_life",
        "childhood": "childhood",
    }

    for keyword, theme in theme_keywords.items():
        if keyword in subject_text:
            themes.add(theme)

    return sorted(themes)


def book_to_literary_place(
    book: OpenLibraryBook,
    city_name: str,
    city_info: dict,
) -> dict:
    """Convert an OpenLibraryBook to a LiteraryPlace-compatible dict."""
    genres = _classify_genres(book.subjects)
    themes = _extract_themes(book.subjects)

    return {
        "id": f"ol-{book.work_key.split('/')[-1]}-{city_name.lower().replace(' ', '-')}",
        "bookTitle": book.title,
        "author": ", ".join(book.authors) if book.authors else "Unknown",
        "publishYear": book.first_publish_year or 0,
        "placeName": city_name,
        "coordinates": city_info["coords"],
        "placeType": "real",
        "settingType": "primary",
        "narrativeEra": str(book.first_publish_year) + "s" if book.first_publish_year else "",
        "passage": book.description[:300] + "..." if book.description and len(book.description) > 300 else (book.description or ""),
        "sentiment": {
            "polarity": 0.0,
            "dominantEmotions": [],
            "themes": themes,
        },
        "language": _primary_language(book.languages),
        "genres": genres,
        "region": city_info["region"],
        "openLibraryKey": book.work_key,
        "coverUrl": book.cover_url_medium,
        "source": "openlibrary",
    }


def _primary_language(languages: list[str]) -> str:
    lang_map = {
        "eng": "English", "hin": "Hindi", "urd": "Urdu", "ben": "Bengali",
        "tam": "Tamil", "tel": "Telugu", "mar": "Marathi", "fre": "French",
        "ger": "German", "spa": "Spanish", "rus": "Russian", "jpn": "Japanese",
        "ara": "Arabic", "por": "Portuguese", "tur": "Turkish", "ita": "Italian",
    }
    for lang in languages:
        if lang in lang_map:
            return lang_map[lang]
    return "English"


async def _search_with_aliases(
    city: str,
    limit: int,
) -> list[OpenLibraryBook]:
    """
    Search Open Library under a city's modern name AND historical aliases.
    Deduplicate by work key so the same book isn't counted twice.
    """
    aliases = HISTORICAL_ALIASES.get(city, [])
    all_names = [city] + aliases

    seen_keys: set[str] = set()
    merged: list[OpenLibraryBook] = []

    for name in all_names:
        try:
            books = await search_by_place(name, limit=limit)
            for book in books:
                if book.work_key and book.work_key not in seen_keys:
                    seen_keys.add(book.work_key)
                    merged.append(book)
            if aliases:
                await _async_sleep(REQUEST_DELAY)
        except Exception as e:
            logger.error(f"Failed to search for '{name}': {e}")

    if aliases:
        primary_count = len([b for b in merged if True])
        logger.info(
            f"  {city} + aliases {aliases}: {len(merged)} unique works "
            f"(deduplicated by work key)"
        )

    return merged


async def run_ingestion(
    cities: dict[str, dict] | None = None,
    limit_per_city: int = 15,
    enrich_descriptions: bool = True,
    max_descriptions_per_city: int = 5,
) -> list[dict]:
    """
    Run the full ingestion pipeline:
      1. Search Open Library for each city (including historical aliases)
      2. Optionally enrich with descriptions
      3. Convert to LiteraryPlace format
      4. Deduplicate by work key (not by title — handles Bombay/Mumbai)
    """
    if cities is None:
        cities = CITIES

    city_names = list(cities.keys())
    logger.info(f"Starting ingestion for {len(city_names)} cities")

    # Search Open Library with alias expansion
    all_books: dict[str, list[OpenLibraryBook]] = {}
    for i, city in enumerate(city_names):
        books = await _search_with_aliases(city, limit=limit_per_city)
        all_books[city] = books
        logger.info(f"[{i+1}/{len(city_names)}] {city}: {len(books)} works")
        if i < len(city_names) - 1:
            await _async_sleep(REQUEST_DELAY)

    # Enrich with descriptions
    if enrich_descriptions:
        for city, books in all_books.items():
            if books:
                await enrich_with_descriptions(books, max_books=max_descriptions_per_city)

    # Convert to LiteraryPlace format, deduplicate by work key
    all_places: list[dict] = []
    seen_work_keys: set[str] = set()

    for city, books in all_books.items():
        city_info = cities[city]
        for book in books:
            if book.work_key in seen_work_keys:
                continue
            seen_work_keys.add(book.work_key)

            if not book.title or book.title.lower() in ("untitled", ""):
                continue

            place = book_to_literary_place(book, city, city_info)
            all_places.append(place)

    logger.info(f"Generated {len(all_places)} literary places from {len(city_names)} cities")
    return all_places


async def main():
    parser = argparse.ArgumentParser(description="Akhand data ingestion pipeline")
    parser.add_argument("--limit", type=int, default=15, help="Books per city")
    parser.add_argument("--south-asia-only", action="store_true", help="Only South Asian cities")
    parser.add_argument("--no-descriptions", action="store_true", help="Skip fetching descriptions")
    parser.add_argument("--output", type=str, default=None, help="Output JSON path")
    args = parser.parse_args()

    cities = CITIES
    if args.south_asia_only:
        cities = {k: v for k, v in CITIES.items() if v["region"] == "South Asia"}

    places = await run_ingestion(
        cities=cities,
        limit_per_city=args.limit,
        enrich_descriptions=not args.no_descriptions,
    )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = Path(args.output) if args.output else OUTPUT_DIR / "literary_places.json"

    with open(output_path, "w") as f:
        json.dump(
            {
                "version": "0.4.0",
                "source": "openlibrary",
                "total": len(places),
                "cities_queried": len(cities),
                "alias_expanded": True,
                "places": places,
            },
            f,
            indent=2,
            ensure_ascii=False,
        )

    logger.info(f"Wrote {len(places)} places to {output_path}")

    # Print summary
    from collections import Counter
    regions = Counter(p["region"] for p in places)
    print(f"\n{'='*60}")
    print(f"INGESTION COMPLETE: {len(places)} literary places")
    print(f"{'='*60}")
    for region, count in regions.most_common():
        print(f"  {region}: {count}")
    print(f"\nOutput: {output_path}")


if __name__ == "__main__":
    asyncio.run(main())
