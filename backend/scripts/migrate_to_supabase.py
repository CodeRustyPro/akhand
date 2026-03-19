#!/usr/bin/env python3
"""
Migrate literary_places.json to Supabase PostgreSQL + PostGIS.

Prerequisites:
  1. Run backend/db/supabase_schema.sql in Supabase SQL Editor
  2. Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env

Usage:
  python -m backend.scripts.migrate_to_supabase
"""

import json
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


def load_json_data() -> list[dict]:
    """Load the literary places JSON dataset."""
    generated_dir = Path(__file__).parent.parent / "data" / "generated"
    candidates = [
        generated_dir / "literary_places_wikidata_enriched.json",
        generated_dir / "literary_places_wikidata_resolved.json",
        generated_dir / "literary_places_wikidata.json",
        generated_dir / "literary_places_enriched.json",
        generated_dir / "literary_places.json",
    ]
    path = next((candidate for candidate in candidates if candidate.exists()), None)
    if path is None:
        print(f"ERROR: no input file found in {generated_dir}")
        sys.exit(1)
    with open(path) as f:
        data = json.load(f)
    places = data.get("places", [])
    print(f"Loaded {len(places)} places from {path}")
    return places


def transform_place(p: dict) -> dict:
    """Transform a JSON place entry to Supabase row format."""
    sentiment = p.get("sentiment", {})
    coords = p.get("coordinates", [0, 0])

    return {
        "id": p.get("id", ""),
        "book_title": p.get("bookTitle", ""),
        "author": p.get("author", ""),
        "publish_year": p.get("publishYear"),
        "place_name": p.get("placeName", ""),
        "coordinates": coords,
        "place_type": p.get("placeType", "real"),
        "real_anchor": p.get("realAnchor"),
        "setting_type": p.get("settingType", "primary"),
        "narrative_era": p.get("narrativeEra", ""),
        "passage": p.get("passage", ""),
        "sentiment_polarity": sentiment.get("polarity", 0.0),
        "dominant_emotions": sentiment.get("dominantEmotions", []),
        "themes": sentiment.get("themes", []),
        "language": p.get("language", "English"),
        "genres": p.get("genres", []),
        "region": p.get("region", ""),
        "cover_url": p.get("coverUrl"),
        "open_library_key": p.get("openLibraryKey"),
        "open_library_url": p.get("openLibraryUrl"),
        "goodreads_url": p.get("goodreadsUrl"),
        "wikidata_book_id": p.get("wikidataBookId"),
        "wikidata_place_id": p.get("wikidataPlaceId"),
        "source": p.get("source", "manual"),
        "translator": p.get("translator"),
    }


def migrate(batch_size: int = 50):
    """Run the migration."""
    from backend.db.supabase_client import get_supabase_admin

    supabase = get_supabase_admin()
    places = load_json_data()

    # Check if table has data already
    existing = supabase.table("literary_places").select("id", count="exact").execute()
    existing_count = existing.count or 0
    if existing_count > 0:
        print(f"Table already has {existing_count} rows.")
        response = input("Delete existing data and re-migrate? (y/N): ")
        if response.lower() != "y":
            print("Aborting.")
            return
        print("Deleting existing data...")
        supabase.table("literary_places").delete().neq("id", "").execute()

    # Transform all entries
    rows = [transform_place(p) for p in places]
    print(f"Transformed {len(rows)} entries for migration")

    # Insert in batches
    total = len(rows)
    success = 0
    errors = []

    for i in range(0, total, batch_size):
        batch = rows[i : i + batch_size]
        try:
            result = supabase.table("literary_places").upsert(batch).execute()
            success += len(batch)
            print(f"  Migrated {success}/{total} ({success * 100 // total}%)")
        except Exception as e:
            error_msg = str(e)
            errors.append({"batch_start": i, "error": error_msg})
            print(f"  ERROR at batch {i}: {error_msg[:100]}")
            # Try individual inserts for this batch
            for row in batch:
                try:
                    supabase.table("literary_places").upsert(row).execute()
                    success += 1
                except Exception as e2:
                    errors.append({"id": row["id"], "error": str(e2)[:100]})

        time.sleep(0.1)  # Rate limit courtesy

    print(f"\nMigration complete: {success}/{total} entries migrated")
    if errors:
        print(f"Errors: {len(errors)}")
        for err in errors[:10]:
            print(f"  - {err}")

    # Verify spatial data
    print("\nVerifying PostGIS data...")
    test = supabase.rpc(
        "books_near_point",
        {"lng": 72.8777, "lat": 19.076, "radius_meters": 10000, "max_results": 5},
    ).execute()
    if test.data:
        print(f"PostGIS working! Found {len(test.data)} books near Mumbai:")
        for row in test.data:
            print(f"  - {row['book_title']} by {row['author']} ({row['distance_meters']:.0f}m)")
    else:
        print("WARNING: PostGIS query returned no results. Check geom trigger.")


if __name__ == "__main__":
    migrate()
