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
import time
import csv
import io
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from typing import List, Optional
import os
from supabase import create_client, Client

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

# ── Security/Rate Limit Configuration ─────────────────────────────

_WINDOW_SECONDS = int(os.getenv("AKHAND_RATE_LIMIT_WINDOW_SECONDS", "60"))
_LIMIT_EXTRACT = int(os.getenv("AKHAND_RATE_LIMIT_EXTRACT", "15"))
_LIMIT_CONTRIBUTE = int(os.getenv("AKHAND_RATE_LIMIT_CONTRIBUTE", "20"))
_LIMIT_WIKIDATA = int(os.getenv("AKHAND_RATE_LIMIT_WIKIDATA", "30"))

_EXTRACT_API_KEY = os.getenv("AKHAND_EXTRACT_API_KEY", "").strip()
_WRITE_API_KEY = os.getenv("AKHAND_WRITE_API_KEY", "").strip()
_ADMIN_API_KEY = os.getenv("AKHAND_ADMIN_API_KEY", "").strip()

_trusted_hosts_env = os.getenv("AKHAND_TRUSTED_HOSTS", "").strip()
_trusted_hosts = [h.strip() for h in _trusted_hosts_env.split(",") if h.strip()] if _trusted_hosts_env else []

_allowed_methods_env = os.getenv("AKHAND_CORS_METHODS", "GET,POST,OPTIONS").strip()
_allowed_methods = [m.strip().upper() for m in _allowed_methods_env.split(",") if m.strip()] or ["GET", "POST", "OPTIONS"]

_allowed_headers_env = os.getenv("AKHAND_CORS_HEADERS", "Content-Type,X-API-Key").strip()
_allowed_headers = [h.strip() for h in _allowed_headers_env.split(",") if h.strip()] or ["Content-Type", "X-API-Key"]

_enable_security_headers = os.getenv("AKHAND_ENABLE_SECURITY_HEADERS", "1").strip() not in {"0", "false", "False"}

_rate_buckets: dict[str, deque[float]] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _enforce_rate_limit(request: Request, scope: str, max_requests: int) -> None:
    now = time.time()
    key = f"{scope}:{_client_ip(request)}"
    bucket = _rate_buckets[key]

    while bucket and (now - bucket[0]) > _WINDOW_SECONDS:
        bucket.popleft()

    if len(bucket) >= max_requests:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded for {scope}. Try again later.",
        )

    bucket.append(now)


def _enforce_api_key_if_configured(request: Request, expected_key: str, label: str) -> None:
    if not expected_key:
        return
    provided = request.headers.get("x-api-key", "")
    if provided != expected_key:
        raise HTTPException(status_code=401, detail=f"Invalid {label} API key")


def _enforce_api_key_required(request: Request, expected_key: str, label: str) -> None:
    """Like _enforce_api_key_if_configured, but rejects if the key env var is empty."""
    if not expected_key:
        raise HTTPException(
            status_code=503,
            detail=f"{label.capitalize()} API key not configured on server",
        )
    provided = request.headers.get("x-api-key", "")
    if provided != expected_key:
        raise HTTPException(status_code=401, detail=f"Invalid {label} API key")


def _require_admin_api_key(request: Request) -> None:
    if not _ADMIN_API_KEY:
        raise HTTPException(status_code=503, detail="Admin API key not configured")
    provided = request.headers.get("x-api-key", "")
    if provided != _ADMIN_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid admin API key")

# Initialize Supabase client for simple inserts
try:
    SUPABASE_URL = os.environ.get("SUPABASE_URL")
    SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
except Exception as e:
    logger.error(f"Failed to initialize Supabase client: {e}")
    supabase = None

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

_DEFAULT_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "https://shahdev.me",
]
_cors_env = os.getenv("AKHAND_CORS_ORIGINS", "").strip()
_cors_origins = [o.strip() for o in _cors_env.split(",") if o.strip()] if _cors_env else _DEFAULT_CORS_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=_allowed_methods,
    allow_headers=_allowed_headers,
)

if _trusted_hosts:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=_trusted_hosts)


@app.middleware("http")
async def set_security_headers(request: Request, call_next):
    response = await call_next(request)
    if _enable_security_headers:
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
        response.headers.setdefault("Cache-Control", "no-store")
        if request.url.scheme == "https":
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response


# ── Health ─────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(
        status="healthy" if pipeline else "degraded",
        spacy_model=pipeline.config.spacy_model if pipeline else None,
        version="0.2.0",
    )

# ── Crowd-Sourced Contributions ────────────────────────────────────

class ContributionRequest(BaseModel):
    book_title: str
    author: str
    publish_year: Optional[int] = None
    place_name: str
    coordinates: List[float]
    passage: str
    themes: List[str]
    language: str = "English"

@app.post("/api/contribute")
async def add_contribution(req: ContributionRequest, request: Request):
    """Receive community submissions for literary geography map."""
    _enforce_rate_limit(request, scope="contribute", max_requests=_LIMIT_CONTRIBUTE)
    _enforce_api_key_required(request, _WRITE_API_KEY, label="write")

    if not supabase:
        raise HTTPException(status_code=500, detail="Database connection not initialized")

    if len(req.coordinates) != 2:
        raise HTTPException(status_code=400, detail="coordinates must be [longitude, latitude]")

    lon, lat = req.coordinates
    if not (-180 <= lon <= 180 and -90 <= lat <= 90):
        raise HTTPException(status_code=400, detail="coordinates out of range")
        
    try:
        # We store these in a 'contributions' table with status='pending' 
        # so they can be reviewed before moving to the main 'literary_places' table
        data, count = supabase.table("contributions").insert({
            "book_title": req.book_title,
            "author": req.author,
            "publish_year": req.publish_year,
            "place_name": req.place_name,
            # Store point as PostGIS geometry or array for now
            "coordinates": req.coordinates, 
            "passage": req.passage,
            "themes": req.themes,
            "language": req.language,
            "status": "pending"
        }).execute()
        
        return {"status": "success", "message": "Contribution submitted for review"}
    except Exception as e:
        logger.error(f"Failed to insert contribution: {e}")
        raise HTTPException(status_code=500, detail="Failed to save contribution")


# ── NLP Extraction ────────────────────────────────────────────────

@app.post("/api/extract", response_model=ExtractionResult)
async def extract_places(request: ExtractionRequest, http_request: Request):
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
    _enforce_rate_limit(http_request, scope="extract", max_requests=_LIMIT_EXTRACT)
    _enforce_api_key_required(http_request, _EXTRACT_API_KEY, label="extract")

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
async def batch_extract(request: BatchExtractionRequest, http_request: Request):
    """Extract places from multiple texts."""
    _enforce_rate_limit(http_request, scope="extract_batch", max_requests=max(1, _LIMIT_EXTRACT // 3))
    _enforce_api_key_required(http_request, _EXTRACT_API_KEY, label="extract")

    if not pipeline:
        raise HTTPException(status_code=503, detail="NLP pipeline not initialized")

    if len(request.texts) > 20:
        raise HTTPException(status_code=413, detail="Batch too large. Maximum 20 texts per request.")

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
async def extract_from_summary(request: SummaryExtractionRequest, http_request: Request):
    """
    Extract geographic settings from a book summary using Gemini 3 Flash.

    The cheapest path to geographic data: processing 100K summaries costs ~$4-8
    with Gemini 3 Flash Batch API pricing.
    """
    _enforce_rate_limit(http_request, scope="extract_summary", max_requests=_LIMIT_EXTRACT)
    _enforce_api_key_required(http_request, _EXTRACT_API_KEY, label="extract")

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
    request: Request,
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
    _enforce_rate_limit(request, scope="wikidata", max_requests=_LIMIT_WIKIDATA)

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
async def wikidata_city_books(place_qid: str, request: Request):
    """Fetch all literary works set in a specific city by Wikidata QID."""
    from backend.data.wikidata import fetch_books_for_city

    _enforce_rate_limit(request, scope="wikidata", max_requests=_LIMIT_WIKIDATA)

    if not place_qid.startswith("Q"):
        raise HTTPException(status_code=400, detail="Invalid Wikidata QID format")

    results = await fetch_books_for_city(place_qid)
    return {"place_qid": place_qid, "count": len(results), "books": results}


@app.get("/api/wikidata/historical-names/{place_qid}")
async def wikidata_historical_names(place_qid: str, request: Request):
    """Fetch historical/alternate names for a place with date ranges."""
    from backend.data.wikidata import fetch_historical_names

    _enforce_rate_limit(request, scope="wikidata", max_requests=_LIMIT_WIKIDATA)

    if not place_qid.startswith("Q"):
        raise HTTPException(status_code=400, detail="Invalid Wikidata QID format")

    names = await fetch_historical_names(place_qid)
    return {"place_qid": place_qid, "names": names}


# ── Places API (serves ingested data) ──────────────────────────────

import json as _json
import os as _os
from pathlib import Path as _Path

_GENERATED_DATA_PATH = _Path(__file__).parent / "data" / "generated" / "literary_places_wikidata_enriched.json"
_RELEASES_DIR = _Path(__file__).parent / "data" / "releases"


def _resolve_release_data_path() -> _Path | None:
    version = _os.getenv("AKHAND_DATA_VERSION", "").strip()
    if version:
        pinned = _RELEASES_DIR / version / "literary_places.json"
        if pinned.exists():
            return pinned
        logger.warning(f"AKHAND_DATA_VERSION set to {version}, but release file not found: {pinned}")

    candidates = sorted(_RELEASES_DIR.glob("*/literary_places.json"), reverse=True)
    return candidates[0] if candidates else None


_RELEASE_DATA_PATH = _resolve_release_data_path()
_GENERATED_DATA_PATH_FALLBACKS = []
if _RELEASE_DATA_PATH is not None:
    _GENERATED_DATA_PATH_FALLBACKS.append(_RELEASE_DATA_PATH)
_GENERATED_DATA_PATH_FALLBACKS.extend(
    [
        _Path(__file__).parent / "data" / "generated" / "literary_places_release_v1.json",
        _Path(__file__).parent / "data" / "generated" / "literary_places_cleaned_enriched.json",
        _Path(__file__).parent / "data" / "generated" / "literary_places_wikidata_enriched.json",
        _Path(__file__).parent / "data" / "generated" / "literary_places_enriched.json",
        _Path(__file__).parent / "data" / "generated" / "literary_places.json",
    ]
)
_places_cache: list[dict] | None = None
_supabase_client = None
_active_data_source: str | None = None


def _compute_quality_tier(place: dict) -> str:
    """Derive quality tier when source rows don't include explicit quality metadata."""
    raw = str(place.get("qualityTier") or place.get("quality_tier") or "").strip().lower()
    if raw in {"gold", "silver", "stub"}:
        return raw

    sentiment = place.get("sentiment") or {}
    themes = sentiment.get("themes") if isinstance(sentiment, dict) else None
    if themes is None:
        themes = place.get("themes")

    has_themes = isinstance(themes, list) and len(themes) > 0
    has_passage = bool(str(place.get("passage") or "").strip())
    granularity = str(place.get("placeGranularity") or place.get("place_granularity") or "city").strip().lower()

    if has_passage and has_themes and granularity != "region":
        return "gold"
    if has_passage or has_themes:
        return "silver"
    return "stub"


def _compute_place_granularity(place: dict) -> str:
    raw = str(place.get("placeGranularity") or place.get("place_granularity") or "").strip().lower()
    if raw in {"city", "region"}:
        return raw
    return "city"


def _get_supabase():
    """Lazy-load Supabase client."""
    global _supabase_client
    if _supabase_client is not None:
        return _supabase_client
    try:
        from backend.db.supabase_client import get_supabase_anon
        _supabase_client = get_supabase_anon()
        return _supabase_client
    except Exception as e:
        logger.info(f"Supabase not available: {e}")
        return None


def _load_places() -> list[dict]:
    global _places_cache, _active_data_source
    if _places_cache is not None:
        return _places_cache

    prefer_supabase = _os.getenv("AKHAND_PREFER_SUPABASE", "0").strip() == "1"

    # Default behavior: serve canonical JSON release first for deterministic snapshots.
    if not prefer_supabase:
        for json_path in _GENERATED_DATA_PATH_FALLBACKS:
            if json_path.exists():
                with open(json_path) as f:
                    data = _json.load(f)
                _places_cache = data.get("places", [])
                _active_data_source = str(json_path)
                logger.info(f"Loaded {len(_places_cache)} places from {json_path}")
                return _places_cache

    # Try Supabase first
    supabase = _get_supabase()
    if supabase:
        try:
            rows: list[dict] = []
            page_size = 1000
            offset = 0
            while True:
                result = (
                    supabase.table("literary_places")
                    .select("*")
                    .range(offset, offset + page_size - 1)
                    .execute()
                )
                batch = result.data or []
                if not batch:
                    break
                rows.extend(batch)
                if len(batch) < page_size:
                    break
                offset += page_size

            if rows:
                # Transform Supabase rows back to frontend format
                _places_cache = [_supabase_to_frontend(row) for row in rows]
                _active_data_source = "supabase"
                logger.info(f"Loaded {len(_places_cache)} places from Supabase")
                return _places_cache
        except Exception as e:
            logger.warning(f"Supabase query failed, falling back to JSON: {e}")

    # Fall back to JSON file (or use it if Supabase is disabled/unavailable)
    for json_path in _GENERATED_DATA_PATH_FALLBACKS:
        if json_path.exists():
            with open(json_path) as f:
                data = _json.load(f)
            _places_cache = data.get("places", [])
            _active_data_source = str(json_path)
            logger.info(f"Loaded {len(_places_cache)} places from {json_path}")
            return _places_cache

    logger.warning(f"No generated data found. Run: python -m backend.data.ingest")
    _places_cache = []
    _active_data_source = "none"
    return _places_cache


def _infer_quality_threshold(source: str | None) -> float | None:
    if not source or source in {"supabase", "none", "unknown"}:
        return None
    p = _Path(source)
    if not p.exists():
        return None
    report_path = p.parent / "quality_report.json"
    if not report_path.exists():
        return None
    try:
        report = _json.loads(report_path.read_text())
        t = report.get("threshold")
        return float(t) if t is not None else None
    except Exception:
        return None


@app.get("/api/meta")
async def dataset_meta():
    """Return dataset source/version metadata for citation and debugging."""
    places = _load_places()
    source = _active_data_source or "unknown"

    version = _os.getenv("AKHAND_DATA_VERSION", "").strip() or None
    built_at = None
    quality_threshold = _infer_quality_threshold(source)
    if source not in {"supabase", "none", "unknown"}:
        p = _Path(source)
        if not version and "/data/releases/" in source and p.parent.name:
            version = p.parent.name
        if p.exists():
            built_at = datetime.fromtimestamp(p.stat().st_mtime, tz=timezone.utc).isoformat()

    return {
        "version": version,
        "total_entries": len(places),
        "quality_threshold": quality_threshold,
        "source": source,
        "built_at": built_at,
    }


@app.get("/api/places.geojson")
async def places_geojson():
    """Return the full dataset as a GeoJSON FeatureCollection."""
    features = []
    for p in _load_places():
        coords = p.get("coordinates", [0, 0])
        if not (isinstance(coords, list) and len(coords) == 2):
            continue
        properties = dict(p)
        properties.pop("coordinates", None)
        features.append(
            {
                "type": "Feature",
                "id": p.get("id"),
                "geometry": {"type": "Point", "coordinates": [coords[0], coords[1]]},
                "properties": properties,
            }
        )

    return {"type": "FeatureCollection", "features": features}


@app.get("/api/export")
async def export_dataset(format: str = Query("csv", description="Export format; currently supports csv")):
    """Bulk export endpoint for interoperability with notebooks/GIS/tools."""
    if format.lower() != "csv":
        raise HTTPException(status_code=400, detail="Unsupported format. Use format=csv")

    rows = _load_places()
    headers = [
        "id", "bookTitle", "author", "publishYear", "placeName", "longitude", "latitude",
        "placeType", "settingType", "narrativeEra", "language", "region", "genres",
        "polarity", "dominantEmotions", "themes", "wikidataBookId", "wikidataPlaceId",
        "openLibraryKey", "source",
    ]
    out = io.StringIO()
    writer = csv.DictWriter(out, fieldnames=headers)
    writer.writeheader()
    for p in rows:
        coords = p.get("coordinates", [None, None])
        sent = p.get("sentiment", {}) or {}
        writer.writerow(
            {
                "id": p.get("id", ""),
                "bookTitle": p.get("bookTitle", ""),
                "author": p.get("author", ""),
                "publishYear": p.get("publishYear", ""),
                "placeName": p.get("placeName", ""),
                "longitude": coords[0] if isinstance(coords, list) and len(coords) == 2 else "",
                "latitude": coords[1] if isinstance(coords, list) and len(coords) == 2 else "",
                "placeType": p.get("placeType", ""),
                "settingType": p.get("settingType", ""),
                "narrativeEra": p.get("narrativeEra", ""),
                "language": p.get("language", ""),
                "region": p.get("region", ""),
                "genres": "|".join(p.get("genres", []) or []),
                "polarity": sent.get("polarity", 0.0),
                "dominantEmotions": "|".join(sent.get("dominantEmotions", []) or []),
                "themes": "|".join(sent.get("themes", []) or []),
                "wikidataBookId": p.get("wikidataBookId", ""),
                "wikidataPlaceId": p.get("wikidataPlaceId", ""),
                "openLibraryKey": p.get("openLibraryKey", ""),
                "source": p.get("source", ""),
            }
        )

    content = out.getvalue().encode("utf-8")
    out.close()
    return StreamingResponse(
        iter([content]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=akhand_literary_places.csv"},
    )


def _supabase_to_frontend(row: dict) -> dict:
    """Transform a Supabase row to the frontend JSON format."""
    payload = {
        "id": row.get("id", ""),
        "bookTitle": row.get("book_title", ""),
        "author": row.get("author", ""),
        "publishYear": row.get("publish_year"),
        "placeName": row.get("place_name", ""),
        "coordinates": row.get("coordinates", [0, 0]),
        "placeType": row.get("place_type", "real"),
        "realAnchor": row.get("real_anchor"),
        "settingType": row.get("setting_type", "primary"),
        "narrativeEra": row.get("narrative_era", ""),
        "passage": row.get("passage", ""),
        "sentiment": {
            "polarity": row.get("sentiment_polarity", 0.0),
            "dominantEmotions": row.get("dominant_emotions", []),
            "themes": row.get("themes", []),
        },
        "language": row.get("language", "English"),
        "genres": row.get("genres", []),
        "region": row.get("region", ""),
        "coverUrl": row.get("cover_url"),
        "openLibraryKey": row.get("open_library_key"),
        "openLibraryUrl": row.get("open_library_url"),
        "goodreadsUrl": row.get("goodreads_url"),
        "wikidataBookId": row.get("wikidata_book_id"),
        "wikidataPlaceId": row.get("wikidata_place_id"),
        "source": row.get("source", ""),
        "translator": row.get("translator"),
    }
    payload["placeGranularity"] = _compute_place_granularity(row)
    payload["qualityTier"] = _compute_quality_tier(payload)
    payload["passageSource"] = row.get("passage_source") or "unknown"
    payload["passageType"] = row.get("passage_type") or "none"
    payload["enrichmentMethod"] = row.get("enrichment_method") or "none"
    return payload


@app.get("/api/nearby")
async def nearby_books(
    lat: float = Query(..., description="Latitude"),
    lng: float = Query(..., description="Longitude"),
    radius: int = Query(50000, ge=100, le=500000, description="Radius in meters"),
    limit: int = Query(20, ge=1, le=100),
):
    """
    Find books set near a geographic point using PostGIS.

    Uses ST_DWithin for radius search with automatic KNN fallback
    when fewer than 3 results exist within the radius.
    """
    supabase = _get_supabase()
    if supabase:
        try:
            result = supabase.rpc(
                "books_near_point",
                {
                    "lng": lng,
                    "lat": lat,
                    "radius_meters": float(radius),
                    "max_results": limit,
                },
            ).execute()

            if result.data and len(result.data) >= 3:
                return {"count": len(result.data), "results": result.data}

            # KNN fallback when too few results
            fallback = supabase.rpc(
                "books_nearest",
                {"lng": lng, "lat": lat, "max_results": limit},
            ).execute()

            return {
                "count": len(fallback.data) if fallback.data else 0,
                "results": fallback.data or [],
                "fallback": True,
            }
        except Exception as e:
            logger.warning(f"Supabase nearby query failed: {e}")

    # In-memory fallback using Haversine
    import math

    def haversine(lon1, lat1, lon2, lat2):
        R = 6371000
        phi1, phi2 = math.radians(lat1), math.radians(lat2)
        dphi = math.radians(lat2 - lat1)
        dlam = math.radians(lon2 - lon1)
        a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
        return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    places = _load_places()
    nearby = []
    for p in places:
        coords = p.get("coordinates", [0, 0])
        dist = haversine(lng, lat, coords[0], coords[1])
        if dist <= radius:
            nearby.append({**p, "distance_meters": round(dist, 1)})

    nearby.sort(key=lambda x: x["distance_meters"])

    if len(nearby) < 3:
        # KNN fallback
        all_dists = [
            {**p, "distance_meters": round(haversine(lng, lat, p["coordinates"][0], p["coordinates"][1]), 1)}
            for p in places
        ]
        all_dists.sort(key=lambda x: x["distance_meters"])
        return {
            "count": min(limit, len(all_dists)),
            "results": all_dists[:limit],
            "fallback": True,
        }

    return {"count": len(nearby[:limit]), "results": nearby[:limit]}


@app.get("/api/cities/{city}/dna")
async def city_dna(city: str):
    """
    Compute the literary DNA fingerprint for a city.

    Returns theme weights normalized 0-1 based on all fiction set in the city.
    """
    places = _load_places()
    city_places = [p for p in places if p.get("placeName", "").lower() == city.lower()]

    if len(city_places) < 3:
        raise HTTPException(status_code=404, detail=f"Not enough books for '{city}' (need 3+, found {len(city_places)})")

    # Compute theme fingerprint
    theme_counts: dict[str, int] = {}
    for p in city_places:
        for t in p.get("sentiment", {}).get("themes", []):
            theme_counts[t] = theme_counts.get(t, 0) + 1

    if not theme_counts:
        raise HTTPException(status_code=404, detail=f"No themes found for '{city}'")

    sorted_themes = sorted(theme_counts.items(), key=lambda x: x[1], reverse=True)[:10]
    max_count = sorted_themes[0][1]

    authors = list(set(p.get("author", "") for p in city_places))
    languages = list(set(p.get("language", "") for p in city_places if p.get("language")))

    return {
        "city": city,
        "bookCount": len(city_places),
        "themes": [
            {"name": name, "weight": round(count / max_count, 3), "bookCount": count}
            for name, count in sorted_themes
        ],
        "topAuthors": authors[:10],
        "dominantLanguage": max(set(p.get("language", "English") for p in city_places), key=lambda l: sum(1 for p in city_places if p.get("language") == l)),
        "languages": languages,
    }


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
async def refresh_places(request: Request):
    """Clear the in-memory cache to reload from disk after re-ingestion."""
    _require_admin_api_key(request)
    global _places_cache
    _places_cache = None
    places = _load_places()
    return {"status": "refreshed", "count": len(places)}


@app.post("/api/analyze/passage", response_model=PassageAnalysis)
async def analyze_passage(passage: str, place_name: str, request: Request):
    """Analyze sentiment and themes for a specific passage-place pair."""
    _enforce_rate_limit(request, scope="extract", max_requests=_LIMIT_EXTRACT)
    _enforce_api_key_required(request, _EXTRACT_API_KEY, label="extract")

    if not pipeline:
        raise HTTPException(status_code=503, detail="NLP pipeline not initialized")

    sentiment = pipeline._analyze_sentiment(passage)
    return PassageAnalysis(
        passage=passage,
        place_name=place_name,
        sentiment=sentiment,
        setting_type="mentioned",
    )
