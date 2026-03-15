-- ═══════════════════════════════════════════════════════════════════
-- Akhand — Literary Geography Platform
-- PostgreSQL + PostGIS + pgvector + ltree schema
--
-- One PostgreSQL instance handles spatial queries (PostGIS), vector
-- similarity search (pgvector), fuzzy text search (pg_trgm), and
-- geographic hierarchy (ltree). Graph queries (author → book → city)
-- are 2-3 hop JOINs at current scale — add Apache AGE as a migration
-- when the data demands deep traversals (50K+ entries, 6+ hops).
-- ═══════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS ltree;

-- ── Enums ─────────────────────────────────────────────────────────

CREATE TYPE place_type AS ENUM (
    'real',
    'fictional_based_on_real',
    'purely_fictional'
);

CREATE TYPE setting_type AS ENUM (
    'primary',
    'secondary',
    'mentioned'
);

-- ── Authors ───────────────────────────────────────────────────────

CREATE TABLE authors (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    birth_year      INT,
    death_year      INT,
    nationality     TEXT,
    viaf_id         TEXT,
    wikidata_id     TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_authors_name ON authors USING gin (name gin_trgm_ops);
CREATE UNIQUE INDEX idx_authors_wikidata ON authors (wikidata_id) WHERE wikidata_id IS NOT NULL;

-- ── Books ─────────────────────────────────────────────────────────

CREATE TABLE books (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           TEXT NOT NULL,
    author_id       UUID REFERENCES authors(id),
    publish_year    INT,
    language        TEXT DEFAULT 'English',
    genres          TEXT[] DEFAULT '{}',
    isbn            TEXT,
    wikidata_id     TEXT,
    openlibrary_id  TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_books_title ON books USING gin (title gin_trgm_ops);
CREATE INDEX idx_books_author ON books (author_id);
CREATE INDEX idx_books_year ON books (publish_year);

-- ── Places ────────────────────────────────────────────────────────
-- Spatial data stored as PostGIS geometry

CREATE TABLE places (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    geom            GEOMETRY(Point, 4326) NOT NULL,
    place_type      place_type NOT NULL DEFAULT 'real',
    real_anchor      TEXT,
    country         TEXT,
    admin1          TEXT,
    geonames_id     TEXT,
    wikidata_id     TEXT,
    osm_id          TEXT,
    historical_names JSONB DEFAULT '[]',
    -- [{name: "Bombay", start_year: null, end_year: 1995}]
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_places_geom ON places USING gist (geom);
CREATE INDEX idx_places_name ON places USING gin (name gin_trgm_ops);
CREATE INDEX idx_places_country ON places (country);
CREATE UNIQUE INDEX idx_places_geonames ON places (geonames_id) WHERE geonames_id IS NOT NULL;

-- ── Book-Place Relationships ──────────────────────────────────────
-- The core link: which books are set in which places

CREATE TABLE book_places (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id         UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    place_id        UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    setting_type    setting_type NOT NULL DEFAULT 'primary',
    narrative_era   TEXT,
    confidence      FLOAT DEFAULT 1.0,
    source          TEXT DEFAULT 'manual',
    -- 'nlp_pipeline', 'crowdsourced', 'scholarly', 'manual'
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(book_id, place_id, setting_type)
);

CREATE INDEX idx_book_places_book ON book_places (book_id);
CREATE INDEX idx_book_places_place ON book_places (place_id);

-- ── Literary Passages ─────────────────────────────────────────────
-- Passage-level geography with sentiment and embeddings

CREATE TABLE literary_passages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_place_id   UUID NOT NULL REFERENCES book_places(id) ON DELETE CASCADE,
    passage_text    TEXT NOT NULL,
    page_number     INT,
    chapter         TEXT,

    -- Sentiment analysis
    sentiment_polarity FLOAT CHECK (sentiment_polarity BETWEEN -1.0 AND 1.0),
    dominant_emotions  TEXT[] DEFAULT '{}',
    themes             TEXT[] DEFAULT '{}',

    -- Vector embedding for semantic search (3072 dims for text-embedding-3-large)
    embedding       vector(3072),

    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_passages_book_place ON literary_passages (book_place_id);
CREATE INDEX idx_passages_sentiment ON literary_passages (sentiment_polarity);

-- HNSW index for approximate nearest neighbor search on embeddings
-- pgvector recommends HNSW over IVFFlat for production
CREATE INDEX idx_passages_embedding ON literary_passages
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 200);

-- ── Themes (from Literary Theme Ontology) ─────────────────────────

CREATE TABLE themes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL UNIQUE,
    lto_id          TEXT,  -- Literary Theme Ontology identifier
    parent_id       UUID REFERENCES themes(id),
    description     TEXT
);

CREATE TABLE book_themes (
    book_id         UUID REFERENCES books(id) ON DELETE CASCADE,
    theme_id        UUID REFERENCES themes(id) ON DELETE CASCADE,
    PRIMARY KEY (book_id, theme_id)
);

-- ── Place Hierarchy ───────────────────────────────────────────────
-- Kolkata → West Bengal → India

CREATE TABLE place_hierarchy (
    child_id        UUID REFERENCES places(id) ON DELETE CASCADE,
    parent_id       UUID REFERENCES places(id) ON DELETE CASCADE,
    relation_type   TEXT DEFAULT 'located_in',
    PRIMARY KEY (child_id, parent_id)
);

-- ── Crowdsourced Contributions ────────────────────────────────────

CREATE TABLE contributors (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username        TEXT UNIQUE NOT NULL,
    email           TEXT UNIQUE NOT NULL,
    trust_level     INT DEFAULT 0 CHECK (trust_level BETWEEN 0 AND 5),
    contributions   INT DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE contributions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contributor_id  UUID NOT NULL REFERENCES contributors(id),
    book_place_id   UUID REFERENCES book_places(id),
    passage_id      UUID REFERENCES literary_passages(id),
    status          TEXT DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected', 'research_grade')),
    review_count    INT DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT now(),
    reviewed_at     TIMESTAMPTZ
);

-- ── Spatial Query Functions ───────────────────────────────────────

-- Find all books set within N meters of a point
CREATE OR REPLACE FUNCTION books_near_point(
    lng FLOAT,
    lat FLOAT,
    radius_meters FLOAT DEFAULT 50000
)
RETURNS TABLE (
    book_id UUID,
    title TEXT,
    author_name TEXT,
    place_name TEXT,
    distance_meters FLOAT,
    setting_type setting_type
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        b.id,
        b.title,
        a.name,
        p.name,
        ST_Distance(p.geom::geography, ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography) as dist,
        bp.setting_type
    FROM book_places bp
    JOIN books b ON b.id = bp.book_id
    JOIN authors a ON a.id = b.author_id
    JOIN places p ON p.id = bp.place_id
    WHERE ST_DWithin(
        p.geom::geography,
        ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
        radius_meters
    )
    ORDER BY dist;
END;
$$ LANGUAGE plpgsql;

-- Semantic search: find passages similar to a query embedding
CREATE OR REPLACE FUNCTION search_passages_semantic(
    query_embedding vector(3072),
    match_count INT DEFAULT 10,
    similarity_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
    passage_id UUID,
    passage_text TEXT,
    book_title TEXT,
    place_name TEXT,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        lp.id,
        lp.passage_text,
        b.title,
        p.name,
        1 - (lp.embedding <=> query_embedding) as sim
    FROM literary_passages lp
    JOIN book_places bp ON bp.id = lp.book_place_id
    JOIN books b ON b.id = bp.book_id
    JOIN places p ON p.id = bp.place_id
    WHERE 1 - (lp.embedding <=> query_embedding) > similarity_threshold
    ORDER BY lp.embedding <=> query_embedding
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Combined spatial + semantic search
CREATE OR REPLACE FUNCTION search_literary_geography(
    query_embedding vector(3072),
    center_lng FLOAT,
    center_lat FLOAT,
    radius_meters FLOAT DEFAULT 100000,
    match_count INT DEFAULT 20
)
RETURNS TABLE (
    passage_id UUID,
    passage_text TEXT,
    book_title TEXT,
    place_name TEXT,
    distance_meters FLOAT,
    semantic_similarity FLOAT,
    combined_score FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        lp.id,
        lp.passage_text,
        b.title,
        p.name,
        ST_Distance(p.geom::geography, ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography),
        1 - (lp.embedding <=> query_embedding),
        -- Combined ranking: 60% semantic, 40% spatial proximity
        0.6 * (1 - (lp.embedding <=> query_embedding)) +
        0.4 * (1 - LEAST(ST_Distance(p.geom::geography, ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography) / radius_meters, 1.0))
    FROM literary_passages lp
    JOIN book_places bp ON bp.id = lp.book_place_id
    JOIN books b ON b.id = bp.book_id
    JOIN places p ON p.id = bp.place_id
    WHERE ST_DWithin(
        p.geom::geography,
        ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography,
        radius_meters
    )
    ORDER BY combined_score DESC
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════
-- ltree — Geographic hierarchy paths
--
-- GiST-indexed hierarchical paths for efficient containment queries.
-- e.g. 'Asia.India.Maharashtra.Mumbai' enables:
--   SELECT * FROM places WHERE geo_path <@ 'Asia.India';
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE places ADD COLUMN IF NOT EXISTS geo_path ltree;

CREATE INDEX IF NOT EXISTS idx_places_geo_path ON places USING gist (geo_path);

-- Example hierarchy data:
-- UPDATE places SET geo_path = 'Asia.India.Maharashtra.Mumbai' WHERE name = 'Mumbai';
-- UPDATE places SET geo_path = 'Asia.India.WestBengal.Kolkata' WHERE name = 'Kolkata';
-- UPDATE places SET geo_path = 'Asia.Pakistan.Punjab.Lahore' WHERE name = 'Lahore';
-- UPDATE places SET geo_path = 'Europe.Ireland.Dublin' WHERE name = 'Dublin';

-- Query all places in India:
-- SELECT * FROM places WHERE geo_path <@ 'Asia.India';

-- Query all South Asian places:
-- SELECT * FROM places WHERE geo_path ~ 'Asia.(India|Pakistan|Bangladesh|SriLanka|Nepal).*';


-- ═══════════════════════════════════════════════════════════════════
-- Wikidata ingestion staging table
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS wikidata_imports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_qid        TEXT NOT NULL,
    book_label      TEXT NOT NULL,
    place_qid       TEXT NOT NULL,
    place_label     TEXT NOT NULL,
    latitude        FLOAT NOT NULL,
    longitude       FLOAT NOT NULL,
    author_qid      TEXT,
    author_label    TEXT,
    publication_year INT,
    language_label  TEXT,
    country_label   TEXT,
    imported_at     TIMESTAMPTZ DEFAULT now(),
    processed       BOOLEAN DEFAULT FALSE,
    UNIQUE(book_qid, place_qid)
);

CREATE INDEX idx_wikidata_imports_unprocessed
    ON wikidata_imports (processed) WHERE NOT processed;
