# Reset Closure Implementation Plan (Executed)

**Status:** Implemented 2026-09-03  
**Verdict:** B — cleanup completed; factory reset closed for architecture scaffolding.

Production path after closure:

```
UPLOAD PDF → READ THE PLANS → CALCULATE / DERIVE / ASSUME → reset-takeoff.json
```

## What was removed

| Old concept | Action |
|---|---|
| `--legacy-pipeline` CLI escape hatch | Removed from `src/app.ts` |
| 16-stage `createFramingStages` / `PipelineRunner` | Deleted |
| Interpret pass-through layer (7 files) | Deleted; resolvers inlined in `readFramingPlans` |
| Stage 13 validation permission (`isQuantityBlocked`, validation coordinators) | Deleted from calculator contracts and codebase |
| `claimStatus` / `PendingMaterialClaim` lifecycle | Removed from material schema and opening calculator |
| `calculateFasteners.ts` | Deleted (Verdict C — no demonstrated takeoff intelligence) |
| Domain object lifecycle fields (`completion`, `reviewStatus`, `blockingStatus`, object-level ID arrays) | Removed from `resolvedObjectBaseSchema` |
| Trace baggage (`evidenceIds`, `userDecisionIds`, `validationIssueIds`, `reviewItemIds` on traces) | Removed; traces keep `propertyPath`, `method`, `explanation`, `assumptionIds` |
| Confidence / observability / review-workspace | Deleted |
| Claim candidacy machinery | Deleted; assumption registry moved to `src/scopes/framing/assumptions/` |

## What was preserved

- Evidence as reader-internal transport inside `readFramingPlans`
- All `resolve*` construction reconciliation
- All six domain calculators (math / null / construction-family guards)
- `isQuantityInputResolved` and floor layout / non-wood / stick-rafter guards
- Governed opening assumption registry (`consultAssumptionRegistry`)
- Temporary `reset-takeoff.json` passive writer
- Frozen artifacts + `scripts/compare-reset-takeoffs.ts`

## Verification

- `npx tsc --noEmit` — pass
- `npm test` — 547 pass, 0 fail
- `tests/scopes/framing/reset/reset-takeoff.test.ts` — pass (incl. Beckstead crawl 31/527)
- Compare m1 vs live artifacts — unchanged historical delta (architecture validation only)

## Explicit non-goals (still deferred product work)

- Beckstead material/domain gaps (LVL, openings, roof, sheathing capability)
- Definitive Material Taxonomy
- Fastener takeoff (rebuild from construction requirements when needed)
