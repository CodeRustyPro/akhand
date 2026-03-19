#!/usr/bin/env python3
"""
Gutenberg Pipeline: extract literary place references from Project Gutenberg.

Downloads the Gutenberg catalog, filters fiction titles mentioning known cities,
extracts passages via NER, and outputs new literary_places entries.

Prerequisites:
  pip install gutenbergpy spacy
  python -m spacy download en_core_web_md

Usage:
  python -m backend.scripts.gutenberg_pipeline --catalog    # Download/update catalog
  python -m backend.scripts.gutenberg_pipeline --scan       # Scan for matching fiction
  python -m backend.scripts.gutenberg_pipeline --extract    # Extract passages from matches
  python -m backend.scripts.gutenberg_pipeline --all        # Run full pipeline
"""

import json
import os
import re
import sys
import time
import argparse
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

DATA_DIR = Path(__file__).parent.parent / "data"
CACHE_DIR = DATA_DIR / "gutenberg_cache"
OUTPUT_PATH = DATA_DIR / "generated" / "gutenberg_places.json"
MATCHES_PATH = CACHE_DIR / "matched_books.json"

# Cities from the Akhand dataset to search for
CITIES = [
    "Mumbai", "Bombay", "Delhi", "Kolkata", "Calcutta", "Chennai", "Madras",
    "Bangalore", "Bengaluru", "Hyderabad", "Jaipur", "Lucknow", "Varanasi",
    "Benares", "Goa", "Kochi", "Cochin", "Pune", "Poona", "Ahmedabad",
    "Amritsar", "Shimla", "Simla", "Mysore", "Lahore", "Karachi", "Islamabad",
    "Dhaka", "Dacca", "Colombo", "Kathmandu", "Kabul",
    "London", "Paris", "Dublin", "Moscow", "St Petersburg", "Prague",
    "Istanbul", "Constantinople", "Cairo", "Algiers",
    "New York", "Boston", "Buenos Aires", "Tokyo",
    "Lagos", "Nairobi",
    # Indian regions/features
    "Ganges", "Ganga", "Himalaya", "Rajasthan", "Kashmir", "Punjab",
    "Bengal", "Malabar", "Deccan",
]

FICTION_SUBJECTS = {
    "fiction", "novel", "stories", "romance", "adventure",
    "mystery", "fantasy", "allegory", "tale", "fable",
}


def setup_cache():
    """Create cache directory."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)


def download_catalog():
    """Download and cache the Gutenberg catalog."""
    try:
        from gutenbergpy.gutenbergcache import GutenbergCache
    except ImportError:
        print("ERROR: Install gutenbergpy: pip install gutenbergpy")
        sys.exit(1)

    print("Downloading Gutenberg catalog (this may take a few minutes)...")
    GutenbergCache.create()
    print("Catalog ready.")


def scan_catalog() -> list[dict]:
    """Scan Gutenberg catalog for fiction containing our target cities."""
    try:
        from gutenbergpy.gutenbergcache import GutenbergCache
        from gutenbergpy.gutenbergcache import get_metadata
    except ImportError:
        print("ERROR: Install gutenbergpy: pip install gutenbergpy")
        sys.exit(1)

    print("Scanning Gutenberg catalog for fiction with target cities...")

    cache = GutenbergCache.get_cache()
    matches = []

    # Get all English fiction
    # This is a simplified scan - gutenbergpy provides SQLite-based queries
    all_books = cache.query(downloadtype=['text/plain; charset=utf-8'])

    city_pattern = re.compile(
        r'\b(' + '|'.join(re.escape(c) for c in CITIES) + r')\b',
        re.IGNORECASE
    )

    checked = 0
    for book_id in all_books[:10000]:  # Limit to prevent timeout
        try:
            meta = get_metadata('title', book_id)
            subjects = get_metadata('subject', book_id)
            authors = get_metadata('author', book_id)

            if not meta:
                continue

            title = meta[0] if meta else ""
            subject_str = " ".join(subjects).lower() if subjects else ""
            author = authors[0] if authors else "Unknown"

            # Check if fiction
            is_fiction = any(s in subject_str for s in FICTION_SUBJECTS)
            if not is_fiction:
                continue

            # Check title/subjects for city names
            searchable = f"{title} {subject_str}"
            city_match = city_pattern.search(searchable)

            if city_match:
                matches.append({
                    "gutenberg_id": book_id,
                    "title": title,
                    "author": author,
                    "subjects": subjects[:5] if subjects else [],
                    "matched_city": city_match.group(0),
                })

            checked += 1
            if checked % 1000 == 0:
                print(f"  Scanned {checked} books, found {len(matches)} matches...")

        except Exception:
            continue

    print(f"\nScanned {checked} books, found {len(matches)} fiction titles with target cities")

    # Save matches
    with open(MATCHES_PATH, "w") as f:
        json.dump(matches, f, indent=2)
    print(f"Saved to {MATCHES_PATH}")

    return matches


def extract_passages(max_books: int = 50):
    """Download matching books and extract place-related passages."""
    try:
        from gutenbergpy import textget
        import spacy
    except ImportError:
        print("ERROR: Install gutenbergpy and spacy")
        sys.exit(1)

    # Load matches
    if not MATCHES_PATH.exists():
        print("ERROR: Run --scan first")
        sys.exit(1)

    with open(MATCHES_PATH) as f:
        matches = json.load(f)

    print(f"Extracting passages from {min(len(matches), max_books)} books...")

    # Load spaCy
    nlp = spacy.load("en_core_web_md")

    city_pattern = re.compile(
        r'\b(' + '|'.join(re.escape(c) for c in CITIES) + r')\b',
        re.IGNORECASE
    )

    results = []

    for i, match in enumerate(matches[:max_books]):
        gid = match["gutenberg_id"]
        title = match["title"]
        print(f"[{i + 1}/{min(len(matches), max_books)}] {title}")

        try:
            # Download text
            raw = textget.get_text_by_id(gid)
            if not raw:
                continue
            text = raw.decode("utf-8", errors="ignore")

            # Strip Gutenberg header/footer
            text = textget.strip_headers(text) if hasattr(textget, 'strip_headers') else text

            # Find paragraphs mentioning cities
            paragraphs = text.split("\n\n")
            city_paragraphs = []

            for para in paragraphs:
                para = para.strip()
                if len(para) < 50 or len(para) > 1000:
                    continue
                city_match = city_pattern.search(para)
                if city_match:
                    city_paragraphs.append({
                        "text": para,
                        "city": city_match.group(0),
                    })

            if not city_paragraphs:
                continue

            # NER on best passages (limit to 5 per book)
            for cp in city_paragraphs[:5]:
                doc = nlp(cp["text"])
                locations = [ent.text for ent in doc.ents if ent.label_ in ("GPE", "LOC", "FAC")]

                if locations:
                    results.append({
                        "gutenberg_id": gid,
                        "bookTitle": title,
                        "author": match["author"],
                        "passage": cp["text"][:500],
                        "matched_city": cp["city"],
                        "ner_locations": locations,
                        "source": "gutenberg",
                    })

            print(f"    Found {len(city_paragraphs)} passages, kept {min(len(city_paragraphs), 5)}")
            time.sleep(1)  # Rate limit

        except Exception as e:
            print(f"    Error: {e}")
            continue

    # Save results
    with open(OUTPUT_PATH, "w") as f:
        json.dump({"total": len(results), "passages": results}, f, indent=2, ensure_ascii=False)

    print(f"\nExtracted {len(results)} passages from {min(len(matches), max_books)} books")
    print(f"Output: {OUTPUT_PATH}")


def main():
    parser = argparse.ArgumentParser(description="Gutenberg Pipeline")
    parser.add_argument("--catalog", action="store_true", help="Download/update catalog")
    parser.add_argument("--scan", action="store_true", help="Scan for matching fiction")
    parser.add_argument("--extract", action="store_true", help="Extract passages")
    parser.add_argument("--all", action="store_true", help="Run full pipeline")
    parser.add_argument("--max-books", type=int, default=50, help="Max books to extract from")
    args = parser.parse_args()

    setup_cache()

    if args.all or args.catalog:
        download_catalog()
    if args.all or args.scan:
        scan_catalog()
    if args.all or args.extract:
        extract_passages(max_books=args.max_books)

    if not any([args.catalog, args.scan, args.extract, args.all]):
        parser.print_help()


if __name__ == "__main__":
    main()
