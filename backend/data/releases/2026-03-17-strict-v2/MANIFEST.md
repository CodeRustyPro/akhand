# Akhand Dataset Release 2026-03-17-strict-v2

## Files
- literary_places.json: 9057 entries
- literary_places.json sha256: 8cad0f99f2b20ee1002ad3047c8998d8fe43311d63a8c9df481f4ac254150b44
- quality_report.json sha256: fab974700bb8e4cb228f9f869ac59057a03951da073fc31064bb815424c7b043

## Quality
- threshold: 0.55
- passing: 9057
- failing: 0

## Repro Commands
1. Run nlp_batch enrichment on cleaned scaffold
2. Run quality_gate with --reject
3. Run cut_release with --input and --report

Built on: 2026-03-17
