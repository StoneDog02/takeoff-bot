# Beckstead Benchmark

Professional reference takeoff for the Jeff Beckstead residence plans (`tests/fixtures/beckstead-residence-plans.pdf`).

## Folder convention

```
benchmarks/beckstead/
  source/           # Immutable professional takeoff (PDF) — NEVER edit
  normalized/       # Derived parse + mapping notes (reproducible)
  comparisons/      # Engine vs benchmark audit outputs
  parity/           # Architecture-invariant engine takeoff snapshots
  README.md         # This file
```

## Parity snapshots

See [`parity/README.md`](parity/README.md). Use these when proving repository cleanup or renames did not change architecture-invariant material output.

## Anti-overfitting rules

1. **Burton is reference, not ground truth.** It is a budget quotation with an explicit sufficiency disclaimer.
2. **Never tune the engine** to maximize Beckstead/Burton agreement.
3. **Scope tags required** on every comparison row before any quantity comparison.
4. **Prove scope equivalence** before computing deltas.
5. **No misleading accuracy percentages** against Burton totals.
6. **Quantity layers are distinct:** plan fact, calculated requirement, waste/rounding, purchasable stock.
7. **Normalized artifacts are derived** and reproducible from source.
