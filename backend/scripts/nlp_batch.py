#!/usr/bin/env python3
"""
Batch NLP processing: run Gemini sentiment/emotion/theme analysis
on all entries missing rich sentiment data.

Uses Gemini Flash for literary emotions at ~$0.09 for 935 entries.
Checkpoint-based with JSON resume support.

Usage:
  python -m backend.scripts.nlp_batch
  python -m backend.scripts.nlp_batch --dry-run
  python -m backend.scripts.nlp_batch --resume
"""

import json
import os
import sys
import time
import argparse
import re
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

CHECKPOINT_PATH = Path(__file__).parent / "nlp_checkpoint.json"
DATA_PATH = Path(__file__).parent.parent / "data" / "generated" / "literary_places.json"
OUTPUT_PATH = Path(__file__).parent.parent / "data" / "generated" / "literary_places_enriched.json"

GENERIC_THEME_TERMS = {
    "class",
    "war",
    "home",
    "identity",
    "society",
    "life",
    "love",
    "history",
    "mortality",
    "power",
}

CITY_STEREOTYPE_TERMS = {
    "orientalist_fantasy",
    "harem_mythology",
    "imperial_nostalgia",
    "salon_decadence",
    "bourgeois_decay",
}

ADVENTURE_TITLE_HINTS = {"tarzan", "quest", "jungle", "expedition", "treasure", "adventure"}
ADVENTURE_THEME_HINTS = {
    "civilization_versus_wilderness",
    "wilderness_survival",
    "identity_reclamation",
    "adventure_quest",
    "colonial_adventure",
}

COLLECTED_WORKS_HINTS = {"works", "volumes", "collected", "complete"}
COLLECTED_THEMES_HINTS = {
    "gothic_psychology",
    "analytic_detection",
    "macabre_symbolism",
    "metaphysical_horror",
}

CITY_NAME_TOKENS = {
    "london", "paris", "istanbul", "dublin", "tokyo", "mumbai", "delhi",
    "new york", "los angeles", "berlin", "rome", "madrid", "moscow",
}

CITY_LENS_THEME_HINTS = {
    "salon", "orientalist", "harem", "imperial", "bohemian", "aristocratic",
    "bourgeois", "metropolis", "urban",
}

TITLE_THEME_OVERRIDES = {
    "good omens": ["bureaucratic_absurdity", "cosmic_indifference", "apocalyptic_farce"],
    "coraline": ["uncanny_doubling", "childhood_courage", "predatory_domestic_fantasy"],
    "bridget jones's diary": ["self_deprecating_humor", "urban_dating_anxiety", "media_workplace_precarity"],
    "stardust": ["threshold_crossing", "fallen_star_quest", "faerie_realm_bargains"],
    "dubliners": ["dublin_social_paralysis", "epiphanic_stasis", "irish_civic_stagnation"],
    "ficciones": ["metaphysical_labyrinths", "infinite_textuality", "epistemic_paradox"],
    "nine stories": ["postwar_psychological_fragility", "alienation_in_affluence", "moral_disquiet"],
    "the curious incident of the dog in the night-time": ["neurodivergent_cognition", "forensic_literalism", "family_trust_breakdown"],
}

FILLER_THEME_BLOCKLIST = {
    "social_constraint",
    "identity_negotiation",
    "setting_driven_narrative",
    "urban_or_regional_memory",
    "place_conditioned_experience",
    "memory_of_place",
    "belonging_and_exile",
    "tradition_vs_modernity",
    "cultural_tension",
    "social_hierarchy",
    "modernity_anxiety",
}

# Grounding guardrail: reject ornamental/constructed themes without real anchors.
ABSTRACT_THEME_TOKENS = {
    "identity",
    "negotiation",
    "social",
    "constraint",
    "experience",
    "setting",
    "driven",
    "narrative",
    "memory",
    "belonging",
    "exile",
    "tradition",
    "modernity",
    "tension",
    "hierarchy",
    "anxiety",
    "guilt",
    "decay",
    "integrity",
    "protocol",
    "conditioned",
    "place",
    "urban",
    "regional",
}

THEME_ANCHOR_TOKENS = {
    "labor",
    "worker",
    "workers",
    "textile",
    "plantation",
    "concubinage",
    "caste",
    "refugee",
    "migration",
    "diaspora",
    "investigation",
    "serial",
    "killer",
    "crime",
    "police",
    "court",
    "prison",
    "war",
    "insurgency",
    "military",
    "surveillance",
    "bureaucratic",
    "bureaucracy",
    "school",
    "university",
    "marriage",
    "family",
    "housing",
    "tenancy",
    "slum",
    "agrarian",
    "farm",
    "river",
    "sea",
    "forest",
    "village",
    "city",
    "underworld",
    "religious",
    "sectarian",
    "colonial",
    "imperial",
    "drought",
    "famine",
    "pandemic",
    "epidemic",
}

THEMATIC_ABSTRACTION_TOKENS = {
    "oppression",
    "exploitation",
    "transformation",
    "disintegration",
    "alienation",
    "displacement",
    "marginalization",
    "radicalization",
    "surveillance",
    "resistance",
    "trauma",
    "memory",
    "conflict",
    "violence",
    "coercion",
    "precarity",
    "mobility",
    "stagnation",
    "solidarity",
    "fragmentation",
    "stratification",
    "erasure",
    "agency",
    "identity",
    "exile",
    "belonging",
}

ABSTRACT_SUFFIX_BLOCKLIST = {
    "protocol",
    "integrity",
    "experience",
    "narrative",
    "memory",
    "condition",
}

HUMOR_HINTS = {"comedy", "satire", "humor", "humorous", "comic"}
CHILDREN_HINTS = {"children", "childrens", "juvenile", "picture", "middle grade"}


def _tokenize_genres(place: dict) -> set[str]:
    items = [str(x).lower() for x in (place.get("genres") or [])]
    return set(" ".join(items).split())


def _sanitize_themes(themes: list[str]) -> list[str]:
    clean: list[str] = []
    seen: set[str] = set()
    for raw in themes or []:
        t = re.sub(r"[^a-z0-9_]+", "_", str(raw).strip().lower())
        t = re.sub(r"_+", "_", t).strip("_")
        if not t or t in seen:
            continue
        seen.add(t)
        clean.append(t)
    return clean[:6]


def _theme_tokens(theme: str) -> set[str]:
    return {tok for tok in str(theme).split("_") if tok}


def _fails_grounding_guard(themes: list[str]) -> bool:
    if not themes:
        return True

    # At least one theme should point to a concrete social/physical anchor.
    has_anchor = False
    has_abstraction = False
    for t in themes:
        tokens = _theme_tokens(t)
        if tokens & THEME_ANCHOR_TOKENS:
            has_anchor = True
        if tokens & THEMATIC_ABSTRACTION_TOKENS:
            has_abstraction = True

        # Constructed aesthetics like "x_y_protocol" with no concrete anchor are rejected.
        if tokens and t.split("_")[-1] in ABSTRACT_SUFFIX_BLOCKLIST and not (tokens & THEME_ANCHOR_TOKENS):
            return True

        # 3+ token themes made entirely of abstract terms are usually ornamental hallucinations.
        if len(tokens) >= 3 and all(tok in ABSTRACT_THEME_TOKENS for tok in tokens):
            return True

    # Require at least one concrete anchor and one thematic abstraction signal.
    return not (has_anchor and has_abstraction)


def _theme_guard_feedback(themes: list[str]) -> str:
    has_anchor = any(_theme_tokens(t) & THEME_ANCHOR_TOKENS for t in themes)
    has_abstraction = any(_theme_tokens(t) & THEMATIC_ABSTRACTION_TOKENS for t in themes)
    feedback: list[str] = []
    if not has_anchor:
        feedback.append("missing concrete anchor (institution/system/event/place-role)")
    if not has_abstraction:
        feedback.append("missing thematic abstraction (oppression/displacement/conflict/etc.)")
    for t in themes:
        tokens = _theme_tokens(t)
        if len(tokens) >= 3 and all(tok in ABSTRACT_THEME_TOKENS for tok in tokens):
            feedback.append(f"overly abstract construction: {t}")
        if t.split("_")[-1] in ABSTRACT_SUFFIX_BLOCKLIST and not (tokens & THEME_ANCHOR_TOKENS):
            feedback.append(f"ornamental constructed suffix: {t}")
    if not feedback:
        return "theme set failed quality heuristics"
    return "; ".join(dict.fromkeys(feedback))


def _sanitize_emotions(emotions: list[str]) -> list[str]:
    aliases = {
        "obsessions": "obsession",
        "eerie": "eeriness",
        "chaotic": "chaos",
    }
    clean: list[str] = []
    seen: set[str] = set()
    for raw in emotions or []:
        e = str(raw).strip().lower()
        e = aliases.get(e, e)
        if not e or e in seen:
            continue
        seen.add(e)
        clean.append(e)
    return clean[:5]


def _title_key(place: dict) -> str:
    return str(place.get("bookTitle", "")).strip().lower()


def _is_qid_title(place: dict) -> bool:
    title = str(place.get("bookTitle", "")).strip()
    return bool(re.fullmatch(r"Q\d+", title))


def _title_geo_mismatch(place: dict) -> bool:
    title = _title_key(place)
    place_name = str(place.get("placeName", "")).strip().lower()
    for token in CITY_NAME_TOKENS:
        if token in title and token not in place_name:
            return True
    return False


def _looks_generic_or_biased(place: dict, result: dict) -> bool:
    themes = _sanitize_themes(result.get("themes", []))
    emotions = _sanitize_emotions(result.get("dominantEmotions") or [])
    place_name = str(place.get("placeName", "")).lower()
    genre_tokens = _tokenize_genres(place)
    title = str(place.get("bookTitle", "")).lower()
    tkey = _title_key(place)

    if len(emotions) < 3 or len(themes) < 4:
        return True

    if _fails_grounding_guard(themes):
        return True

    if tkey in TITLE_THEME_OVERRIDES:
        if not any(t in TITLE_THEME_OVERRIDES[tkey] for t in themes):
            return True

    generic_hits = sum(1 for t in themes if t in GENERIC_THEME_TERMS)
    if generic_hits >= 2:
        return True

    stereotype_hits = sum(1 for t in themes if t in CITY_STEREOTYPE_TERMS)
    if ("paris" in place_name or "istanbul" in place_name) and stereotype_hits >= 2:
        return True

    if _title_geo_mismatch(place):
        city_lens_hits = sum(1 for t in themes if any(h in t for h in CITY_LENS_THEME_HINTS))
        if city_lens_hits >= 1:
            return True

    # If title/genre strongly suggests humor, enforce at least one playful/comic signal.
    if (HUMOR_HINTS & genre_tokens) or any(h in title for h in HUMOR_HINTS):
        if not any(e in {"mischief", "playfulness", "jubilation", "intoxication"} for e in emotions):
            return True

    # If likely children's lit, avoid severe noir defaults as the only tone signal.
    if (CHILDREN_HINTS & genre_tokens) or "madeline" in title:
        dark_only = all(e in {"paranoia", "brutality", "revulsion", "desolation", "suffocation"} for e in emotions)
        if dark_only:
            return True

    # Adventure books should not collapse into salon/social themes only.
    if any(k in title for k in ADVENTURE_TITLE_HINTS):
        if not any(t in ADVENTURE_THEME_HINTS for t in themes):
            return True

    # Collected works should reflect breadth, not a single narrow city lens.
    if any(k in title for k in COLLECTED_WORKS_HINTS):
        if not any(t in COLLECTED_THEMES_HINTS for t in themes):
            return True

    return False


def _write_output_snapshot(output_path: Path, data: dict) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def _apply_conservative_overrides(place: dict, cleaned: dict) -> dict:
    title = str(place.get("bookTitle", "")).lower()
    tkey = _title_key(place)
    place_name = str(place.get("placeName", "")).lower()
    themes = _sanitize_themes(cleaned.get("themes", []))
    emotions = _sanitize_emotions(cleaned.get("dominantEmotions", []))
    theme_set = set(themes)

    if any(k in title for k in ADVENTURE_TITLE_HINTS) and not (theme_set & ADVENTURE_THEME_HINTS):
        themes = ["civilization_versus_wilderness", "identity_reclamation", *themes]
        themes = _sanitize_themes(themes)
        theme_set = set(themes)

    if any(k in title for k in COLLECTED_WORKS_HINTS) and not (theme_set & COLLECTED_THEMES_HINTS):
        themes = ["gothic_psychology", "analytic_detection", *themes]
        themes = _sanitize_themes(themes)

    genre_tokens = _tokenize_genres(place)
    if ((HUMOR_HINTS & genre_tokens) or any(h in title for h in HUMOR_HINTS)) and not any(
        e in {"mischief", "playfulness", "jubilation", "intoxication"} for e in emotions
    ):
        emotions = ["mischief", *emotions]
        emotions = _sanitize_emotions(emotions)

    if "paris" in place_name or "istanbul" in place_name:
        themes = [t for t in themes if t not in CITY_STEREOTYPE_TERMS]
        themes = _sanitize_themes(themes)

    if _title_geo_mismatch(place):
        themes = [t for t in themes if not any(h in t for h in CITY_LENS_THEME_HINTS)]
        themes = _sanitize_themes(themes)

    if tkey in TITLE_THEME_OVERRIDES:
        forced = TITLE_THEME_OVERRIDES[tkey]
        themes = _sanitize_themes([*forced, *themes])

    # Final defensive pass: strip obviously ornamental abstractions.
    pruned: list[str] = []
    for t in themes:
        tokens = _theme_tokens(t)
        if len(tokens) >= 3 and all(tok in ABSTRACT_THEME_TOKENS for tok in tokens):
            continue
        if t.split("_")[-1] in ABSTRACT_SUFFIX_BLOCKLIST and not (tokens & THEME_ANCHOR_TOKENS):
            continue
        pruned.append(t)
    themes = _sanitize_themes(pruned)

    cleaned["themes"] = themes[:6]
    cleaned["dominantEmotions"] = emotions[:5]
    return cleaned


def _is_filler_contaminated(place: dict) -> bool:
    sent = place.get("sentiment", {}) or {}
    themes = _sanitize_themes(sent.get("themes", []) or [])
    if not themes:
        return False
    filler_hits = sum(1 for t in themes if t in FILLER_THEME_BLOCKLIST)
    return filler_hits >= 2


def needs_enrichment(place: dict) -> bool:
    """Check if a place needs sentiment/emotion enrichment."""
    # Skip unresolved Wikidata QID placeholders until labels are resolved.
    if _is_qid_title(place):
        return False

    sentiment = place.get("sentiment", {})
    emotions = sentiment.get("dominantEmotions", [])
    themes = sentiment.get("themes", [])
    polarity = sentiment.get("polarity", 0.0)

    # Needs enrichment if: no emotions, few themes, or zero polarity with passage
    has_passage = bool(place.get("passage", "").strip())
    if not has_passage and polarity != 0.0:
        return False  # Already enriched and no passage to re-analyze
    if not has_passage and polarity == 0.0:
        return True   # Try enriching via book reputation even without passage
    if len(emotions) == 0:
        return True
    if len(themes) < 2:
        return True
    if polarity == 0.0 and has_passage:
        return True
    return False


def analyze_with_gemini(place: dict, client, model: str, retries: int = 2) -> dict:
    """Use Gemini to extract literary sentiment, emotions, and themes."""
    passage = place.get("passage", "")
    title = place.get("bookTitle", "")
    author = place.get("author", "")
    city = place.get("placeName", "")
    genres = ", ".join(place.get("genres", [])) or "fiction"
    year = place.get("publishYear", "")
    language = place.get("language", "")
    era = place.get("narrativeEra", "")

    # Build context string
    context_parts = [f'"{title}" by {author}']
    if year:
        context_parts.append(f"published {year}")
    if language and language != "English":
        context_parts.append(f"originally in {language}")
    context_parts.append(f"set in {city}")
    if era:
        context_parts.append(f"during {era}")
    context_parts.append(f"genre: {genres}")
    context_line = ", ".join(context_parts)

    prompt = f"""You are a literary critic. Analyze the emotional and thematic character of this specific book's relationship to its setting.

BOOK: {context_line}

{"PASSAGE: " + '"' + passage[:800] + '"' if passage.strip() else "No passage available — analyze based on the book's known reputation and the city's literary significance."}

TASK: Return a JSON object capturing what makes THIS specific book's portrayal of {city} distinctive.
Avoid generic labels and city stereotypes unless the work clearly supports them.

FIRST STEP (internal reasoning): decide setting binding strength = high / medium / low.
- If binding is low, do NOT force city-conditioned framing; prioritize book-level themes.
- If title implies a different geography than {city}, prioritize title-grounded interpretation over city priors.

CRITICAL RULES:
- Polarity must reflect the ACTUAL tone: a novel about slum poverty is negative, a love story is positive, a crime thriller is dark
- Emotions must be SPECIFIC to this book. Each book should feel different. Avoid defaulting to "awe" or "nostalgia" unless the text truly evokes them
- Themes must be CONCRETE to the plot/setting, not abstract filler. A book about textile workers → "labor_exploitation", not just "poverty"
- If you don't know the book well, use the title + genre + city + era conservatively.
- Do NOT default to city priors (e.g., Paris=bourgeois decay, Istanbul=orientalist nostalgia) when uncertain.
- Do NOT use one-word generic themes like class, war, home, identity.
- Themes must be 4-6 specific snake_case labels.
- If a work is humorous/satirical, include comic tone in emotions/themes.
- If it is children's literature, avoid over-intellectualized or excessively dark framing.

EMOTION PALETTE (pick 3-5 that ACTUALLY fit — do not always pick from the same 3):
  Positive: jubilation, tenderness, solidarity, reverence, mischief, serenity, pride, gratitude, euphoria, playfulness, hope
  Complex: ambivalence, bittersweet, wistfulness, restlessness, obsession, hunger, claustrophobia, vertigo, intoxication
  Dark: grief, fury, betrayal, shame, paranoia, suffocation, desolation, revulsion, helplessness, brutality, anguish
  Atmospheric: eeriness, languor, fever, stillness, chaos, electricity, heaviness

EXAMPLE OUTPUTS:
1. "A Fine Balance" by Rohinton Mistry (Mumbai, literary fiction about caste/poverty):
   {{"polarity":-0.7,"dominant_emotions":["helplessness","grief","solidarity","bittersweet","suffocation"],"themes":["caste_oppression","urban_poverty","state_violence","friendship_under_duress","textile_labor","emergency_era"],"literary_mood":"tragic"}}

2. "Sacred Games" by Vikram Chandra (Mumbai, crime noir):
   {{"polarity":-0.3,"dominant_emotions":["paranoia","hunger","intoxication","restlessness","fury"],"themes":["organized_crime","religious_tension","police_corruption","underworld_power","city_as_labyrinth","masculine_violence"],"literary_mood":"noir"}}

3. "The God of Small Things" by Arundhati Roy (Kerala, literary fiction):
   {{"polarity":-0.5,"dominant_emotions":["anguish","tenderness","claustrophobia","wistfulness","shame"],"themes":["caste_transgression","forbidden_love","childhood_trauma","postcolonial_kerala","political_violence","memory_fragmentation"],"literary_mood":"lyrical"}}

Now analyze THIS book. Return ONLY the JSON object, no other text:
{{"polarity": <float -1.0 to 1.0>, "dominant_emotions": [<3-5 specific emotions>], "themes": [<4-6 concrete themes in snake_case>], "literary_mood": "<mood>"}}"""

    for attempt in range(retries + 1):
        try:
            correction = ""
            if attempt > 0:
                correction = (
                    "\n\nREVISION MODE: Your previous output failed grounding checks. "
                    "Rewrite themes so the set includes BOTH: "
                    "(1) at least one concrete anchor (institution/system/event/place-role), and "
                    "(2) at least one thematic abstraction (oppression/displacement/conflict/identity/etc.). "
                    "Avoid decorative compound nouns and avoid city-aesthetic inventions."
                )
            response = client.models.generate_content(
                model=model,
                contents=prompt + correction,
            )
            text = response.text.strip()
            # Extract JSON from response
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0]
            elif "```" in text:
                text = text.split("```")[1].split("```")[0]

            result = json.loads(text)
            cleaned = {
                "polarity": max(-1.0, min(1.0, float(result.get("polarity", 0.0)))),
                "dominantEmotions": _sanitize_emotions(result.get("dominant_emotions", [])[:5]),
                "themes": _sanitize_themes(result.get("themes", [])[:6]),
                "literaryMood": result.get("literary_mood", ""),
            }
            if _looks_generic_or_biased(place, cleaned):
                if attempt < retries:
                    reason = _theme_guard_feedback(cleaned.get("themes", []))
                    print(f"    Quality guard retry: {reason}")
                    time.sleep(0.8)
                    continue
                print("    Quality guard: skipped low-confidence output")
                return None
            return _apply_conservative_overrides(place, cleaned)
        except Exception as e:
            if attempt == retries:
                print(f"    Gemini error: {e}")
                return None
            time.sleep(1.0)


def load_checkpoint(path: Path) -> set:
    """Load processed IDs from checkpoint."""
    if path.exists():
        with open(path) as f:
            return set(json.load(f))
    return set()


def save_checkpoint(path: Path, processed_ids: set):
    """Save processed IDs to checkpoint."""
    with open(path, "w") as f:
        json.dump(list(processed_ids), f)


def _entry_key(index: int, place: dict) -> str:
    """Stable per-row key for checkpointing, safe for duplicate IDs."""
    return f"{index}:{place.get('id', '')}"


def main():
    parser = argparse.ArgumentParser(description="Batch NLP processing")
    parser.add_argument("--dry-run", action="store_true", help="Count entries needing enrichment without processing")
    parser.add_argument("--resume", action="store_true", help="Resume from checkpoint")
    parser.add_argument("--limit", type=int, default=0, help="Limit number of entries to process")
    parser.add_argument("--input", type=str, help="Path to input json file. Overrides DATA_PATH")
    parser.add_argument("--output", type=str, help="Path to output json file. Overrides OUTPUT_PATH")
    parser.add_argument("--checkpoint", type=str, help="Checkpoint file path. Defaults to backend/scripts/nlp_checkpoint.json")
    parser.add_argument("--delay-seconds", type=float, default=0.35, help="Delay between Gemini requests")
    parser.add_argument("--checkpoint-every", type=int, default=25, help="Write checkpoint every N processed entries")
    parser.add_argument("--save-every", type=int, default=50, help="Write output snapshot every N processed entries")
    parser.add_argument("--model", type=str, default="gemini-3-flash-preview", help="Gemini model name")
    parser.add_argument("--sync-supabase", action="store_true", help="Also write enriched sentiment fields to Supabase")
    parser.add_argument(
        "--reprocess-filler",
        action="store_true",
        help="Reset filler-contaminated sentiment rows so they are re-enriched",
    )
    parser.add_argument(
        "--passage-only",
        action="store_true",
        help="Only enrich entries that have a passage (produces evidence_grounded, not inferred)",
    )
    parser.add_argument(
        "--selection-file",
        type=str,
        help="Optional newline-delimited file of row keys or IDs to process",
    )
    parser.add_argument(
        "--selection-key",
        type=str,
        choices=["row", "id"],
        default="row",
        help="Interpret --selection-file values as row keys ('row') or entry IDs ('id')",
    )
    args = parser.parse_args()

    input_path = Path(args.input) if args.input else DATA_PATH
    output_path = Path(args.output) if args.output else OUTPUT_PATH
    checkpoint_path = Path(args.checkpoint) if args.checkpoint else CHECKPOINT_PATH

    # Load data. On resume, prefer existing output snapshot to preserve prior progress.
    source_path = input_path
    if args.resume and output_path.exists():
        source_path = output_path
    if not source_path.exists():
        print(f"ERROR: {source_path} not found")
        sys.exit(1)

    with open(source_path) as f:
        data = json.load(f)

    places = data.get("places", [])
    print(f"Total entries: {len(places)}")

    if args.reprocess_filler:
        reset = 0
        for p in places:
            if _is_filler_contaminated(p):
                p["sentiment"] = {}
                p.pop("literaryMood", None)
                p.pop("enrichmentMethod", None)
                p.pop("enrichedByModel", None)
                reset += 1
        print(f"Reprocess filler enabled: reset {reset} contaminated entries")

    # Find entries needing enrichment
    to_process = [(idx, p) for idx, p in enumerate(places) if needs_enrichment(p)]
    print(f"Entries needing enrichment: {len(to_process)}")

    if args.selection_file:
        selection_path = Path(args.selection_file)
        if not selection_path.exists():
            print(f"ERROR: selection file not found: {selection_path}")
            sys.exit(1)
        selected_values = {
            line.strip() for line in selection_path.read_text().splitlines() if line.strip()
        }
        before = len(to_process)
        if args.selection_key == "row":
            to_process = [
                (idx, p) for idx, p in to_process if _entry_key(idx, p) in selected_values
            ]
        else:
            to_process = [
                (idx, p)
                for idx, p in to_process
                if str(p.get("id", "")).strip() in selected_values
            ]
        print(f"Selection filter ({args.selection_key}): {before} -> {len(to_process)}")

    if args.passage_only:
        before = len(to_process)
        to_process = [(idx, p) for idx, p in to_process if (p.get("passage") or "").strip()]
        print(f"Passage-only filter: {before} → {len(to_process)} (skipped {before - len(to_process)} without passage)")

    if args.dry_run:
        # Show breakdown
        no_emotions = sum(1 for p in places if not p.get("sentiment", {}).get("dominantEmotions"))
        no_themes = sum(1 for p in places if len(p.get("sentiment", {}).get("themes", [])) < 2)
        no_passage = sum(1 for p in places if not p.get("passage", "").strip())
        print(f"\nBreakdown:")
        print(f"  No emotions: {no_emotions}")
        print(f"  Few themes (<2): {no_themes}")
        print(f"  No passage (skip): {no_passage}")
        print(f"\nEstimated Gemini cost: ~${len(to_process) * 0.0001:.2f}")
        return

    # Load checkpoint
    processed_ids = load_checkpoint(checkpoint_path) if args.resume else set()
    if processed_ids:
        print(f"Resuming from checkpoint: {len(processed_ids)} already processed")
        to_process = [(idx, p) for idx, p in to_process if _entry_key(idx, p) not in processed_ids]
        print(f"Remaining: {len(to_process)}")

    if args.limit > 0:
        to_process = to_process[: args.limit]
        print(f"Limited to: {len(to_process)}")

    if not to_process:
        print("Nothing to process!")
        return

    # Init Gemini
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("ERROR: Set GEMINI_API_KEY in .env")
        sys.exit(1)

    from google import genai
    client = genai.Client(api_key=api_key)

    # Process
    success = 0
    errors = 0

    print(f"\nProcessing {len(to_process)} entries with Gemini...\n")

    try:
        for i, (idx, place) in enumerate(to_process):
            pid = place.get("id", "")
            row_key = _entry_key(idx, place)
            title = place.get("bookTitle", "unknown")

            print(f"[{i + 1}/{len(to_process)}] {title} — {place.get('placeName', '')}")

            result = analyze_with_gemini(place, client, model=args.model)
            if result:
                # Update by row index to preserve duplicate IDs.
                places[idx]["sentiment"] = {
                    "polarity": result["polarity"],
                    "dominantEmotions": result["dominantEmotions"],
                    "themes": result["themes"],
                }
                places[idx]["enrichmentMethod"] = "gemini_passage" if (place.get("passage") or "").strip() else "gemini_reputation"
                places[idx]["enrichedByModel"] = args.model
                if result.get("literaryMood"):
                    places[idx]["literaryMood"] = result["literaryMood"]
                success += 1
                print(f"    {result['polarity']:+.1f} | {', '.join(result['dominantEmotions'][:3])} | themes: {', '.join(result['themes'][:3])}")
            else:
                errors += 1

            processed_ids.add(row_key)

            if args.checkpoint_every > 0 and (i + 1) % args.checkpoint_every == 0:
                save_checkpoint(checkpoint_path, processed_ids)
                print(f"  [checkpoint saved: {len(processed_ids)} processed]")

            if args.save_every > 0 and (i + 1) % args.save_every == 0:
                data["places"] = places
                _write_output_snapshot(output_path, data)
                print(f"  [output snapshot written: {output_path}]")

            time.sleep(max(args.delay_seconds, 0.0))
    except KeyboardInterrupt:
        print("\nInterrupted by user. Saving checkpoint and output snapshot...")
    finally:
        save_checkpoint(checkpoint_path, processed_ids)
        data["places"] = places
        _write_output_snapshot(output_path, data)

    print(f"\nDone! {success} enriched, {errors} errors")
    print(f"Output: {output_path}")

    # Also update Supabase if configured
    if args.sync_supabase:
        try:
            from backend.db.supabase_client import get_supabase_admin

            supabase = get_supabase_admin()
            print("\nUpdating Supabase with enriched sentiment...")
            updated = 0
            for idx, place in enumerate(places):
                if _entry_key(idx, place) not in processed_ids:
                    continue
                pid = place.get("id", "")
                s = place.get("sentiment", {})
                try:
                    supabase.table("literary_places").update({
                        "sentiment_polarity": s.get("polarity", 0.0),
                        "dominant_emotions": s.get("dominantEmotions", []),
                        "themes": s.get("themes", []),
                    }).eq("id", pid).execute()
                    updated += 1
                except Exception:
                    pass
            print(f"Updated {updated} rows in Supabase")
        except Exception as e:
            print(f"Supabase update skipped: {e}")


if __name__ == "__main__":
    main()
