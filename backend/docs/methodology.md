# Akhand Methodology

## Scope
Akhand maps fiction to narrative locations using structured metadata, geocoding, and NLP enrichment. The system optimizes for reproducibility, versioned releases, and interoperability across research and product interfaces.

## Data sources
- Wikidata P840 narrative-location relationships
- Open Library bibliographic metadata
- Curated Cities in Fiction imports
- Manual corrections and targeted curation

## Entry model
Each entry represents a book-place relationship and includes:
- identifiers: internal id, optional Wikidata/Open Library identifiers
- bibliographic fields: title, author, year, language, genre
- geography: place name, coordinates, region
- narrative fields: passage/description, sentiment polarity, dominant emotions, themes
- provenance: source and generated metadata

## Ingestion and normalization
1. Source fetchers collect candidate rows.
2. Deduplication and normalization standardize ids and fields.
3. Invalid/non-fiction placeholders are filtered using rule-based checks.
4. Coordinates are validated and outliers flagged.

## Enrichment
NLP enrichment runs in batch mode using Gemini with checkpointed resume.

Guardrails in enrichment pipeline:
- quality retries for low-signal outputs
- anti-generic theme filtering
- city-prior/stereotype suppression
- grounding reality-check: reject ornamental themes without concrete social/physical anchors
- title-aware conservative overrides for known edge cases
- low-confidence skip behavior instead of forced labels

Operational controls:
- row-index checkpoint keys to avoid duplicate-id collisions
- periodic checkpoint saves and output snapshots
- resume from output snapshot to preserve prior progress

## Quality gate
Quality gate computes a composite score from:
- fiction confidence
- title validity
- place plausibility
- enrichment completeness
- passage richness

Releases can be cut with permissive thresholding for breadth, or strict filtering for higher signal quality.
Strict mode can additionally block generic filler sentiment rows via quality_gate flags: --block-filler --filler-min-hits 2.

## Release process
1. Generate enriched dataset.
2. Run quality gate and produce passing-only artifact.
3. Cut versioned release under backend/data/releases/YYYY-MM-DD[-label]/
4. Write MANIFEST with counts and SHA256 checksums.
5. Rebuild frontend index/details from release artifact.

## API and interoperability
Akhand exposes:
- canonical dataset metadata via /api/meta
- queryable entries via /api/places
- GeoJSON bulk output via /api/places.geojson
- CSV export via /api/export?format=csv

Detail payloads include Schema.org-compatible fields for linked-data friendliness:
- @context, @type
- spatialCoverage/contentLocation
- sameAs links where available

## Citation guidance
Cite by release version and count, for example:
- Akhand Literary Places Dataset v2026-03-17-strict-v2, N=9057.

For reproducibility, cite the release folder and MANIFEST in backend/data/releases.
