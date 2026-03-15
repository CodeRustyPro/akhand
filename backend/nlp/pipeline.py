"""
Multi-stage NLP pipeline for literary geography extraction.

Layered architecture (from the second research report):

  Layer 1: Language detection → script normalization → text extraction
  Layer 2: NER — GLiNER (zero-shot, literary labels) + spaCy (fast, production)
           For South Asian texts → MuRIL/IndicNER; multilingual → GLiNER-Multi
  Layer 3: Geoparsing — GeoNames via geopy, historical name resolution
  Layer 4: Literary analysis — Gemini 3 Flash for structured extraction
           (sentiment, themes, place classification) on passages containing
           NER-detected place names. This reduces token volume by 80-90%.
  Layer 5: Geocoding via Nominatim + World Historical Gazetteer

The key optimization: only send passages containing NER-detected place names
to the LLM, reducing cost by an order of magnitude.
"""

import time
import logging
import os
from dataclasses import dataclass

import spacy

from backend.nlp.ner import extract_entities, EntityResult
from backend.nlp.geocoder import geocode_place, GeoResult
from backend.models.schemas import (
    ExtractedEntity,
    GeocodedPlace,
    LiteraryPlaceCreate,
    ExtractionResult,
    SentimentData,
    PlaceType,
    SettingType,
)

logger = logging.getLogger(__name__)

PLACE_LABELS = {"GPE", "LOC", "FAC"}
CONTEXT_WINDOW = 150

EMOTION_WORDS: dict[str, list[str]] = {
    "joy": ["happy", "joy", "delight", "laughter", "cheerful", "bright", "warm", "beautiful", "love", "peace"],
    "sadness": ["sad", "grief", "sorrow", "tears", "mourn", "loss", "lonely", "melancholy", "despair", "weep"],
    "fear": ["fear", "terror", "dread", "horror", "panic", "anxiety", "frightened", "dark", "shadow", "menace"],
    "anger": ["anger", "rage", "fury", "violent", "hate", "bitter", "cruel", "destroy", "burn", "wrath"],
    "nostalgia": ["remember", "memory", "childhood", "once", "used to", "long ago", "past", "return", "home", "forgotten"],
    "wonder": ["wonder", "awe", "magnificent", "vast", "infinite", "magical", "enchanted", "extraordinary", "miracle"],
    "longing": ["longing", "yearning", "desire", "ache", "wish", "miss", "distant", "far", "horizon", "dream"],
}


@dataclass
class PipelineConfig:
    spacy_model: str = "en_core_web_md"
    context_window: int = CONTEXT_WINDOW
    min_entity_freq: int = 1
    geocode_timeout: float = 5.0
    use_gliner: bool = True
    use_gemini: bool = True
    gliner_model: str = "english"
    gliner_threshold: float = 0.4


class LiteraryGeographyPipeline:
    def __init__(self, config: PipelineConfig | None = None):
        self.config = config or PipelineConfig()
        self._nlp: spacy.Language | None = None
        self._gliner = None
        self._gemini = None

    @property
    def nlp(self) -> spacy.Language:
        if self._nlp is None:
            try:
                self._nlp = spacy.load(self.config.spacy_model)
                logger.info(f"Loaded spaCy model: {self.config.spacy_model}")
            except OSError:
                logger.warning(
                    f"Model {self.config.spacy_model} not found, falling back to en_core_web_sm"
                )
                try:
                    self._nlp = spacy.load("en_core_web_sm")
                except OSError:
                    logger.error("No spaCy model available. Install with: python -m spacy download en_core_web_sm")
                    raise
        return self._nlp

    @property
    def gliner(self):
        """Lazy-load GLiNER for zero-shot NER."""
        if self._gliner is None and self.config.use_gliner:
            try:
                from backend.nlp.gliner_ner import LiteraryGLiNER
                self._gliner = LiteraryGLiNER(
                    model_name=self.config.gliner_model,
                    threshold=self.config.gliner_threshold,
                )
                logger.info("GLiNER initialized for zero-shot literary NER")
            except Exception as e:
                logger.warning(f"GLiNER unavailable, falling back to spaCy only: {e}")
                self.config.use_gliner = False
        return self._gliner

    @property
    def gemini(self):
        """Lazy-load Gemini extractor."""
        if self._gemini is None and self.config.use_gemini:
            api_key = os.getenv("GEMINI_API_KEY")
            if not api_key:
                logger.warning("GEMINI_API_KEY not set, LLM extraction disabled")
                self.config.use_gemini = False
                return None
            try:
                from backend.nlp.llm_extractor import GeminiExtractor
                self._gemini = GeminiExtractor(api_key=api_key)
                logger.info("Gemini 3 Flash extractor initialized")
            except Exception as e:
                logger.warning(f"Gemini unavailable: {e}")
                self.config.use_gemini = False
        return self._gemini

    def extract(
        self,
        text: str,
        title: str | None = None,
        author: str | None = None,
        language: str = "en",
    ) -> ExtractionResult:
        start = time.time()

        # ── Layer 2: NER (GLiNER + spaCy ensemble) ────────────────
        extracted_entities, unique_places = self._run_ner(text)

        # ── Layer 3: Geoparsing ───────────────────────────────────
        geocoded: list[GeocodedPlace] = []
        for name, entity in unique_places.items():
            result = geocode_place(entity.text, timeout=self.config.geocode_timeout)
            if result:
                geocoded.append(
                    GeocodedPlace(
                        name=entity.text,
                        latitude=result.latitude,
                        longitude=result.longitude,
                        country=result.country,
                        confidence=result.confidence,
                        is_historical_name=result.is_historical,
                        modern_name=result.modern_name,
                    )
                )

        # ── Layer 4: Passage extraction + analysis ────────────────
        literary_places: list[LiteraryPlaceCreate] = []
        for geo in geocoded:
            passages = self._extract_passages(text, geo.name)
            for passage in passages:
                # Try Gemini for rich extraction, fall back to rule-based
                sentiment, place_type = self._analyze_passage(
                    passage, geo.name, title, author
                )
                setting = self._classify_setting_type(
                    geo.name, unique_places.get(geo.name.lower(), None)
                )

                literary_places.append(
                    LiteraryPlaceCreate(
                        book_title=title or "Unknown",
                        author=author or "Unknown",
                        publish_year=0,
                        place_name=geo.name,
                        coordinates=(geo.longitude, geo.latitude),
                        place_type=place_type,
                        setting_type=setting,
                        passage=passage,
                        sentiment=sentiment,
                        language=language,
                        region=geo.country or "",
                    )
                )

        elapsed = (time.time() - start) * 1000

        return ExtractionResult(
            entities=extracted_entities,
            geocoded_places=geocoded,
            literary_places=literary_places,
            processing_time_ms=round(elapsed, 2),
        )

    def _run_ner(
        self, text: str
    ) -> tuple[list[ExtractedEntity], dict[str, EntityResult]]:
        """
        Run NER with GLiNER + spaCy ensemble.

        GLiNER provides zero-shot literary entity types (City, Village,
        Historical Place Name, Fictional Place, etc.) while spaCy provides
        fast, production-grade GPE/LOC/FAC extraction.
        Entities from both are merged and deduplicated.
        """
        # spaCy pass (always runs — fast and reliable)
        spacy_entities = extract_entities(self.nlp, text, PLACE_LABELS)

        extracted = [
            ExtractedEntity(
                text=e.text,
                label=e.label,
                start_char=e.start_char,
                end_char=e.end_char,
                confidence=e.confidence,
            )
            for e in spacy_entities
        ]

        unique_places: dict[str, EntityResult] = {}
        for e in spacy_entities:
            key = e.text.lower().strip()
            if key not in unique_places:
                unique_places[key] = e
            else:
                unique_places[key].frequency += 1

        # GLiNER pass (zero-shot literary labels)
        if self.config.use_gliner and self.gliner:
            try:
                gliner_entities = self.gliner.extract_chunked(text)
                for ge in gliner_entities:
                    key = ge.text.lower().strip()
                    if key not in unique_places:
                        unique_places[key] = EntityResult(
                            text=ge.text,
                            label=ge.label,
                            start_char=ge.start,
                            end_char=ge.end,
                            confidence=ge.score,
                        )
                        extracted.append(
                            ExtractedEntity(
                                text=ge.text,
                                label=ge.label,
                                start_char=ge.start,
                                end_char=ge.end,
                                confidence=ge.score,
                            )
                        )
                    else:
                        # Boost confidence when both models agree
                        existing = unique_places[key]
                        existing.confidence = min(
                            1.0, existing.confidence + 0.15
                        )

                logger.info(
                    f"GLiNER found {len(gliner_entities)} entities, "
                    f"{len(unique_places)} unique places total"
                )
            except Exception as e:
                logger.warning(f"GLiNER extraction failed, using spaCy only: {e}")

        return extracted, unique_places

    def _analyze_passage(
        self,
        passage: str,
        place_name: str,
        title: str | None,
        author: str | None,
    ) -> tuple[SentimentData, PlaceType]:
        """
        Analyze a passage using Gemini 3 Flash (if available) for rich
        sentiment/theme extraction, falling back to rule-based analysis.
        """
        place_type = PlaceType.real

        if self.config.use_gemini and self.gemini:
            try:
                result = self.gemini.extract_from_passage(
                    passage=passage,
                    title=title or "Unknown",
                    author=author or "Unknown",
                )
                if result.places:
                    for p in result.places:
                        if p.place_name.lower() == place_name.lower():
                            place_type = PlaceType(p.place_type)
                            break

                sentiment = SentimentData(
                    polarity=result.sentiment.polarity,
                    dominant_emotions=result.sentiment.dominant_emotions,
                    themes=result.sentiment.themes,
                )
                return sentiment, place_type

            except Exception as e:
                logger.warning(f"Gemini extraction failed for passage, using rule-based: {e}")

        return self._analyze_sentiment(passage), place_type

    def _extract_passages(self, text: str, place_name: str) -> list[str]:
        """Extract context windows around place mentions."""
        passages = []
        search_text = text.lower()
        search_name = place_name.lower()
        start = 0

        while True:
            idx = search_text.find(search_name, start)
            if idx == -1:
                break

            ctx_start = max(0, idx - self.config.context_window)
            ctx_end = min(len(text), idx + len(place_name) + self.config.context_window)

            while ctx_start > 0 and text[ctx_start] not in '.!?\n':
                ctx_start -= 1
            if ctx_start > 0:
                ctx_start += 2

            while ctx_end < len(text) and text[ctx_end] not in '.!?\n':
                ctx_end += 1
            if ctx_end < len(text):
                ctx_end += 1

            passage = text[ctx_start:ctx_end].strip()
            if passage and len(passage) > 20:
                passages.append(passage)

            start = idx + len(place_name)

            if len(passages) >= 3:
                break

        return passages

    def _analyze_sentiment(self, passage: str) -> SentimentData:
        """Rule-based sentiment analysis using emotion lexicon."""
        words = set(passage.lower().split())
        emotion_scores: dict[str, int] = {}

        for emotion, keywords in EMOTION_WORDS.items():
            score = sum(1 for w in keywords if w in words)
            if score > 0:
                emotion_scores[emotion] = score

        if not emotion_scores:
            return SentimentData(polarity=0.0, dominant_emotions=["neutral"], themes=[])

        positive = emotion_scores.get("joy", 0) + emotion_scores.get("wonder", 0)
        negative = (
            emotion_scores.get("sadness", 0)
            + emotion_scores.get("fear", 0)
            + emotion_scores.get("anger", 0)
        )
        total = positive + negative + emotion_scores.get("nostalgia", 0) + emotion_scores.get("longing", 0)

        polarity = (positive - negative) / max(total, 1)
        polarity = max(-1.0, min(1.0, polarity))

        sorted_emotions = sorted(emotion_scores.items(), key=lambda x: -x[1])
        dominant = [e for e, _ in sorted_emotions[:3]]

        return SentimentData(
            polarity=round(polarity, 2),
            dominant_emotions=dominant,
            themes=[],
        )

    def _classify_setting_type(
        self, place_name: str, entity: EntityResult | None
    ) -> SettingType:
        """Heuristic: high-frequency mentions → primary, low → mentioned."""
        if entity is None:
            return SettingType.mentioned
        if entity.frequency >= 5:
            return SettingType.primary
        if entity.frequency >= 2:
            return SettingType.secondary
        return SettingType.mentioned
