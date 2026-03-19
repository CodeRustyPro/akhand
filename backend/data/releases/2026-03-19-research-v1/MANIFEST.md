# Akhand Dataset Release 2026-03-19-research-v1

## Files
- literary_places.json: 5637 entries
- literary_places.json sha256: cc2a2094fd03ff5844e9dc929b94393d4be07b618f27a09252d7226f1b021084
- quality_report.json sha256: 2d7b0b524bed9b662f5423e8f133fc1dec6deed17dc024657ecec0af93bcea41

## Quality
- threshold: 0.6
- passing: 5637
- failing: 3404

## Repro Commands
1. Run nlp_batch enrichment on cleaned scaffold
2. Run quality_gate with --reject
3. Run cut_release with --input and --report

Built on: 2026-03-19
