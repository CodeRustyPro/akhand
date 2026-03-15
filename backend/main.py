"""
Akhand — Literary Geography Platform API

FastAPI backend providing:
  - Multi-layer NLP extraction (GLiNER + spaCy + Gemini 3 Flash)
  - Wikidata P840 narrative location ingestion
  - CRUD for literary places
  - Search and filtering
  - Health checks
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from backend.models.schemas import (
    ExtractionRequest,
    ExtractionResult,
    LiteraryPlaceResponse,
    HealthResponse,
    BatchExtractionRequest,
    PassageAnalysis,
)

try:
    from backend.nlp.pipeline import LiteraryGeographyPipeline, PipelineConfig
    NLP_AVAILABLE = True
except ImportError:
    NLP_AVAILABLE = False
    LiteraryGeographyPipeline = None
    PipelineConfig = None

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

pipeline = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global pipeline
    if NLP_AVAILABLE:
        logger.info("Initializing NLP pipeline...")
        try:
            pipeline = LiteraryGeographyPipeline(
                PipelineConfig(
                    use_gliner=True,
                    use_gemini=True,
                )
            )
            _ = pipeline.nlp
            logger.info("NLP pipeline ready (spaCy loaded, GLiNER + Gemini lazy-loaded)")
        except Exception as e:
            logger.error(f"Failed to initialize pipeline: {e}")
            pipeline = None
    else:
        logger.info("NLP dependencies not installed, running in data-serving mode")
        pipeline = None
    yield
    logger.info("Shutting down")


app = FastAPI(
    title="Akhand API",
    description=(
        "Literary Geography Platform — GLiNER zero-shot NER, "
        "Gemini 3 Flash structured extraction, Wikidata P840 ingestion, "
        "and spatial literary analysis"
    ),
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://shahdev.me",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health ─────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(
        status="healthy" if pipeline else "degraded",
        spacy_model=pipeline.config.spacy_model if pipeline else None,
        version="0.2.0",
    )


# ── NLP Extraction ────────────────────────────────────────────────

@app.post("/api/extract", response_model=ExtractionResult)
async def extract_places(request: ExtractionRequest):
    """
    Extract literary places from text using the full NLP pipeline.

    Pipeline layers:
      1. GLiNER zero-shot NER (City, Village, Fictional Place, etc.)
      2. spaCy NER (GPE, LOC, FAC) — ensemble with GLiNER
      3. Geoparsing via Nominatim with historical name resolution
      4. Gemini 3 Flash structured extraction (sentiment, themes, place types)

    Only passages containing NER-detected place names are sent to Gemini,
    reducing token volume by 80-90%.
    """
    if not pipeline:
        raise HTTPException(
            status_code=503,
            detail="NLP pipeline not initialized. Install spaCy model: python -m spacy download en_core_web_md",
        )

    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    if len(request.text) > 500_000:
        raise HTTPException(
            status_code=413,
            detail="Text too large. Maximum 500,000 characters.",
        )

    result = pipeline.extract(
        text=request.text,
        title=request.title,
        author=request.author,
        language=request.language,
    )
    return result


@app.post("/api/extract/batch", response_model=list[ExtractionResult])
async def batch_extract(request: BatchExtractionRequest):
    """Extract places from multiple texts."""
    if not pipeline:
        raise HTTPException(status_code=503, detail="NLP pipeline not initialized")

    results = []
    for text_req in request.texts:
        result = pipeline.extract(
            text=text_req.text,
            title=text_req.title,
            author=text_req.author,
            language=text_req.language,
        )
        results.append(result)
    return results


# ── Gemini Extraction ─────────────────────────────────────────────

class SummaryExtractionRequest(BaseModel):
    title: str
    author: str
    summary: str


@app.post("/api/extract/summary")
async def extract_from_summary(request: SummaryExtractionRequest):
    """
    Extract geographic settings from a book summary using Gemini 3 Flash.

    The cheapest path to geographic data: processing 100K summaries costs ~$4-8
    with Gemini 3 Flash Batch API pricing.
    """
    if not pipeline or not pipeline.gemini:
        raise HTTPException(
            status_code=503,
            detail="Gemini extractor not available. Set GEMINI_API_KEY in .env",
        )

    result = pipeline.gemini.extract_from_summary(
        summary=request.summary,
        title=request.title,
        author=request.author,
    )
    return result


# ── Wikidata Ingestion ────────────────────────────────────────────

@app.get("/api/wikidata/narrative-locations")
async def wikidata_narrative_locations(
    region: str | None = Query(
        None,
        description="Filter: 'south_asia' for India/Pakistan/Bangladesh/Sri Lanka/Nepal",
    ),
    limit: int = Query(100, ge=1, le=5000),
):
    """
    Fetch literary works with narrative locations (P840) from Wikidata.

    This is the highest-value data source for bootstrapping: structured,
    CC0-licensed geographic metadata with zero NLP cost.
    """
    from backend.data.wikidata import (
        fetch_all_narrative_locations,
        fetch_south_asian_literature,
    )

    if region == "south_asia":
        results = await fetch_south_asian_literature()
    else:
        results = await fetch_all_narrative_locations()

    return {
        "count": len(results[:limit]),
        "total_available": len(results),
        "results": [
            {
                "book_qid": r.book_qid,
                "book_label": r.book_label,
                "place_qid": r.place_qid,
                "place_label": r.place_label,
                "latitude": r.latitude,
                "longitude": r.longitude,
                "author_label": r.author_label,
                "publication_year": r.publication_year,
                "language": r.language_label,
                "country": r.country_label,
            }
            for r in results[:limit]
        ],
    }


@app.get("/api/wikidata/city/{place_qid}")
async def wikidata_city_books(place_qid: str):
    """Fetch all literary works set in a specific city by Wikidata QID."""
    from backend.data.wikidata import fetch_books_for_city

    if not place_qid.startswith("Q"):
        raise HTTPException(status_code=400, detail="Invalid Wikidata QID format")

    results = await fetch_books_for_city(place_qid)
    return {"place_qid": place_qid, "count": len(results), "books": results}


@app.get("/api/wikidata/historical-names/{place_qid}")
async def wikidata_historical_names(place_qid: str):
    """Fetch historical/alternate names for a place with date ranges."""
    from backend.data.wikidata import fetch_historical_names

    if not place_qid.startswith("Q"):
        raise HTTPException(status_code=400, detail="Invalid Wikidata QID format")

    names = await fetch_historical_names(place_qid)
    return {"place_qid": place_qid, "names": names}


# ── Places API (serves ingested data) ──────────────────────────────

import json as _json
from pathlib import Path as _Path

_GENERATED_DATA_PATH = _Path(__file__).parent / "data" / "generated" / "literary_places.json"
_places_cache: list[dict] | None = None


def _load_places() -> list[dict]:
    global _places_cache
    if _places_cache is not None:
        return _places_cache
    if _GENERATED_DATA_PATH.exists():
        with open(_GENERATED_DATA_PATH) as f:
            data = _json.load(f)
        _places_cache = data.get("places", [])
        logger.info(f"Loaded {len(_places_cache)} places from {_GENERATED_DATA_PATH}")
    else:
        logger.warning(f"No generated data at {_GENERATED_DATA_PATH}. Run: python -m backend.data.ingest")
        _places_cache = []
    return _places_cache


@app.get("/api/places")
async def list_places(
    region: str | None = Query(None, description="Filter by region"),
    author: str | None = Query(None, description="Filter by author (substring)"),
    city: str | None = Query(None, description="Filter by city name"),
    genre: str | None = Query(None, description="Filter by genre"),
    q: str | None = Query(None, description="Full-text search across title, author, city"),
    year_min: int | None = Query(None, description="Minimum publication year"),
    year_max: int | None = Query(None, description="Maximum publication year"),
    limit: int = Query(100, ge=1, le=5000),
    offset: int = Query(0, ge=0),
):
    """
    List literary places from ingested data.

    Data sourced from Open Library via the ingestion pipeline.
    Run `python -m backend.data.ingest` to refresh.
    In production, this queries PostgreSQL + PostGIS + pgvector.
    """
    places = _load_places()

    if q:
        terms = q.lower().split()

        def _matches(p: dict) -> bool:
            searchable = " ".join([
                p.get("bookTitle", ""),
                p.get("author", ""),
                p.get("placeName", ""),
                " ".join(p.get("genres", [])),
                " ".join(p.get("sentiment", {}).get("themes", [])),
                p.get("passage", ""),
            ]).lower()
            return all(t in searchable for t in terms)

        places = [p for p in places if _matches(p)]

    if region:
        places = [p for p in places if p.get("region", "").lower() == region.lower()]

    if author:
        author_lower = author.lower()
        places = [p for p in places if author_lower in p.get("author", "").lower()]

    if city:
        city_lower = city.lower()
        places = [p for p in places if city_lower in p.get("placeName", "").lower()]

    if genre:
        genre_lower = genre.lower()
        places = [p for p in places if any(genre_lower in g.lower() for g in p.get("genres", []))]

    if year_min:
        places = [p for p in places if (p.get("publishYear") or 0) >= year_min]

    if year_max:
        places = [p for p in places if (p.get("publishYear") or 9999) <= year_max]

    total = len(places)
    places = places[offset:offset + limit]

    return {"total": total, "offset": offset, "limit": limit, "places": places}


@app.get("/api/places/{place_id}")
async def get_place(place_id: str):
    """Get a single literary place by ID."""
    places = _load_places()
    for p in places:
        if p.get("id") == place_id:
            return p
    raise HTTPException(status_code=404, detail="Place not found")


@app.post("/api/places/refresh")
async def refresh_places():
    """Clear the in-memory cache to reload from disk after re-ingestion."""
    global _places_cache
    _places_cache = None
    places = _load_places()
    return {"status": "refreshed", "count": len(places)}


@app.post("/api/analyze/passage", response_model=PassageAnalysis)
async def analyze_passage(passage: str, place_name: str):
    """Analyze sentiment and themes for a specific passage-place pair."""
    if not pipeline:
        raise HTTPException(status_code=503, detail="NLP pipeline not initialized")

    sentiment = pipeline._analyze_sentiment(passage)
    return PassageAnalysis(
        passage=passage,
        place_name=place_name,
        sentiment=sentiment,
        setting_type="mentioned",
    )
