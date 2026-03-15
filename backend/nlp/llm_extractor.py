"""
Gemini-powered structured extraction for literary geography.

Uses Google's Gemini 3 Flash for cost-effective structured extraction
from literary text and book summaries. Gemini 3 Flash delivers
pro-level intelligence at flash pricing ($0.50/$3 per 1M tokens).

Architecture:
  - Single passage → extract place + sentiment + themes
  - Book summary → extract primary/secondary settings with confidence
  - Batch mode via Gemini Batch API for bulk processing

At ~$0.50/1M input tokens, processing 100 novels (~10M words, ~13M tokens)
costs approximately $6.50 input + $20 output ≈ $26 total with Flash.
"""

import os
import json
import logging
from dataclasses import dataclass

from google import genai
from google.genai import types
from pydantic import BaseModel, Field
from dotenv import load_dotenv

from backend.models.schemas import SentimentData, PlaceType, SettingType

load_dotenv()
logger = logging.getLogger(__name__)

GEMINI_MODEL = "gemini-3-flash-preview"


# ── Extraction schemas ─────────────────────────────────────────────

class ExtractedPlace(BaseModel):
    place_name: str = Field(description="The place name as it appears in the text")
    modern_name: str | None = Field(None, description="Modern name if the text uses a historical name (e.g. Bombay → Mumbai)")
    place_type: str = Field(description="One of: real, fictional_based_on_real, purely_fictional")
    real_anchor: str | None = Field(None, description="For fictional places, the real-world location it is based on")
    setting_type: str = Field(description="One of: primary, secondary, mentioned")
    confidence: float = Field(ge=0.0, le=1.0, description="Confidence score for this extraction")


class ExtractedSentiment(BaseModel):
    polarity: float = Field(ge=-1.0, le=1.0, description="Sentiment polarity from -1 (dark) to 1 (luminous)")
    dominant_emotions: list[str] = Field(description="Top 2-4 emotions: nostalgia, wonder, dread, joy, melancholy, rage, longing, etc.")
    themes: list[str] = Field(description="Literary themes: partition, diaspora, colonialism, monsoon, caste, identity, etc.")


class PassageExtraction(BaseModel):
    places: list[ExtractedPlace]
    sentiment: ExtractedSentiment
    narrative_era: str | None = Field(None, description="Time period the passage describes, e.g. '1947', '1960s-1970s'")
    language_of_original: str | None = Field(None, description="Original language if the text is translated")


class BookSummaryExtraction(BaseModel):
    primary_settings: list[ExtractedPlace] = Field(description="Main locations where the story is set")
    secondary_locations: list[ExtractedPlace] = Field(description="Other locations mentioned or visited")
    narrative_era: str | None = Field(None, description="Time period of the narrative")
    dominant_themes: list[str] = Field(description="Major literary themes")
    geographic_scope: str | None = Field(None, description="e.g. 'single city', 'multiple cities', 'transnational'")


# ── Prompts ────────────────────────────────────────────────────────

PASSAGE_EXTRACTION_PROMPT = """You are a literary geography analyst. Extract geographic and emotional data from this literary passage.

Identify every place mentioned — real cities, regions, rivers, neighborhoods, landmarks, and fictional locations based on real places (e.g. Malgudi is based on Mysore). For historical names (Bombay, Calcutta, Madras, Constantinople, Leningrad), provide the modern equivalent.

Classify each place's role: "primary" if the scene takes place there, "secondary" if characters discuss or remember it, "mentioned" if it appears in passing.

Analyze the passage's emotional geography: what sentiment does the author attach to this place? What emotions dominate? What literary themes emerge?

Book: {title}
Author: {author}

PASSAGE:
{passage}"""

SUMMARY_EXTRACTION_PROMPT = """You are a literary geography analyst. From this book summary, extract all geographic settings with high precision.

For each location, determine:
- Whether it's a primary setting (majority of action) or secondary (visited, remembered, or mentioned)
- Whether the place is real, fictional but based on a real location, or purely fictional
- Your confidence level (0.0-1.0) based on how clearly the summary indicates this setting

Be especially attentive to South Asian place names, historical names, and fictional locations based on real places.

Title: {title}
Author: {author}

SUMMARY:
{summary}"""


class GeminiExtractor:
    def __init__(self, api_key: str | None = None):
        key = api_key or os.getenv("GEMINI_API_KEY")
        if not key:
            raise ValueError(
                "GEMINI_API_KEY not found. Set it in .env or pass directly."
            )
        self._client = genai.Client(api_key=key)

    def extract_from_passage(
        self,
        passage: str,
        title: str = "Unknown",
        author: str = "Unknown",
    ) -> PassageExtraction:
        """Extract literary geography data from a single passage using Gemini 3 Flash."""
        prompt = PASSAGE_EXTRACTION_PROMPT.format(
            title=title, author=author, passage=passage
        )

        response = self._client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                thinking_config=types.ThinkingConfig(thinking_level="low"),
                response_mime_type="application/json",
                response_json_schema=PassageExtraction.model_json_schema(),
                temperature=1.0,
            ),
        )

        return PassageExtraction.model_validate_json(response.text)

    def extract_from_summary(
        self,
        summary: str,
        title: str = "Unknown",
        author: str = "Unknown",
    ) -> BookSummaryExtraction:
        """Extract settings from a book summary — the cheapest path to geographic data."""
        prompt = SUMMARY_EXTRACTION_PROMPT.format(
            title=title, author=author, summary=summary
        )

        response = self._client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                thinking_config=types.ThinkingConfig(thinking_level="low"),
                response_mime_type="application/json",
                response_json_schema=BookSummaryExtraction.model_json_schema(),
                temperature=1.0,
            ),
        )

        return BookSummaryExtraction.model_validate_json(response.text)

    def extract_batch_summaries(
        self,
        books: list[dict],
    ) -> list[BookSummaryExtraction]:
        """
        Process multiple book summaries sequentially.

        For true batch processing at 50% cost reduction, use the Gemini Batch API
        (supported by Gemini 3). At $0.25/1M input tokens (batch pricing),
        100K summaries costs ~$4.25.
        """
        results = []
        for book in books:
            try:
                result = self.extract_from_summary(
                    summary=book.get("summary", ""),
                    title=book.get("title", "Unknown"),
                    author=book.get("author", "Unknown"),
                )
                results.append(result)
            except Exception as e:
                logger.error(f"Failed to extract from '{book.get('title')}': {e}")
                continue
        return results

    def classify_place_type(
        self,
        place_name: str,
        context: str = "",
    ) -> dict:
        """Classify whether a place is real, fictional-based-on-real, or purely fictional."""
        prompt = f"""Classify this place from literature:

Place: {place_name}
Context: {context}

Is this place:
1. "real" — an actual geographic location
2. "fictional_based_on_real" — a fictional name for a real location (like Malgudi for Mysore)
3. "purely_fictional" — entirely invented with no real-world anchor

If fictional_based_on_real, identify the real anchor location.
"""
        schema = {
            "type": "object",
            "properties": {
                "place_type": {"type": "string", "enum": ["real", "fictional_based_on_real", "purely_fictional"]},
                "real_anchor": {"type": "string", "description": "The real location, if applicable"},
                "confidence": {"type": "number"},
                "reasoning": {"type": "string"},
            },
            "required": ["place_type", "confidence", "reasoning"],
        }

        response = self._client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                thinking_config=types.ThinkingConfig(thinking_level="low"),
                response_mime_type="application/json",
                response_json_schema=schema,
                temperature=1.0,
            ),
        )

        return json.loads(response.text)
