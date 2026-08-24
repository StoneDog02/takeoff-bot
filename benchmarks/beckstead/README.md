# Beckstead Benchmark

Professional reference takeoff for the Jeff Beckstead residence plans (`tests/fixtures/beckstead-residence-plans.pdf`).

## Folder convention

```
benchmarks/beckstead/
  source/           # Immutable professional takeoff (PDF) — NEVER edit
  normalized/       # Derived parse + mapping notes (reproducible)
  comparisons/      # Engine vs benchmark audit outputs
  README.md         # This file
```

## Anti-overfitting rules

1. **Burton is reference, not ground truth.** It is a budget quotation with an explicit sufficiency disclaimer.
2. **Never tune the engine** to maximize Beckstead/Burton agreement.
3. **Scope tags required** on every comparison row before any quantity comparison.
4. **Prove scope equivalence** before computing deltas. Use `NOT_DIRECTLY_COMPARABLE` or `SCOPE_DIFFERENCE` when layers differ.
5. **No misleading accuracy percentages** against Burton totals.
6. **Quantity layers are distinct:**
   - Plan / geometry fact
   - Calculated material requirement (engine output today)
   - Waste / rounding / estimator convention
   - Purchasable stock / package BOM (Burton)
7. **Normalized artifacts are derived** and reproducible from source. Source stays pristine.

## Current audits

| Artifact | Purpose |
|----------|---------|
| `comparisons/M4-PRODUCT-CLOSEOUT.md` | B2.2M.4 product close-out report |
| `comparisons/m4-material-comparison.json` | Scope-gated category matrix |
| `comparisons/domain-material-dependency.json` | Why 52 material lines unchanged |
| `comparisons/product-unlock-ranking.json` | M.5 selection evidence |
| `normalized/burton-takeoff.normalized.json` | Derived Burton framing lines |

## Running the close-out audit

```bash
tsx artifacts/b2.2m.4/probe/runM4ProductCloseoutAudit.ts
```

Read-only — does not modify production engine or Burton source.
