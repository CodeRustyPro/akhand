"""
GLiNER zero-shot Named Entity Recognition for literary geography.

GLiNER (Generalist NER using Bidirectional Transformer) enables zero-shot
NER — define entity types at inference time without retraining. It outperforms
ChatGPT on zero-shot NER benchmarks while being 140x smaller (~500M params),
running on CPU.

Key advantage over spaCy: instead of fixed entity types (GPE, LOC, FAC),
we define literary-specific labels that capture the nuances of fiction:
  - City, Village, Region, River, Mountain
  - Historical Place Name (Bombay, Calcutta, Constantinople)
  - Fictional Place (Malgudi, Macondo, Yoknapatawpha)
  - Neighborhood, Landmark, Route

The multilingual variant (GLiNER-Multi) shows strong cross-lingual transfer
for South Asian texts without language-specific fine-tuning.
"""

import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)

LITERARY_PLACE_LABELS = [
    "City",
    "Village",
    "Region",
    "Country",
    "River",
    "Mountain",
    "Neighborhood",
    "Landmark",
    "Historical Place Name",
    "Fictional Place",
    "Route",
    "Body of Water",
]

MODELS = {
    "english": "urchade/gliner_medium-v2.1",
    "multilingual": "urchade/gliner_multi-v2.1",
}


@dataclass
class GLiNEREntity:
    text: str
    label: str
    start: int
    end: int
    score: float


class LiteraryGLiNER:
    """Zero-shot NER tuned for literary place extraction."""

    def __init__(self, model_name: str = "english", threshold: float = 0.3):
        self._model = None
        self._model_name = MODELS.get(model_name, model_name)
        self.threshold = threshold

    @property
    def model(self):
        if self._model is None:
            try:
                from gliner import GLiNER
                logger.info(f"Loading GLiNER model: {self._model_name}")
                self._model = GLiNER.from_pretrained(self._model_name)
                logger.info("GLiNER model loaded")
            except ImportError:
                raise ImportError("Install GLiNER: pip install gliner")
            except Exception as e:
                raise RuntimeError(f"Failed to load GLiNER model: {e}")
        return self._model

    def extract(
        self,
        text: str,
        labels: list[str] | None = None,
        threshold: float | None = None,
    ) -> list[GLiNEREntity]:
        """
        Extract literary place entities from text.

        GLiNER processes text in chunks, so long texts are handled automatically.
        For book-length texts, chunk by paragraph or chapter for better results.
        """
        if labels is None:
            labels = LITERARY_PLACE_LABELS
        if threshold is None:
            threshold = self.threshold

        raw_entities = self.model.predict_entities(
            text, labels, threshold=threshold
        )

        entities = []
        seen = set()

        for ent in raw_entities:
            key = (ent["text"].lower().strip(), ent["label"])
            if key in seen:
                continue
            seen.add(key)

            entities.append(
                GLiNEREntity(
                    text=ent["text"],
                    label=ent["label"],
                    start=ent["start"],
                    end=ent["end"],
                    score=round(ent["score"], 4),
                )
            )

        return sorted(entities, key=lambda e: e.start)

    def extract_chunked(
        self,
        text: str,
        chunk_size: int = 2000,
        overlap: int = 200,
        labels: list[str] | None = None,
    ) -> list[GLiNEREntity]:
        """
        Extract from long texts by chunking with overlap.

        GLiNER's transformer has a context limit (~512 tokens).
        For book-length texts, chunk by paragraph boundaries when possible.
        """
        if len(text) <= chunk_size:
            return self.extract(text, labels)

        all_entities: list[GLiNEREntity] = []
        seen_spans: set[tuple[str, int, int]] = set()

        start = 0
        while start < len(text):
            end = min(start + chunk_size, len(text))

            # Try to break at a paragraph or sentence boundary
            if end < len(text):
                for boundary in ['\n\n', '\n', '. ', '? ', '! ']:
                    break_at = text.rfind(boundary, start + chunk_size - overlap, end)
                    if break_at > start:
                        end = break_at + len(boundary)
                        break

            chunk = text[start:end]
            chunk_entities = self.extract(chunk, labels)

            for ent in chunk_entities:
                abs_start = start + ent.start
                abs_end = start + ent.end
                span_key = (ent.text.lower().strip(), abs_start, abs_end)

                if span_key not in seen_spans:
                    seen_spans.add(span_key)
                    all_entities.append(
                        GLiNEREntity(
                            text=ent.text,
                            label=ent.label,
                            start=abs_start,
                            end=abs_end,
                            score=ent.score,
                        )
                    )

            start = end - overlap if end < len(text) else len(text)

        return sorted(all_entities, key=lambda e: e.start)

    def summarize(self, entities: list[GLiNEREntity]) -> dict[str, list[dict]]:
        """Group entities by label for a summary view."""
        grouped: dict[str, list[dict]] = {}
        for ent in entities:
            if ent.label not in grouped:
                grouped[ent.label] = []

            existing = next(
                (e for e in grouped[ent.label] if e["text"].lower() == ent.text.lower()),
                None,
            )
            if existing:
                existing["count"] += 1
                existing["max_score"] = max(existing["max_score"], ent.score)
            else:
                grouped[ent.label].append({
                    "text": ent.text,
                    "count": 1,
                    "max_score": ent.score,
                })

        for label in grouped:
            grouped[label].sort(key=lambda e: -e["count"])

        return grouped
