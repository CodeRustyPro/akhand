# Akhand Dataset Release 2026-03-17

## Files
- literary_places.json: 11073 entries
- literary_places.json sha256: eec5e1e87cd59a21835a31617017bce0bcbf903542ae386f9047fcc1f5bc4ce7
- quality_report.json sha256: 4859280d9cf275f3db6d58d0f41695c8592200168a157b2f80455b528428dea6

## Quality
- threshold: 0.4
- passing: 11073
- failing: 0

## Repro Commands
1. Run nlp_batch enrichment on cleaned scaffold
2. Run quality_gate with --reject
3. Run cut_release with --input and --report

Built on: 2026-03-17
