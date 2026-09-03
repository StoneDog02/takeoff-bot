# First Post-Reset Beckstead Baseline

**Project:** `beckstead-reset-m1`  
**Captured:** 2026-09-02  
**Authority:** [`RESET_IMPLEMENTATION_PLAN.md`](RESET_IMPLEMENTATION_PLAN.md) §12 / Phase 6

## How this run was produced

1. **Live CLI attempt** (`npm run dev -- --live … --project beckstead-reset-m1`)  
   - Indexed Beckstead PDF and wrote page classification + reading order.  
   - Failed during live Claude extraction with `Connection error.` (Anthropic network from this environment).  
   - No Stage 13/15/16 were involved.

2. **Evidence-replay milestone** (completed successfully):

```bash
npx tsx scripts/run-beckstead-reset-replay.ts --project beckstead-reset-m1
```

   - PDF: `tests/fixtures/beckstead-residence-plans.pdf` (indexed)  
   - Evidence source: `artifacts/b2.3-wave5/runs/beckstead-wave5-after/framing/06-extractedEvidence.json`  
   - Path: interpret → `calculateFramingTakeoff` → `reset-takeoff.json`  
   - No Stage 13 validation gate, no pendingClaims, no Stage 15 confidence, no Stage 16 report

## Results

| Metric | Value |
|--------|-------|
| Materials | 53 |
| Wall lines | 52 |
| Structural lines | 1 |
| Opening / floor / roof / sheathing / fastener | 0 |
| Assumptions disclosed | 0 |

Artifacts:

- [`artifacts/beckstead-reset-m1/framing/reset-takeoff.json`](../artifacts/beckstead-reset-m1/framing/reset-takeoff.json)
- [`artifacts/beckstead-reset-m1/framing/reset-beckstead-baseline.json`](../artifacts/beckstead-reset-m1/framing/reset-beckstead-baseline.json)
- Debug: `reset-construction.json`, `reset-extracted-evidence.json`, classification/order companions

## Success criteria check (§12)

| Criterion | Status |
|-----------|--------|
| Beckstead PDF enters simplified path | Yes (index + reset orchestrator) |
| Useful reader capabilities | Classification ran live; full live extract blocked by API connection — replay used frozen reader Evidence |
| Construction → calculators without permission/translation gates | Yes |
| Preserved formulas where inputs available | Yes (52 wall + 1 structural) |
| Governed opening assumptions reachable | Proven by unit tests; no eligible openings with assumptions in this Evidence snapshot |
| `reset-takeoff.json` produced | Yes |
| No Stage 13 / pendingClaims / Stage 15 / Stage 16 required | Yes |
| Zeros explainable as capability/input gaps | Yes — not Stage 13 blocking |

## Honest gaps (post-reset backlog)

- Opening / floor / roof / sheathing material zeros on this Evidence snapshot (same class of gaps as frozen M.4 for non-wall domains; floor 31/527 proven on fixture path separately).
- Live end-to-end Claude extract for Beckstead still required when Anthropic connectivity is available:

```bash
TAKEOFF_COMPILER=1 TAKEOFF_COMPILER_OCR=1 TAKEOFF_PROJECT_LEARNING=1 \
  npm run dev -- --live --pdf tests/fixtures/beckstead-residence-plans.pdf \
  --scope framing --project beckstead-reset-live
```

## Compare to frozen M.4 (reference only)

Frozen M.4 produced 52 wall material lines and zero in other domains through the old 16-stage path. This reset replay produced **52 wall + 1 structural** without Stage 13–16 — establishing the post-reset baseline for product work.
