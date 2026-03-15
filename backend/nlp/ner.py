"""
Named Entity Recognition for literary geography.

Uses spaCy as the fast first pass. The pipeline supports:
- GPE (geopolitical entities): countries, cities, states
- LOC (locations): mountains, rivers, bodies of water
- FAC (facilities): buildings, airports, highways, bridges
"""

from dataclasses import dataclass, field

import spacy
from spacy.language import Language
from spacy.tokens import Doc


@dataclass
class EntityResult:
    text: str
    label: str
    start_char: int
    end_char: int
    confidence: float = 1.0
    frequency: int = 1
    context: str = ""


def extract_entities(
    nlp: Language,
    text: str,
    target_labels: set[str] | None = None,
) -> list[EntityResult]:
    """
    Extract named entities from text using spaCy.

    For literary text, F1 drops ~20% vs news domain (spaCy) or ~14% (Stanza),
    per LREC 2022 benchmarks. Consider Stanza for multilingual passages or
    GPT-4o-mini for ambiguous cases.
    """
    if target_labels is None:
        target_labels = {"GPE", "LOC", "FAC"}

    doc = nlp(text)
    entities: list[EntityResult] = []
    seen: dict[str, int] = {}

    for ent in doc.ents:
        if ent.label_ not in target_labels:
            continue

        normalized = ent.text.strip()
        if len(normalized) < 2:
            continue

        key = normalized.lower()
        if key in seen:
            entities[seen[key]].frequency += 1
            continue

        ctx_start = max(0, ent.start_char - 50)
        ctx_end = min(len(text), ent.end_char + 50)

        seen[key] = len(entities)
        entities.append(
            EntityResult(
                text=normalized,
                label=ent.label_,
                start_char=ent.start_char,
                end_char=ent.end_char,
                confidence=_estimate_confidence(ent, doc),
                context=text[ctx_start:ctx_end],
            )
        )

    return entities


def _estimate_confidence(ent: spacy.tokens.Span, doc: Doc) -> float:
    """
    Rough confidence heuristic based on entity characteristics.
    A proper system would use Mordecai 3's neural disambiguation model.
    """
    score = 0.7  # base confidence for spaCy NER

    # Capitalized → higher confidence (proper noun)
    if ent.text[0].isupper():
        score += 0.1

    # Known label → boost
    if ent.label_ == "GPE":
        score += 0.1

    # Multi-word entities have higher confidence
    if len(ent.text.split()) > 1:
        score += 0.05

    return min(score, 1.0)
