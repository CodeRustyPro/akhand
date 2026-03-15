"""
Celery worker for async NLP processing.

Handles long-running tasks like:
  - Full novel extraction (minutes per book)
  - Batch Open Library ingestion
  - Embedding generation
  - Wikidata bulk import
"""

import os
from celery import Celery
from dotenv import load_dotenv

load_dotenv()

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

app = Celery(
    "akhand",
    broker=REDIS_URL,
    backend=REDIS_URL,
)

app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)


@app.task(bind=True, max_retries=3)
def process_book(self, text: str, title: str, author: str):
    """Run the full NLP pipeline on a book-length text."""
    from backend.nlp.pipeline import LiteraryGeographyPipeline, PipelineConfig

    pipeline = LiteraryGeographyPipeline(PipelineConfig(use_gemini=True))
    result = pipeline.extract(text=text, title=title, author=author)
    return {
        "entities": len(result.entities),
        "geocoded": len(result.geocoded_places),
        "literary_places": len(result.literary_places),
        "processing_time_ms": result.processing_time_ms,
    }


@app.task
def ingest_from_openlibrary(cities: list[str], limit_per_city: int = 15):
    """Run the Open Library ingestion pipeline."""
    import asyncio
    from backend.data.ingest import run_ingestion, CITIES

    filtered = {k: v for k, v in CITIES.items() if k in cities} if cities else CITIES
    places = asyncio.run(run_ingestion(cities=filtered, limit_per_city=limit_per_city))
    return {"count": len(places)}
