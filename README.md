# Akhand

A literary geography platform that maps fiction to the physical world. 935 works of fiction across 169 places in 22 languages, drawn from automated API ingestion, web archive parsing, and human-curated spreadsheets.

The name means "undivided" in Sanskrit. The platform treats South Asia's literary geography as a continuous space, ignoring political boundaries in favor of narrative ones.

This project builds on the work of [Cities in Fiction](https://citiesinfiction.com), an archival project by Apoorva Saini and Divya Ravindranath that documents real-world places in Indian literature. Their curated entries (436 total across two sources) are integrated here with full attribution. Akhand extends this with NLP extraction, multi-source data ingestion, and WebGL visualization.

## Architecture

```
Frontend (Next.js 14, MapLibre GL, deck.gl)
    |
    | GET /api/places (fallback to static data.ts if backend is down)
    v
Backend API (FastAPI, Pydantic)
    |
    |-- /api/places        serves 935 fiction entries with search/filter
    |-- /api/extract       spaCy + GLiNER + Gemini NLP pipeline
    |-- /api/wikidata/*    SPARQL proxy for Wikidata P840
    |
Data Ingestion (CLI scripts)
    |
    |-- ingest.py          Open Library search-by-place, 54 cities, alias expansion
    |-- cif_ingest.py      CitiesInFiction.xlsx parser + Nominatim geocoder
    |-- openlibrary.py     async client with rate limiting
    |-- wikidata.py        P840 narrative location queries
```

## Data

**935 works of fiction** from three sources, with non-fiction entries (museum catalogs, history studies, architecture references, government reports, academic studies) removed and duplicates deduplicated:

| Source | Entries | Method |
|--------|---------|--------|
| Open Library API | 553 | Automated search across 54 cities with historical name alias expansion (Bombay/Mumbai, Calcutta/Kolkata, Benaras/Varanasi/Kashi, Cochin/Kochi, etc.). Deduplication by work key. Enriched with descriptions and cover images from the Works API. |
| CIF Archive | 284 | Parsed from citiesinfiction.com/archive (tab-separated). 460+ raw entries deduplicated against existing dataset. Geocoded via pre-populated coordinate cache covering 200+ locations. |
| CIF Spreadsheet | 146 | Parsed from contributor spreadsheet. 89 unique places, 21 languages including Hindi, Bengali, Malayalam, Telugu, Odia, Kannada, Tamil, Urdu. Geocoded via coordinate cache + Nominatim fallback. |

Coverage: 169 unique places, 737 unique authors, publication years 200-2026, 22 languages, 7 regions. 478 entries have book descriptions, 378 have cover images, all have outbound links to Open Library or Google Books.

## NLP pipeline

Four layers, designed so each failure degrades gracefully instead of crashing:

**Layer 1: spaCy NER** (`en_core_web_md`, 50MB). Fast first pass extracting GPE, LOC, FAC entities. The `md` model includes word vectors that improve recognition of out-of-vocabulary place names in literary syntax.

**Layer 2: GLiNER zero-shot NER** (`urchade/gliner_medium-v2.1`). Runs domain-specific labels: City, Village, Region, Country, River, Mountain, Neighborhood, Landmark, Historical Place Name, Fictional Place, Route, Body of Water. When both models agree on an entity, confidence is boosted. Threshold set to 0.4 to reduce noise from metaphorical place usage in literary text.

**Layer 3: Geocoding** (Nominatim via geopy). Converts entity text to coordinates. 80+ pre-populated coordinates avoid rate limiting.

**Layer 4: Gemini 3 Flash structured extraction** (`gemini-3-flash-preview`). Called only on passages containing NER-detected entities, not on full texts. A 100,000-word novel produces maybe 20 passages (6,000 characters) instead of 500,000 characters. At Gemini Flash pricing, that is $0.0006/book instead of $0.05, an 83x cost reduction. Extracts sentiment, themes, place classification.

If Gemini fails, the pipeline falls back to rule-based sentiment. If GLiNER fails to load, spaCy runs alone. If the backend is down entirely, the frontend serves curated entries from a static file.

## Visualization

Three deck.gl layers on MapLibre GL (CARTO Dark Matter basemap, no API key):

- **Scatter**: sentiment-colored dots, radius scales with book density
- **Heatmap**: geographic clustering of literary places
- **Arcs**: author connection networks across cities

PMTiles protocol registered for future zero-cost self-hosted tile serving.

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/places` | List places. Params: `q`, `region`, `city`, `author`, `genre`, `year_min`, `year_max`, `limit`, `offset` |
| GET | `/api/places/{id}` | Single place by ID |
| POST | `/api/places/refresh` | Hot-reload data from disk after re-ingestion |
| POST | `/api/extract` | Run NLP pipeline on arbitrary text |
| POST | `/api/extract/summary` | Gemini structured extraction from book summary |
| GET | `/api/wikidata/narrative-locations` | Wikidata P840 query. Param: `region=south_asia` |
| GET | `/health` | Pipeline status |

Full-text search across titles, authors, cities, genres, themes, and passages. All query terms must match (AND logic).

## Quick start

All commands run from the project root (`akhand/`), not from subdirectories.

```bash
# Frontend only (40 curated entries, no backend needed)
cd frontend && npm install && npm run dev

# Backend (935 fiction entries from Open Library + CIF)
pip install -r backend/requirements.txt
python -m spacy download en_core_web_md
uvicorn backend.main:app --port 8000

# Frontend + backend together
# Terminal 1: uvicorn backend.main:app --port 8000
# Terminal 2: cd frontend && npm run dev
# Open http://localhost:3000/explore

# Re-ingest data
python -m backend.data.ingest              # Open Library (54 cities)
python -m backend.data.cif_ingest --merge  # merge CIF spreadsheet + archive
curl -X POST http://localhost:8000/api/places/refresh

# Docker (full stack)
docker compose up
```

## Stack

**Frontend**: Next.js 14, React 18, MapLibre GL 4.7, deck.gl 9.1, Framer Motion, Tailwind CSS, PMTiles

**Backend**: FastAPI, spaCy 3.8 (`en_core_web_md`), GLiNER 0.2, Google GenAI (Gemini 3 Flash), geopy, httpx

**Database** (schema written, not yet wired): PostgreSQL 17, PostGIS, pgvector (HNSW), ltree, pg_trgm

## Limitations

- The API has no authentication or rate limiting. `/api/places/refresh` is unauthenticated. Fine for development, not deployable to a public URL without middleware.
- CORS allows `localhost:3000` and `shahdev.me`. Additional origins require updating the middleware.
- Sentiment analysis is empty for Open Library entries. The NLP pipeline can do it, but ingestion prioritizes breadth (983 entries) over depth (rich per-entry analysis).
- Neither source contains actual literary passages, only plot summaries (Open Library) and contributor descriptions (CIF). Copyrighted text requires publisher APIs or Project Gutenberg (public domain, pre-1928).
- Geocoding approximates regions to centroids. "Marwar region in Western part of Rajasthan" maps to Jodhpur. State-level entries and fictional places are similarly approximate.
- Open Library sorts by relevance, not recency. Recently published books are underrepresented.
- Wikidata SPARQL endpoint rate-limits heavily (429 on every query during development). Code is correct but the live endpoint is unreliable for bulk queries.
- The `en_core_web_md` spaCy model, while better than `sm`, still misses literary place names in unusual syntactic positions. GLiNER compensates but its 0.4 threshold needs manual benchmarking against annotated passages.
