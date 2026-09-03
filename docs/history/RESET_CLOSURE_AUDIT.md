# Factory Reset Closure Audit

**Date:** 2026-09-03
**Scope:** Framing factory reset (D1-D24)
**Live validation run:** `beckstead-reset-live-20260902-181129`

---

## 1. Actual Production Path

### Call graph

```
app.ts main()
  indexPlan(pdfPath)                           # src/pdf/indexPlan.ts
  runFramingResetTakeoff(input)                # src/framing/output/runFramingResetTakeoff.ts
    readFramingPlans(input)                    # src/framing/output/readFramingPlans.ts
      resolvePageClassificationForPipeline()
      buildPlanReadingOrderFromClassification()
      [Drawing Compiler: Project Learning, Orientation, DictionaryGovernor, compileDrawingPage]
      runFramingExtractionPasses()
      mergeExtractedAndGeometryEvidence()
      [bridge evidence builders]
      interpretFramingConstruction(evidence)   # src/framing/output/interpretFramingConstruction.ts
        interpretWalls       -> resolveWallFraming          # resolvers/resolveWallFraming.ts
        interpretOpenings    -> resolveOpenings              # resolvers/resolveOpenings.ts
        interpretStructuralMembers -> resolveStructuralMembers
        interpretFloorFraming -> resolveFloorFraming
        interpretRoofFraming  -> resolveRoofFraming
        interpretSheathing    -> resolveSheathing
    calculateFramingTakeoff(construction)      # src/framing/output/calculateFramingTakeoff.ts
      calculateWallFraming(walls, undefined, openings)
      calculateOpeningFraming(openings, walls, undefined)
      calculateStructuralMembers(members, undefined)
      calculateFloorFraming(floor, undefined)
      calculateRoofFraming(roof, undefined)
      calculateSheathing(sheathing, undefined)
    buildResetTakeoff(...)                     # src/framing/output/writeResetTakeoff.ts
    writeResetTakeoff(...)                     # -> artifacts/<projectId>/framing/reset-takeoff.json
```

### Per-dependency assessment

| Dependency | Job | North Star Box | Required? | Reset Scaffolding? |
|---|---|---|---|---|
| `indexPlan` | PDF to page JSON | UPLOAD PDF | Yes | No |
| `readFramingPlans` | Orchestrates reading pipeline | READ THE PLANS | Yes | No |
| `resolvePageClassificationForPipeline` | Classify pages by type | READ THE PLANS | Yes | No |
| `runFramingExtractionPasses` | Claude extraction | READ THE PLANS | Yes | No |
| `mergeExtractedAndGeometryEvidence` | Merge extraction sources | READ THE PLANS | Yes | No |
| Bridge evidence builders | Cross-domain relationships | READ THE PLANS | Yes | No |
| `interpretFramingConstruction` | Fan-out to 6 interpret adapters | READ THE PLANS | Orchestration only | **Yes** (pass-through) |
| `interpretWalls` .. `interpretSheathing` | Single-line delegations to resolvers | READ THE PLANS | No value added | **Yes** (pass-throughs) |
| `resolveWallFraming` .. `resolveSheathing` | Group evidence, resolve properties | READ THE PLANS | Yes | No |
| `calculateFramingTakeoff` | Orchestrate domain calculators | CALCULATE / DERIVE / ASSUME | Yes | No |
| `calculateWallFraming` .. `calculateSheathing` | Compute quantities | CALCULATE / DERIVE / ASSUME | Yes | No |
| `isQuantityInputResolved` | Null + unresolved guard | CALCULATE / DERIVE / ASSUME | Yes | No |
| `isQuantityBlocked` | Validation permission gate | (legacy) | Dead on reset path | **Yes** |
| `buildResetTakeoff` | Format output | MATERIAL TAXONOMY OUTPUT | Yes | No |
| `writeResetTakeoff` | Write JSON file | MATERIAL TAXONOMY OUTPUT | Yes | No |
| `resolvedObjectBaseSchema` | 8 lifecycle fields on every object | (legacy) | Schema-required but unused | **Yes** |

---

## 2. Four-Box Boundary Verification

### UPLOAD PDF

**Boundary:** `indexPlan` in `src/pdf/indexPlan.ts`. Converts PDF to JSON page text via OpenDataLoader, enriches with outline bookmarks, computes content hash. Returns `PlanIndex`.

**Clean.** No construction logic, no material decisions.

### READ THE PLANS

**Boundary:** `readFramingPlans` through `interpretFramingConstruction` to `FramingConstruction`. Produces six domain payload bags (walls, openings, structural members, floor, roof, sheathing).

**Mostly clean.** The `resolve*` functions inside the interpret layer do legitimate construction reconciliation (subject grouping, candidate selection, corroboration). However, they also populate old lifecycle fields (completion, reviewStatus, blockingStatus, resolutionTraces with evidence IDs) that no downstream consumer uses as production authority.

### CALCULATE / DERIVE / ASSUME

**Boundary:** `calculateFramingTakeoff` in `src/framing/output/calculateFramingTakeoff.ts`. Takes `FramingConstruction`, returns `{ materials, assumptions }`.

**Clean.** Passes `undefined` for validation everywhere. `pendingClaims` explicitly discarded (line 44). Assumption registry is self-contained.

### MATERIAL TAXONOMY OUTPUT

**Boundary:** `buildResetTakeoff` + `writeResetTakeoff` in `src/framing/output/writeResetTakeoff.ts`. Produces `reset-takeoff.json`.

**Clean.** Pure formatter. Strips `claimStatus`, `canonicalClassification`, `sourceObjectIds` from internal line items. No filtering, no authority gating.

### Boundary leak checklist

| Question | Answer | Evidence |
|---|---|---|
| Reader code making material eligibility decisions? | **NO** | Resolvers produce construction objects; they do not decide what material to emit. |
| Interpret adapters functioning as disguised resolver stages? | **YES** | All 6 interpret functions are single-line pass-throughs to the same `resolve*` functions used by the old pipeline. They add no construction meaning. |
| Calculators depend on resolution traces or authority lifecycle? | **PARTIALLY** | `isQuantityInputResolved` checks `resolutionTraces` for `method: "unresolved"`. This functions as a null guard. The traces themselves carry `evidenceIds` but those IDs are not used as authority -- only the `method` field matters. |
| Evidence functioning as production authority? | **NO** | Evidence is reader-internal transport. `interpretFramingConstruction` consumes it; nothing downstream sees raw Evidence. |
| Claims/candidacy on material existence paths? | **NO** | `buildClaimCandidacyContext`, `collectPendingClaims`, `admitMaterialClaimCandidate` are all unreachable from the reset path. |
| Centralized validation suppressing material? | **NO** | `validation` is always `undefined` on the reset path. `isQuantityBlocked` always returns `false`. |
| Confidence affects calculation/output? | **NO** | Confidence subsystem is not imported by any reset-path file. |
| `pendingClaims` required? | **NO** | Explicitly discarded at `calculateFramingTakeoff.ts:44`. `calculateOpeningFraming` returns empty arrays. |
| Canonical IDs/backlinks as calculation permission gates? | **NO** | `applyWallOpeningBacklinks` is not called. `interpretOpenings.ts` documents this explicitly. |
| Output packaging as permission/lifecycle stage? | **NO** | `buildResetTakeoff` is a pure formatter with no filtering. |

---

## 3. FramingConstruction Audit

### Schema location

`src/framing/output/framingConstruction.schema.ts` -- a Zod object composing six domain payload schemas.

### Verdict: B -- a simple construction bag wrapping a not-simple domain object model

`FramingConstruction` itself is just six payload fields. But every domain object inside it (BuildingWall, WallSegment, Opening, StructuralMember, FloorFramingSystem, FloorFramingArea, etc.) extends `resolvedObjectBaseSchema` (`src/core/schemas/resolved-object.schema.ts`), which requires:

| Field | Type | Used by reset consumers? |
|---|---|---|
| `id` | ObjectId | Yes (provenance) |
| `objectType` | string | Yes (identity) |
| `completion` | `{ status, percentage, completedItems, totalItems }` | **No** |
| `reviewStatus` | enum | **No** |
| `blockingStatus` | enum | **No** |
| `evidenceIds` | EvidenceId[] | **No** (debug only) |
| `assumptionIds` | AssumptionId[] | **No** |
| `validationIssueIds` | ValidationIssueId[] | **No** |
| `reviewItemIds` | ReviewItemId[] | **No** |
| `resolutionTraces` | PropertyResolutionTrace[] | **Partially** -- `isQuantityInputResolved` reads `method` field |

### Fields present only because the old architecture used them

- `completion` -- resolvers compute percentage; no consumer reads it.
- `reviewStatus` -- hardcoded `"no-review-required"` by resolvers; never read.
- `blockingStatus` -- hardcoded `"not-blocked"` by resolvers; never read.
- `evidenceIds` on objects -- populated; only used for debug serialization.
- `validationIssueIds`, `reviewItemIds` on objects -- always empty arrays; never read.

### Fields with legitimate function

- `id` -- used for provenance in line item `sourceObjectIds`.
- `objectType` -- identity/filtering.
- `resolutionTraces` -- `isQuantityInputResolved` uses `trace.method` as a null guard.
- Domain-specific fields (assembly, dimensions, lengths, joist specs, etc.) -- all legitimate.

### Are old lifecycle fields leaking through?

**Yes.** 8 fields per object are schema-required, populated by resolvers, and ignored by all consumers. This is dead structural weight inherited from `resolvedObjectBaseSchema`. The test fixtures confirm the burden: they must construct full `completion`, `resolutionTraces`, etc. just to test material calculations.

### Is it modeling the building deeper than takeoff requires?

**No.** The domain-specific fields (wall length, stud size, joist spacing, etc.) are directly consumed by calculators. The over-modeling is only in the lifecycle base, not in domain depth.

### Does it contain authority/eligibility/completion machinery?

**Yes, but inert.** `completion`, `reviewStatus`, `blockingStatus` are present on every object. No calculator or output writer reads them. They are structural ballast.

---

## 4. Interpret Adapter Audit

All 6 leaf adapt functions are in `src/framing/output/`:

| Function | File | Body | Classification |
|---|---|---|---|
| `interpretWalls` | `interpretWalls.ts` | `return resolveWallFraming([...evidence])` | **C** -- pure pass-through |
| `interpretOpenings` | `interpretOpenings.ts` | `return resolveOpenings([...evidence], { wallFraming })` | **C** -- pure pass-through |
| `interpretStructuralMembers` | `interpretStructuralMembers.ts` | `return resolveStructuralMembers([...evidence])` | **C** -- pure pass-through |
| `interpretFloorFraming` | `interpretFloorFraming.ts` | `return resolveFloorFraming([...evidence])` | **C** -- pure pass-through |
| `interpretRoofFraming` | `interpretRoofFraming.ts` | `return resolveRoofFraming([...evidence])` | **C** -- pure pass-through |
| `interpretSheathing` | `interpretSheathing.ts` | `return resolveSheathing([...evidence])` | **C** -- pure pass-through |
| `interpretFramingConstruction` | `interpretFramingConstruction.ts` | Calls 6 above + Zod parse | **C** -- orchestration scaffolding |

**None of the interpret functions perform construction discovery (A) or deterministic derivation (B).** Every one is a single-line delegation to a `resolve*` function in `src/framing/resolve/`. The resolvers themselves do legitimate work (subject grouping, candidate selection, property resolution). The interpret layer adds zero value.

The interpret layer exists because the reset was implemented incrementally -- it provided a seam between the new `readFramingPlans` orchestrator and the existing resolvers. Now that the reset is complete, these are pure scaffolding.

**The real work lives in the resolve* functions, which are category A/B and should stay.**

### Long-term assessment

The "interpret" concept is not inherently wrong. If the reader eventually needs a reconciliation/inference step between raw extraction and domain objects, that step could legitimately exist. But today, the interpret layer does not perform that job -- it merely wraps existing resolver calls. The layer should be absorbed: `readFramingPlans` (or a renamed `buildFramingConstruction` helper) can call the resolvers directly.

---

## 5. Evidence Dependence Audit

### Where Evidence is created

All within `readFramingPlans` (`src/framing/output/readFramingPlans.ts`):

| Source | Description |
|---|---|
| `runFramingExtractionPasses()` | Claude extraction output |
| `buildGeometryEvidenceFromCompiledPages()` | Geometry compiler output |
| `buildAreaSystemRelationshipEvidence()` | Cross-domain relationship bridge |
| `buildConstructionSemanticRelationshipEvidence()` | Semantic relationship bridge |
| `buildGovernedSemanticCompilerEvidenceWithOwnership()` | Governed semantic compiler |
| `buildSemanticBindingEvidenceFromCompiledPages()` | Semantic binding bridge |

### Where Evidence is consumed

1. `interpretFramingConstruction` receives `Evidence[]` and fans out to 6 interpret functions.
2. Each interpret function passes `Evidence[]` to a `resolve*` function.
3. Resolvers group by `subjectKey`, select `candidateValue`, build `resolutionTraces` with `evidenceIds`.
4. Evidence is **not** consumed by calculators or the output writer directly.

### Can FramingConstruction be produced without Evidence?

**No.** `interpretFramingConstruction` requires `Evidence[]`. With an empty array, resolvers produce empty payloads (valid but content-free). Evidence is the sole carrier of extracted construction data into the resolution layer.

### Does Evidence carry unique reader information?

**Yes.** Evidence uniquely carries:
- `subjectKey` + `subjectKind` -- clusters facts into future resolved objects
- `candidateValue` + `propertyPath` -- extracted construction values
- `source` (page, region) -- extraction provenance
- `type` (geometry, dimension, schedule) -- source mechanism classification
- `relationship` -- corroboration/conflict detection

No alternative source provides this information.

### Do Evidence IDs/traces affect calculator usability?

**Yes, indirectly.** Evidence IDs flow into `PropertyResolutionTrace.evidenceIds` on resolved objects. `isQuantityInputResolved` reads `trace.method` (not the evidence IDs themselves) to determine if a property is calculable. If a trace has `method: "unresolved"`, the calculator skips that quantity.

The evidence IDs within traces are not themselves gates -- only the `method` enum value matters. However, the trace structure carrying those IDs is required by the schema.

### Would removing Evidence today lose genuine reading capability?

**Yes.** Evidence is the only mechanism for getting extracted construction data from Claude/geometry into resolved domain objects.

### Classification

| Usage | Classification |
|---|---|
| Evidence as reader-internal transport (extraction -> resolvers) | **KEEP LONG-TERM** |
| `subjectKey`/`candidateValue`/`source` fields | **KEEP LONG-TERM** (unique data) |
| Evidence IDs on resolved objects (`evidenceIds` field) | **ABSORB LATER** (debug/provenance, not production authority) |
| Evidence IDs inside `PropertyResolutionTrace` | **ABSORB LATER** (carried structurally, not read by calculators) |
| Evidence type as the function signature for interpret/resolve | **ABSORB LATER** (Evidence is correct for now; future reader may produce FramingConstruction directly) |

---

## 6. Old-Architecture Concept Remnants

Search scope: files actually imported by the new framing production path (starting from `runFramingResetTakeoff`).

| Concept | Found on production path? | Classification | Details |
|---|---|---|---|
| Resolved object lifecycle (`completion`, `reviewStatus`, `blockingStatus`) | **YES** -- `resolvedObjectBaseSchema` required on every domain object | **TEMPORARY RESET DEBT** | Populated by resolvers, never read by calculators or output. |
| `resolutionTrace` / `PropertyResolutionTrace` | **YES** -- created by resolvers, read by `isQuantityInputResolved` | **LEGITIMATE LONG-TERM LOGIC** | Functions as a null/unresolved guard. The `method` field is genuinely useful. The embedded ID arrays are structural baggage. |
| `isQuantityInputResolved` | **YES** -- all 6 calculators | **LEGITIMATE LONG-TERM LOGIC** | Pure null guard with trace awareness. |
| `isQuantityBlocked` | **YES** -- all 6 calculators | **TEMPORARY RESET DEBT** | Always returns `false` when `validation` is `undefined`. Dead on reset path. |
| Evidence authority | **NO** | N/A | Evidence is reader-internal; not treated as authority downstream. |
| `claimStatus` | **YES** -- `calculateOpeningFraming` sets it on line items via `deriveMaterialClaimStatus` | **TEMPORARY RESET DEBT** | Set but never consumed on reset path. `buildResetTakeoff` strips it. |
| `PendingMaterialClaim` | **YES** -- type imported by `calculateOpeningFraming` | **TEMPORARY RESET DEBT** | Always produces empty arrays. |
| Candidacy (`buildClaimCandidacyContext`) | **NO** -- not imported by reset path | **DEAD/LEGACY** | |
| `ConfidenceEvaluation` | **NO** -- not imported by reset path | **DEAD/LEGACY** | |
| Stage 13/15/16 report | **NO** -- comment references only in `calculateFramingTakeoff.ts` | **DEAD/LEGACY** | |
| Canonical parent/backlink requirements | **NO** -- `applyWallOpeningBacklinks` not called | **DEAD/LEGACY** | |
| Centralized validation permission | **NO** -- `validation-coordinator.ts` not imported | **DEAD/LEGACY** | |
| Artifact envelope | **NO** -- not imported by reset path | **DEAD/LEGACY** | |

---

## 7. Calculator Contract Audit

### Do calculators answer the right question?

**Yes.** All 6 calculators answer: "Given what we understand about this house, what framing material is required and how much?"

- `calculateWallFraming`: studs (each) and plates (linear-foot) per wall segment.
- `calculateOpeningFraming`: king studs, jack studs, rough sill LF, cripple studs.
- `calculateStructuralMembers`: material LF per member (handles ply count).
- `calculateFloorFraming`: joist count (each) and joist LF per floor area.
- `calculateRoofFraming`: common rafter count (each) per roof plane.
- `calculateSheathing`: sheathing area SF per coverage area.

### Old permission machinery in calculators

| Pattern | Where | Genuine guard or old permission? |
|---|---|---|
| `isQuantityInputResolved` | All 6 calculators | **Genuine null guard.** Checks value is non-null and trace method is not "unresolved". |
| `isQuantityBlocked(validation, ...)` | All 6 calculators | **Old permission machinery.** Always `false` on reset path because `validation` is `undefined`. |
| `resolutionTraces` reads | All 6 calculators via `isQuantityInputResolved` | **Legitimate.** Only `method` field is read. |
| `deriveMaterialClaimStatus` | `calculateOpeningFraming` | **Old metadata tagging.** Sets `claimStatus` string on line items; no downstream consumer reads it on reset path. |
| `hasJoistCountLayoutAxisAuthority` | `calculateFloorFraming` | **Legitimate.** Checks resolution traces for measurement direction -- genuine data-quality guard. |
| `isNonWoodFloorTakeoffAreaFromTraces` | `calculateFloorFraming` | **Legitimate.** Filters non-wood areas from wood framing calculation. |
| `isStickCommonRafterFramingType` | `calculateRoofFraming` | **Legitimate.** Material eligibility check. |

### Summary

Calculators are architecturally correct. The two vestiges (`isQuantityBlocked` and `deriveMaterialClaimStatus`) are inert on the reset path but add conceptual noise.

---

## 8. Assumption Placement Audit

### Implementation

The assumption registry is at `src/framing/claims/assumptionRegistry.ts`. Three opening defaults:

1. King stud count (default: 2)
2. Rough sill size (default: wall stud size)
3. Cripple stud layout (default: layout-continuation-from-rough-width)

### Does using an assumption require old claim machinery?

**No.** `consultAssumptionRegistry` is self-contained:
- Pure map lookup by `(quantityKey, propertyPath)`.
- `isEligible` is a deterministic function (no claim/validation/confidence input).
- Returns `AssumptionConsultationResult` discriminated union directly.
- No `PendingMaterialClaim`, no `collectPendingClaims`, no lifecycle.

### Does assumption usage suppress calculation?

**No, correctly.** If a required property has no plan-stated value AND no registered assumption, the calculator correctly returns no line items for that sub-calculation. This is a genuine math guard ("I don't have a king stud count to multiply"), not old permission machinery.

### Can CALCULATE / DERIVE / ASSUME reach governed assumptions naturally?

**Yes.** `calculateOpeningFraming` calls `consultAssumptionRegistry` directly. No intermediate lifecycle, claim, or candidacy step is required.

### Verdict

Assumption placement is **acceptable** and does not violate the target architecture. The assumption registry's location in `src/framing/claims/` is a naming/organizational artifact (it shares a directory with old claim machinery) but is not functionally entangled.

---

## 9. Temporary Output Audit

### Output: `reset-takeoff.json`

Schema: `src/framing/output/resetTakeoff.schema.ts`
Writer: `buildResetTakeoff` + `writeResetTakeoff` in `src/framing/output/writeResetTakeoff.ts`

| Question | Answer |
|---|---|
| Modifies material existence? | **No** -- 1:1 map from input materials to output rows. |
| Filters by authority? | **No** |
| Requires confidence? | **No** -- confidence is not imported or referenced. |
| Requires pending claims? | **No** |
| Requires review completion? | **No** |
| Requires lifecycle state? | **No** |
| Performs eligibility decision? | **No** -- pure formatting with Zod validation. |

The output schema (`resetTakeoffSchema`) contains only: description, quantity, unit, optional category/domain/quantityKey/assumptionUsed/assumptionNote/debugSourceIds. No old-architecture fields.

### Verdict

The temporary writer is **clean** and can remain until the definitive Material Taxonomy work begins. It adds no architectural debt.

---

## 10. Legacy Escape Hatch / Dead Code Audit

### `--legacy-pipeline` escape hatch

`src/app.ts:39` -- when passed, routes to `PipelineRunner` with the old 16-stage `framingScope.stages` from `src/framing/stages/createFramingStages.ts`.

**Value assessment:** The escape hatch provides comparison/replay value during the transition period. The `scripts/compare-reset-takeoffs.ts` comparison tool and the `beckstead-reset-m1` baseline both depend on being able to run or reference old-pipeline outputs.

**Risk:** Keeping `--legacy-pipeline` indefinitely risks keeping obsolete architecture alive as an implicit reference. Developers may accidentally use old patterns as precedent.

**Recommendation:** Keep for now. Remove once the reset is closed and V1 material work has established its own baselines. Flag with a `@deprecated` JSDoc.

### Major old production files

| File / Directory | Status | Recommendation |
|---|---|---|
| `src/framing/stages/createFramingStages.ts` | Legacy 16-stage definition | **Safe deletion candidate** (after escape hatch removal) |
| `src/core/pipeline/PipelineRunner.ts` | Generic pipeline runner | **Safe deletion candidate** |
| `src/framing/calculate/calculation-coordinator.ts` | Legacy calculator coordinator (adds fasteners, pendingClaims) | **Safe deletion candidate** |
| `src/framing/calculate/calculateFasteners.ts` | Fastener calculator (not called on reset path) | **Harmless unreachable legacy** |
| `src/framing/validators/validation-coordinator.ts` | Stage 13 validation | **Safe deletion candidate** |
| `src/framing/confidence/` (entire directory) | Stage 15 confidence evaluation | **Safe deletion candidate** |
| `src/framing/observability/` (entire directory) | Stage 16 product state / readiness | **Safe deletion candidate** |
| `src/framing/claims/collectPendingClaims.ts` | PendingClaim lifecycle | **Safe deletion candidate** |
| `src/framing/claims/buildClaimCandidacyContext.ts` | Claim candidacy context | **Safe deletion candidate** |
| `src/framing/claims/admitMaterialClaimCandidate.ts` | Claim admission | **Safe deletion candidate** |
| `src/framing/review-workspace/` | Review workspace | **Harmless unreachable legacy** |
| `src/framing/audit/` | Audit metrics | **Useful debug tool** |
| `src/framing/resolve/applyWallOpeningBacklinks.ts` | Backlink application | **Harmless unreachable legacy** |
| `src/framing/resolve/linkOpeningHeaderRelationships.ts` | Opening-header linking | **Harmless unreachable legacy** |

---

## 11. Live Run Validation

### What the Beckstead live run proved

| Claim | Proven? | Evidence |
|---|---|---|
| PDF can enter the new path | **YES** | `beckstead-residence-plans.pdf` processed successfully |
| Page classification executes | **YES** | Multiple pages classified for framing extraction |
| Drawing Compiler executes (Project Learning, Orientation, DictionaryGovernor) | **YES** | Compiled page artifacts produced |
| Claude extraction executes live | **YES** | Evidence produced from extraction passes |
| `FramingConstruction` is produced | **YES** | 58 walls, 117 openings, 51 structural members, 5 floor systems, 13 floor areas |
| Wall information crosses reader -> calculator | **YES** | 52 wall material lines (studs + plates) emitted |
| Floor information crosses reader -> calculator | **YES** | 31 joists (each) + 527 LF emitted |
| 31/527 floor derivation executes | **YES** | `floor.joists` and `floor.joist-linear-feet` in output |
| Material emits without Stage 13 validation | **YES** | 54 material lines; no validation payload involved |
| Output emits without Stage 15 confidence | **YES** | No confidence subsystem imported or called |
| Output emits without Stage 16 report | **YES** | `reset-takeoff.json` produced directly |
| Assumptions reach calculators naturally | **YES** | Opening calculators reference assumption registry |
| `pendingClaims` are not required | **YES** | Explicitly discarded; output produced |

### What the run did NOT prove

| Gap | Category |
|---|---|
| Opening material emission (0 lines) | Material/domain capability gap (not architecture) |
| Structural member material emission (0 lines in live; LVL regression from m1) | Material/domain capability gap |
| Roof framing material emission (0 lines) | Material/domain capability gap |
| Sheathing material emission (0 lines) | Material/domain capability gap |
| Multi-scope operation | Not tested (framing only) |
| User decision / override flow | Not exercised on reset path |
| Error recovery / partial failure | Not tested |
| Multiple PDF plans | Not tested |

**The live run validated the reset architecture. Material gaps are domain capability work, not architectural problems.**

---

## 12. Reset Closure Verdict

**RESET VERDICT: B**

**RESET NEEDS ONE CLEANUP PASS BEFORE CLOSURE.**

The implemented architecture correctly follows the four-box model:

```
UPLOAD PDF -> READ THE PLANS -> CALCULATE / DERIVE / ASSUME -> MATERIAL TAXONOMY OUTPUT
```

No significant redesign is required. The live Beckstead run empirically proved the architecture works end-to-end.

However, temporary reset/migration scaffolding remains on the production path that will create confusion and friction if V1 capability work is built on top of it:

1. `resolvedObjectBaseSchema` forces 8 unused lifecycle fields onto every domain object.
2. The interpret layer is 6 single-line pass-throughs with no added value.
3. `isQuantityBlocked` is dead old permission machinery called from every calculator.
4. `claimStatus` / `PendingMaterialClaim` vestiges in the opening calculator.
5. `completion` / `reviewStatus` / `blockingStatus` populated by resolvers but never consumed.

These are normal implementation debt from an incremental reset. They do not distort the architecture. But they should be cleaned up before new developers encounter them and infer they are intentional design patterns.

---

## 13. Reset Closure Cleanup Plan

**Status: IMPLEMENTED** — see [RESET_CLOSURE_IMPLEMENTATION_PLAN.md](./RESET_CLOSURE_IMPLEMENTATION_PLAN.md).

The amended plan (not the deferred audit draft below) was executed:

1. Retire `--legacy-pipeline` and the executable 16-stage framing pipeline.
2. Absorb interpret pass-throughs into `readFramingPlans`.
3. Remove centralized validation permission from calculator contracts.
4. Remove `claimStatus` / `PendingMaterialClaim` from the material path.
5. Slim `resolvedObjectBaseSchema` in place to `{ id, objectType, resolutionTraces }` (no parallel reset schemas).
6. Delete classified legacy-only modules (coordinators, confidence, observability, review-workspace, `calculateFasteners`, claim candidacy).
7. Preserve Evidence, resolution/input guards, assumption registry, and `reset-takeoff.json`.

Historical draft items from the pre-amendment audit (kept for record only):

### Cleanup 1: Absorb interpret pass-through layer — DONE

### Cleanup 2: Remove `isQuantityBlocked` from production calculators — DONE

### Cleanup 3: Remove `claimStatus` / `PendingMaterialClaim` — DONE

### Cleanup 4: Narrow `resolvedObjectBaseSchema` — DONE (in place; not deferred)

### Cleanup 5 (amended): Retire `--legacy-pipeline` — DONE

---

## 14. Summary

**RESET VERDICT: B (cleanup completed)**

**RESET CLOSURE CLEANUP REQUIRED:** *(completed)*

1. Absorb interpret pass-through layer
2. Remove `isQuantityBlocked` / validation permission from calculator contracts
3. Remove `claimStatus` / `PendingMaterialClaim` vestiges
4. Slim `resolvedObjectBaseSchema` in place
5. Retire `--legacy-pipeline` and delete unreachable legacy production architecture
