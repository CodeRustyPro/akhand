#!/usr/bin/env python3
"""
Free-tier enrichment drip: process unenriched entries at 900/day.

Usage:
  python -m backend.scripts.enrichment_drip --limit 900

Checkpoints progress so you can stop and resume.
Uses gemini-3-flash-preview (free tier: 1000 req/day).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import time
from pathlib import Path

# Load .env from project root
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent.parent / ".env")

TIERED_INPUT = Path(__file__).parent.parent / "data" / "generated" / "literary_places_cleaned_v2_tiered.json"
CHECKPOINT_FILE = Path(__file__).parent.parent / "data" / "generated" / "enrichment_drip_checkpoint.json"
OUTPUT_FILE = Path(__file__).parent.parent / "data" / "generated" / "enrichment_drip_results.jsonl"

SYSTEM_PROMPT = """\
You are a literary analyst. Given a book-place record, return a JSON object with exactly these fields:
{
  "polarity": <float -1.0 to 1.0, emotional valence of the setting portrayal>,
  "dominant_emotions": [<3-5 specific emotion words, snake_case>],
  "themes": [<4-6 grounded thematic tags, compound snake_case like "colonial_labor_exploitation">],
  "literary_mood": <single snake_case mood tag>
}

Rules:
- Themes MUST be grounded: include a concrete anchor (war, labor, prison, migration, etc.) AND a thematic abstraction (oppression, displacement, conflict, etc.)
- No generic themes like "identity", "society", "power" as standalone
- Emotions should be specific: "yearning", "dread", "defiance" not "sad" or "happy"
- polarity: negative for dark/tragic, positive for hopeful/comedic, near-zero for neutral/ambiguous
"""

SCHEMA = {
    "type": "object",
    "properties": {
        "polarity": {"type": "number"},
        "dominant_emotions": {"type": "array", "items": {"type": "string"}},
        "themes": {"type": "array", "items": {"type": "string"}},
        "literary_mood": {"type": "string"},
    },
    "required": ["polarity", "dominant_emotions", "themes", "literary_mood"],
}

ANCHOR_TOKENS = {
    # Institutions/systems
    "labor", "worker", "workers", "industry", "court", "police", "plantation", "migration", "school",
    "prison", "union", "war", "insurgency", "surveillance", "bureaucracy", "crime", "religious",
    "colonial", "imperial", "farm", "village", "city", "underworld", "military", "trade", "mining",
    "railway", "port", "textile", "concubinage", "caste", "refugee", "diaspora", "investigation",
    "serial", "killer", "marriage", "family", "housing", "tenancy", "slum", "agrarian", "river",
    "sea", "forest", "university", "drought", "famine", "pandemic", "epidemic", "sectarian",
    "frontier", "rebellion", "expedition", "safari", "detective", "espionage", "smuggling",
    "piracy", "slavery", "abolition", "apartheid", "genocide", "partition", "revolution",
    "coffee", "oil", "gold", "diamond", "ivory", "rubber", "jungle", "desert", "ocean",
    # Romance/relationships
    "romance", "love", "affair", "wedding", "divorce", "courtship", "infidelity", "widow",
    # Urban/social
    "urban", "metropolitan", "suburban", "neighborhood", "estate", "manor", "aristocracy",
    "bourgeois", "poverty", "wealth", "class", "society", "salon", "club",
    # Coming of age
    "adolescence", "youth", "childhood", "boarding", "orphan", "inheritance",
    # Art/culture
    "art", "artist", "music", "musician", "theater", "theatre", "literary", "writer", "painter",
    "cinema", "film", "photography", "gallery", "museum", "opera", "ballet",
    # Mystery/death
    "murder", "death", "funeral", "cemetery", "ghost", "haunting", "mystery", "secret",
    # Nature/environment
    "nature", "wilderness", "pastoral", "garden", "park", "mountain", "island", "coast",
    # Travel/movement
    "journey", "voyage", "travel", "train", "ship", "road", "highway", "border", "exile",
    # Commerce/work
    "shop", "store", "market", "business", "office", "factory", "profession", "career",
    # Domestic
    "home", "house", "apartment", "domestic", "kitchen", "bedroom", "attic", "basement",
    # Religion/spirituality
    "church", "temple", "mosque", "monastery", "convent", "priest", "spiritual", "ritual",
    # Health/body
    "hospital", "asylum", "illness", "madness", "addiction", "body", "aging",
    # Time/history
    "war", "postwar", "prewar", "century", "era", "period", "generation", "memory",
}

ABSTRACTION_TOKENS = {
    # Core abstractions
    "oppression", "displacement", "conflict", "alienation", "stratification", "precarity", "trauma",
    "resistance", "marginalization", "erasure", "fragmentation", "violence", "coercion", "stagnation",
    "exploitation", "transformation", "disintegration", "radicalization", "solidarity", "agency",
    "corruption", "disillusionment", "survival", "deception", "ambition", "rivalry", "betrayal",
    "isolation", "confinement", "liberation", "subjugation", "othering", "hierarchy", "hubris",
    # Emotional/psychological
    "longing", "yearning", "nostalgia", "melancholy", "anxiety", "obsession", "desire", "passion",
    "grief", "loss", "regret", "guilt", "shame", "fear", "dread", "terror", "hope", "despair",
    # Social dynamics
    "tension", "struggle", "injustice", "inequality", "discrimination", "prejudice", "conformity",
    "rebellion", "defiance", "subversion", "transgression", "scandal", "hypocrisy", "morality",
    # Identity/self
    "identity", "selfhood", "belonging", "rootlessness", "authenticity", "reinvention", "discovery",
    # Relationships
    "intimacy", "estrangement", "reconciliation", "forgiveness", "resentment", "jealousy", "devotion",
    # Change/time
    "decay", "decline", "erosion", "renewal", "rebirth", "continuity", "rupture", "transition",
}


def _tokens(theme: str) -> set[str]:
    return {t for t in theme.lower().split("_") if t}


def validate_output(obj: dict) -> tuple[bool, str]:
    if not isinstance(obj, dict):
        return False, "not an object"
    for k in ["polarity", "dominant_emotions", "themes", "literary_mood"]:
        if k not in obj:
            return False, f"missing key: {k}"
    try:
        p = float(obj["polarity"])
    except Exception:
        return False, "polarity not numeric"
    if p < -1.0 or p > 1.0:
        return False, "polarity out of range"
    themes = obj["themes"]
    if not isinstance(themes, list) or len(themes) < 3:
        return False, "themes too few"
    has_anchor = any(_tokens(t) & ANCHOR_TOKENS for t in themes)
    has_abstraction = any(_tokens(t) & ABSTRACTION_TOKENS for t in themes)
    if not has_anchor:
        return False, "missing concrete anchor theme"
    if not has_abstraction:
        return False, "missing abstraction theme"
    return True, "ok"


def build_prompt(entry: dict) -> str:
    passage = (entry.get("passage") or "")[:1500]
    genres = ", ".join(entry.get("genres") or [])
    return f"""\
Analyze this book-place record:

book_title: {entry.get('bookTitle', '')}
author: {entry.get('author', '')}
publish_year: {entry.get('publishYear', '')}
place_name: {entry.get('placeName', '')}
region: {entry.get('region', '')}
language: {entry.get('language', '')}
genres: {genres}
narrative_era: {entry.get('narrativeEra', '')}
passage: {passage}
"""


def load_checkpoint() -> set[str]:
    if CHECKPOINT_FILE.exists():
        with open(CHECKPOINT_FILE) as f:
            return set(json.load(f).get("processed_ids", []))
    return set()


def save_checkpoint(processed_ids: set[str]):
    with open(CHECKPOINT_FILE, "w") as f:
        json.dump({"processed_ids": list(processed_ids)}, f)


def main():
    parser = argparse.ArgumentParser(description="Free-tier enrichment drip")
    parser.add_argument("--limit", type=int, default=900, help="Max entries to process (default 900)")
    parser.add_argument("--model", default="gemini-3-flash-preview", help="Gemini model to use")
    parser.add_argument("--delay", type=float, default=15.0, help="Delay between requests in seconds (free tier: 5/min)")
    args = parser.parse_args()

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise SystemExit("GEMINI_API_KEY not set")

    from google import genai
    client = genai.Client(api_key=api_key)

    # Load data
    print(f"Reading: {TIERED_INPUT}")
    with open(TIERED_INPUT) as f:
        data = json.load(f)
    places = data.get("places", [])
    print(f"Total entries: {len(places)}")

    # Load checkpoint
    processed_ids = load_checkpoint()
    print(f"Already processed: {len(processed_ids)}")

    # Find unenriched entries
    unenriched = [
        p for p in places
        if (p.get("enrichmentMethod") or "none") == "none"
        and p.get("id") not in processed_ids
        and (p.get("passage") or "").strip()  # need passage to analyze
    ]
    print(f"Unenriched with passages: {len(unenriched)}")

    # Limit
    batch = unenriched[:args.limit]
    print(f"Processing: {len(batch)}")

    if not batch:
        print("Nothing to process!")
        return

    success = 0
    failed = 0

    with open(OUTPUT_FILE, "a", encoding="utf-8") as outf:
        for i, entry in enumerate(batch, start=1):
            entry_id = entry.get("id", "")
            print(f"[{i}/{len(batch)}] {entry.get('bookTitle', '')[:50]} | {entry.get('placeName', '')}")

            prompt = build_prompt(entry)
            messages = [
                {"role": "user", "parts": [{"text": SYSTEM_PROMPT}]},
                {"role": "user", "parts": [{"text": prompt}]},
            ]

            result_obj = None
            reason = "unknown"

            # Retry with exponential backoff for rate limits
            max_retries = 3
            for attempt in range(max_retries):
                try:
                    response = client.models.generate_content(
                        model=args.model,
                        contents=messages,
                        config={
                            "temperature": 0.2,
                            "response_mime_type": "application/json",
                            "response_schema": SCHEMA,
                        },
                    )
                    text = (response.text or "").strip()
                    obj = json.loads(text)
                    ok, reason = validate_output(obj)
                    if ok:
                        result_obj = obj
                    break  # Success or validation failure, don't retry
                except Exception as e:
                    reason = f"exception: {e}"
                    # Check for rate limit (429)
                    if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
                        wait_time = 60 * (attempt + 1)  # 60s, 120s, 180s
                        print(f"  rate limited, waiting {wait_time}s...")
                        time.sleep(wait_time)
                        continue
                    break  # Other errors, don't retry

            row = {
                "id": entry_id,
                "book_title": entry.get("bookTitle", ""),
                "status": "ok" if result_obj else "fail",
                "reason": reason,
            }
            if result_obj:
                row["result"] = result_obj
                success += 1
                pol = result_obj.get("polarity", 0)
                emo = ", ".join(result_obj.get("dominant_emotions", [])[:3])
                themes = ", ".join(result_obj.get("themes", [])[:2])
                print(f"  +{pol:+.1f} | {emo} | {themes}")
            else:
                failed += 1
                print(f"  failed: {reason}")

            outf.write(json.dumps(row, ensure_ascii=False) + "\n")
            outf.flush()

            # Checkpoint
            processed_ids.add(entry_id)
            if i % 50 == 0:
                save_checkpoint(processed_ids)

            time.sleep(args.delay)

    # Final checkpoint
    save_checkpoint(processed_ids)

    print(f"\n{'='*50}")
    print(f"Done: {success} success, {failed} failed")
    print(f"Results appended to: {OUTPUT_FILE}")
    print(f"Checkpoint saved: {CHECKPOINT_FILE}")


if __name__ == "__main__":
    main()
