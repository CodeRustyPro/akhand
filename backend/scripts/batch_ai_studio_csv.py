#!/usr/bin/env python3
"""
Batch-process AI Studio CSV rows through Gemini with strict JSON output.

Usage:
  /Users/dev/akhand/.venv/bin/python backend/scripts/batch_ai_studio_csv.py \
    --input backend/data/generated/selective_enrichment_remaining_ai_studio.csv \
    --output backend/data/generated/selective_enrichment_remaining_ai_outputs.jsonl \
        --model gemini-3-flash-preview
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import time
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


SYSTEM_PROMPT = """You are a literary-geography extraction engine.

You will receive exactly ONE book-place record.
Do not infer that a CSV or multiple rows must be processed.
Do not discuss workflow. Do not output reasoning. Output JSON only.

Hard constraints:
- Return exactly one JSON object matching schema.
- themes must be 4-6 snake_case labels, each with 2-6 tokens.
- At least one theme must include a concrete anchor (institution/system/event/place-role), e.g. labor, court, police, plantation, migration, war, school, prison, union, industry.
- At least one theme must include a thematic abstraction, e.g. oppression, displacement, conflict, alienation, stratification, precarity, trauma, resistance.
- Avoid ornamental compounds and aesthetic hallucinations.
- Avoid generic one-word abstractions: identity, society, class, history, love, war, power, life.
- Do not force city stereotypes.
- If evidence is weak, be conservative but still schema-valid.

Quality check before final JSON:
- Theme set must include:
  - >=1 concrete anchor theme (industry/institution/event/place-role)
  - >=1 abstraction theme (precarity/conflict/displacement/alienation/etc)
  - >=2 record-specific themes tied to THIS title/place context
- Avoid generic adventure labels unless supported by passage.
- Prefer historically grounded labels when publication context suggests them.
- If unsure, reduce confidence via conservative polarity and simpler grounded themes.

Output format:
- JSON only
- no markdown
- no extra keys
"""

RETRY_PROMPT = """Revise and re-output JSON only.

Failures to fix:
- themes were not valid snake_case labels
- missing concrete anchor and/or thematic abstraction
- ornamental or generic labels detected

Re-generate with 4-6 grounded themes and strict schema compliance.
"""

SCHEMA = {
    "type": "object",
    "required": ["polarity", "dominant_emotions", "themes", "literary_mood"],
    "properties": {
        "polarity": {"type": "number", "minimum": -1.0, "maximum": 1.0},
        "dominant_emotions": {
            "type": "array",
            "minItems": 3,
            "maxItems": 5,
            "items": {"type": "string", "pattern": "^[a-z_]+$"},
        },
        "themes": {
            "type": "array",
            "minItems": 4,
            "maxItems": 6,
            "items": {"type": "string", "pattern": "^[a-z0-9]+(?:_[a-z0-9]+)+$"},
        },
        "literary_mood": {
            "type": "string",
            "minLength": 2,
            "maxLength": 40,
            "pattern": "^[a-z_]+$",
        },
    },
}

SNAKE_MULTI_TOKEN = re.compile(r"^[a-z0-9]+(?:_[a-z0-9]+)+$")
SNAKE_SINGLE = re.compile(r"^[a-z_]+$")

ANCHOR_TOKENS = {
    "labor", "worker", "workers", "industry", "court", "police", "plantation", "migration", "school",
    "prison", "union", "war", "insurgency", "surveillance", "bureaucracy", "crime", "religious",
    "colonial", "imperial", "farm", "village", "city", "underworld", "military", "trade", "mining",
    "railway", "port", "textile", "concubinage", "caste", "refugee", "diaspora", "investigation",
    "serial", "killer", "marriage", "family", "housing", "tenancy", "slum", "agrarian", "river",
    "sea", "forest", "university", "drought", "famine", "pandemic", "epidemic", "sectarian",
    "frontier", "rebellion", "expedition", "safari", "detective", "espionage", "smuggling",
    "piracy", "slavery", "abolition", "apartheid", "genocide", "partition", "revolution",
    "coffee", "oil", "gold", "diamond", "ivory", "rubber", "jungle", "desert", "ocean",
    "charity", "church", "mosque", "temple", "hospital", "orphanage", "embassy",
}

ABSTRACTION_TOKENS = {
    "oppression", "displacement", "conflict", "alienation", "stratification", "precarity", "trauma",
    "resistance", "marginalization", "erasure", "fragmentation", "violence", "coercion", "stagnation",
    "exploitation", "transformation", "disintegration", "radicalization", "solidarity", "agency",
    "corruption", "disillusionment", "survival", "deception", "ambition", "rivalry", "betrayal",
    "isolation", "confinement", "liberation", "subjugation", "othering", "hierarchy", "hubris",
    "horror", "dread", "obsession", "paranoia", "vengeance", "redemption", "scams",
}

# Block only as standalone single-token themes, not as sub-tokens of compounds.
# e.g. reject theme "war" but accept "colonial_war_trauma".
GENERIC_STANDALONE_BLOCKLIST = {"identity", "society", "class", "history", "love", "war", "power", "life"}


def _tokens(theme: str) -> set[str]:
    return {t for t in theme.split("_") if t}


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

    emos = obj["dominant_emotions"]
    if not isinstance(emos, list) or not (3 <= len(emos) <= 5):
        return False, "dominant_emotions size invalid"
    if not all(isinstance(e, str) and SNAKE_SINGLE.fullmatch(e) for e in emos):
        return False, "dominant_emotions format invalid"

    themes = obj["themes"]
    if not isinstance(themes, list) or not (4 <= len(themes) <= 6):
        return False, "themes size invalid"
    if not all(isinstance(t, str) and SNAKE_MULTI_TOKEN.fullmatch(t) for t in themes):
        return False, "themes format invalid"

    mood = obj["literary_mood"]
    if not (isinstance(mood, str) and 2 <= len(mood) <= 40 and SNAKE_SINGLE.fullmatch(mood)):
        return False, "literary_mood format invalid"

    if any(t in GENERIC_STANDALONE_BLOCKLIST for t in themes):
        return False, "generic standalone theme"

    has_anchor = any(_tokens(t) & ANCHOR_TOKENS for t in themes)
    has_abstraction = any(_tokens(t) & ABSTRACTION_TOKENS for t in themes)
    if not has_anchor:
        return False, "missing concrete anchor theme"
    if not has_abstraction:
        return False, "missing abstraction theme"

    return True, "ok"


def build_user_prompt(row: dict) -> str:
    return (
        "Analyze this ONE book-place record and return grounded JSON only.\n\n"
        f"row_key: {row.get('row_key','')}\n"
        f"book_title: {row.get('book_title','')}\n"
        f"author: {row.get('author','')}\n"
        f"publish_year: {row.get('publish_year','')}\n"
        f"place_name: {row.get('place_name','')}\n"
        f"region: {row.get('region','')}\n"
        f"language: {row.get('language','')}\n"
        f"genres: {row.get('genres_csv','')}\n"
        f"narrative_era: {row.get('narrative_era','')}\n"
        f"passage_or_summary: {row.get('passage_or_summary','')}\n"
    )


def run() -> None:
    parser = argparse.ArgumentParser(description="Batch AI Studio CSV processing with Gemini")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--model", default="gemini-3-flash-preview")
    parser.add_argument("--temperature", type=float, default=0.2)
    parser.add_argument("--delay-seconds", type=float, default=0.4)
    parser.add_argument("--start", type=int, default=0)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--retries", type=int, default=1)
    args = parser.parse_args()

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise SystemExit("GEMINI_API_KEY not found")

    from google import genai

    client = genai.Client(api_key=api_key)

    with args.input.open("r", encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))

    if args.start > 0:
        rows = rows[args.start:]
    if args.limit > 0:
        rows = rows[: args.limit]

    args.output.parent.mkdir(parents=True, exist_ok=True)

    success = 0
    failed = 0

    with args.output.open("w", encoding="utf-8") as outf:
        for i, row in enumerate(rows, start=1):
            row_key = row.get("row_key", f"row_{i}")
            print(f"[{i}/{len(rows)}] {row_key} | {row.get('book_title','')}")

            prompt = build_user_prompt(row)
            messages = [
                {"role": "user", "parts": [{"text": SYSTEM_PROMPT}]},
                {"role": "user", "parts": [{"text": prompt}]},
            ]

            result_obj = None
            reason = "unknown"

            for attempt in range(args.retries + 1):
                try:
                    response = client.models.generate_content(
                        model=args.model,
                        contents=messages,
                        config={
                            "temperature": args.temperature,
                            "response_mime_type": "application/json",
                            "response_schema": SCHEMA,
                        },
                    )
                    text = (response.text or "").strip()
                    obj = json.loads(text)
                    ok, reason = validate_output(obj)
                    if ok:
                        result_obj = obj
                        break
                    if attempt < args.retries:
                        messages.append({"role": "user", "parts": [{"text": RETRY_PROMPT}]})
                except Exception as e:
                    reason = f"exception: {e}"
                    if attempt < args.retries:
                        messages.append({"role": "user", "parts": [{"text": RETRY_PROMPT}]})
                        time.sleep(0.7)

            if result_obj is None:
                failed += 1
                out_row = {
                    "row_key": row_key,
                    "id": row.get("id", ""),
                    "book_title": row.get("book_title", ""),
                    "status": "failed",
                    "reason": reason,
                    "result": None,
                }
                print(f"  failed: {reason}")
            else:
                success += 1
                out_row = {
                    "row_key": row_key,
                    "id": row.get("id", ""),
                    "book_title": row.get("book_title", ""),
                    "status": "ok",
                    "reason": "ok",
                    "result": result_obj,
                }
                print(
                    f"  {result_obj['polarity']:+.1f} | "
                    f"{', '.join(result_obj['dominant_emotions'][:3])} | "
                    f"themes: {', '.join(result_obj['themes'][:3])}"
                )

            outf.write(json.dumps(out_row, ensure_ascii=False) + "\n")
            outf.flush()
            time.sleep(max(args.delay_seconds, 0.0))

    print("=" * 60)
    print(f"Done. success={success} failed={failed} output={args.output}")


if __name__ == "__main__":
    run()
