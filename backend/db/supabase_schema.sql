-- ═══════════════════════════════════════════════════════════════════
-- Akhand — Supabase Schema (PostGIS-enabled)
-- Run this in Supabase SQL Editor (one-time setup)
-- ═══════════════════════════════════════════════════════════════════

-- Enable extensions (PostGIS is pre-installed on Supabase)
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Main literary_places table (denormalized for simplicity) ────
-- Mirrors the JSON structure for easy migration

CREATE TABLE IF NOT EXISTS literary_places (
    id              TEXT PRIMARY KEY,
    book_title      TEXT NOT NULL,
    author          TEXT NOT NULL,
    publish_year    INT,
    place_name      TEXT NOT NULL,
    coordinates     FLOAT[] NOT NULL,  -- [longitude, latitude]
    geom            GEOMETRY(Point, 4326),  -- PostGIS for spatial queries
    place_type      TEXT DEFAULT 'real',
    real_anchor      TEXT,
    setting_type    TEXT DEFAULT 'primary',
    narrative_era   TEXT,
    passage         TEXT DEFAULT '',
    sentiment_polarity    FLOAT DEFAULT 0.0,
    dominant_emotions     TEXT[] DEFAULT '{}',
    themes               TEXT[] DEFAULT '{}',
    language        TEXT DEFAULT 'English',
    genres          TEXT[] DEFAULT '{}',
    region          TEXT,
    cover_url       TEXT,
    open_library_key TEXT,
    open_library_url TEXT,
    goodreads_url   TEXT,
    wikidata_book_id TEXT,
    wikidata_place_id TEXT,
    source          TEXT DEFAULT 'manual',
    translator      TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ── Indexes ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_lp_geom ON literary_places USING gist (geom);
CREATE INDEX IF NOT EXISTS idx_lp_place_name ON literary_places USING gin (place_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_lp_book_title ON literary_places USING gin (book_title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_lp_author ON literary_places USING gin (author gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_lp_region ON literary_places (region);
CREATE INDEX IF NOT EXISTS idx_lp_language ON literary_places (language);
CREATE INDEX IF NOT EXISTS idx_lp_year ON literary_places (publish_year);

-- ── Auto-populate geom from coordinates on insert/update ────────
CREATE OR REPLACE FUNCTION update_geom()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.coordinates IS NOT NULL AND array_length(NEW.coordinates, 1) = 2 THEN
        NEW.geom := ST_SetSRID(ST_MakePoint(NEW.coordinates[1], NEW.coordinates[2]), 4326);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_geom ON literary_places;
CREATE TRIGGER trg_update_geom
    BEFORE INSERT OR UPDATE ON literary_places
    FOR EACH ROW
    EXECUTE FUNCTION update_geom();

-- ── Spatial query: books near a point ───────────────────────────
CREATE OR REPLACE FUNCTION books_near_point(
    lng FLOAT,
    lat FLOAT,
    radius_meters FLOAT DEFAULT 50000,
    max_results INT DEFAULT 20
)
RETURNS TABLE (
    id TEXT,
    book_title TEXT,
    author TEXT,
    place_name TEXT,
    distance_meters FLOAT,
    publish_year INT,
    cover_url TEXT,
    passage TEXT,
    genres TEXT[],
    themes TEXT[],
    coordinates FLOAT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        lp.id,
        lp.book_title,
        lp.author,
        lp.place_name,
        ST_Distance(
            lp.geom::geography,
            ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
        ) AS dist,
        lp.publish_year,
        lp.cover_url,
        lp.passage,
        lp.genres,
        lp.themes,
        lp.coordinates
    FROM literary_places lp
    WHERE ST_DWithin(
        lp.geom::geography,
        ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
        radius_meters
    )
    ORDER BY dist
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- ── KNN fallback when no results within radius ─────────────────
CREATE OR REPLACE FUNCTION books_nearest(
    lng FLOAT,
    lat FLOAT,
    max_results INT DEFAULT 5
)
RETURNS TABLE (
    id TEXT,
    book_title TEXT,
    author TEXT,
    place_name TEXT,
    distance_meters FLOAT,
    publish_year INT,
    cover_url TEXT,
    passage TEXT,
    genres TEXT[],
    themes TEXT[],
    coordinates FLOAT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        lp.id,
        lp.book_title,
        lp.author,
        lp.place_name,
        ST_Distance(
            lp.geom::geography,
            ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
        ) AS dist,
        lp.publish_year,
        lp.cover_url,
        lp.passage,
        lp.genres,
        lp.themes,
        lp.coordinates
    FROM literary_places lp
    ORDER BY lp.geom <-> ST_SetSRID(ST_MakePoint(lng, lat), 4326)
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- ── Full-text search function ───────────────────────────────────
CREATE OR REPLACE FUNCTION search_places(
    query TEXT,
    max_results INT DEFAULT 50
)
RETURNS TABLE (
    id TEXT,
    book_title TEXT,
    author TEXT,
    place_name TEXT,
    rank FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        lp.id,
        lp.book_title,
        lp.author,
        lp.place_name,
        GREATEST(
            similarity(lp.book_title, query),
            similarity(lp.author, query),
            similarity(lp.place_name, query)
        ) AS rnk
    FROM literary_places lp
    WHERE
        lp.book_title % query
        OR lp.author % query
        OR lp.place_name % query
        OR lp.passage ILIKE '%' || query || '%'
    ORDER BY rnk DESC
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- ── Row Level Security ──────────────────────────────────────────
ALTER TABLE literary_places ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Public read access"
    ON literary_places FOR SELECT
    USING (true);

-- Only service role can insert/update/delete
CREATE POLICY "Service role full access"
    ON literary_places FOR ALL
    USING (auth.role() = 'service_role');
