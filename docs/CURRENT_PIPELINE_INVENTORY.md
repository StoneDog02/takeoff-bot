# Current Framing Pipeline Inventory

**Status:** FACTUAL CODE INSPECTION MAP for USER + ChatGPT.  
**Not** a migration plan. **Not** KEEP/REMOVE recommendations. **Not** a replacement pipeline.  
**Source of truth for stage wiring:** [`src/scopes/framing/stages/createFramingStages.ts`](../src/scopes/framing/stages/createFramingStages.ts) via [`PipelineRunner`](../src/core/pipeline/PipelineRunner.ts).

**Label legend**

- **FACT:** Confirmed by current code.  
- **DEPENDENCY:** Current code requires/consumes this (runtime throw or compile import).  
- **HISTORICAL/INTENT:** Comment/doc explains introduction.  
- **UNKNOWN:** Reason not established from current code.

Hard dependencies below mean: *if this stage vanished today with no other edits, what breaks.* That is not a product justification.

---

## STAGE 1 — verifiedPlanSet

**PURPOSE TODAY**  
Persist the already-built plan index as a typed stage artifact.

**INPUTS**  
`context.planIndex` (pipeline context; not from a prior stage).

**OPERATIONS**

1. Wrap `context.planIndex` in a framing stage artifact (`verified-plan-set`).  
   - **File/function:** inline `run` → `createFramingStageArtifact` + `verifiedPlanSetArtifactSchema`.  
   - **Why now:** **FACT** — stage only persists the plan index.  
   - **Consumed later:** Not read via `getPayload("verifiedPlanSet")` in later stages in this file. Downstream stages use `context.planIndex` directly.

**OUTPUTS**  
Artifact `verified-plan-set` / stage key `verifiedPlanSet`.

**DOWNSTREAM DEPENDENCIES**  
**FACT:** No later stage in `createFramingStages.ts` calls `getPayload(..., "verifiedPlanSet")`. Artifact store / audit tooling may still list it.

**HARD DEPENDENCIES**  
**DEPENDENCY:** `PipelineRunner` requires contiguous stage orders 1..N (`validateStageOrder`). Removing stage 1 without renumbering breaks runner validation.  
**FACT:** No later stage `getPayload` hard-requires this artifact’s payload today.

---

## STAGE 2 — pageClassification

**PURPOSE TODAY**  
Classify each plan page (kind / content roles) for routing and compiler selection.

**INPUTS**  
`context.planIndex`, `context.useMockAi`.

**OPERATIONS**

1. Resolve page classifications.  
   - **File/function:** `resolvePageClassificationForPipeline` (imported into stage file).  
   - **Why now:** **FACT** — produces `{ pages }` classification list.  
   - **Consumed later:** Stages 3, 5, 6.

2. Persist `page-classification` artifact.  
   - **File/function:** `createFramingStageArtifact` + `pageClassificationArtifactSchema`.

**OUTPUTS**  
Artifact `page-classification` / `pageClassification` with `{ pages }`.

**DOWNSTREAM DEPENDENCIES**  
- Stage 3: `getPayload("pageClassification")` → reading order.  
- Stage 5: classified pages + schedule page pick; `selectPagesForDrawingCompiler`.  
- Stage 6: extraction passes + construction-semantic relationship builder use classified pages.

**HARD DEPENDENCIES**  
**DEPENDENCY:** Stages 3, 5, 6 call `getPayload(..., "pageClassification")` and throw if missing.

---

## STAGE 3 — planReadingOrder

**PURPOSE TODAY**  
Derive a deterministic page reading order from classification.

**INPUTS**  
Stage 2 `pageClassification.pages`.

**OPERATIONS**

1. Build ordered page numbers from classification.  
   - **File/function:** `buildPlanReadingOrderFromClassification`.  
   - **Why now:** **FACT** — pure transform of classified pages.  
   - **Consumed later:** Stages 5, 6.

2. Persist `plan-reading-order` artifact.

**OUTPUTS**  
Artifact `plan-reading-order` / `planReadingOrder` (includes `orderedPageNumbers`).

**DOWNSTREAM DEPENDENCIES**  
- Stage 5: `selectPagesForDrawingCompiler({ orderedPageNumbers })`.  
- Stage 6: `runFramingExtractionPasses({ planReadingOrder })`.

**HARD DEPENDENCIES**  
**DEPENDENCY:** Stages 5 and 6 `getPayload("planReadingOrder")`.

---

## STAGE 4 — buildingAssemblies

**PURPOSE TODAY**  
Emit a static stub “building assemblies” payload.

**INPUTS**  
None from prior stages (ignores plan content).

**OPERATIONS**

1. Write hardcoded payload.  
   - **File/function:** inline stub in stage `run`.  
   - **Payload (FACT):** `assemblyNames: ["exterior-wood-stud-wall"]`, notes referencing “explicit mock fixture statement.”  
   - **Consumed later:** Stage 6 live extraction path passes it into `runFramingExtractionPasses` → prompts (`extractFramingEvidence` stringifies assemblies into Claude context).

**OUTPUTS**  
Artifact `building-assemblies` / `buildingAssemblies`.

**DOWNSTREAM DEPENDENCIES**  
- Stage 6: `getPayload("buildingAssemblies")` always; used in non-mock extraction. Mock path still fetches the payload even if unused for Claude.

**HARD DEPENDENCIES**  
**DEPENDENCY:** Stage 6 `getPayload("buildingAssemblies")` throws if stage absent.  
**FACT:** Content is not computed from the plan; audit metrics schema labels this stage `"stub"`.

---

## STAGE 5 — compiledDrawingPages

**PURPOSE TODAY**  
Optionally run Drawing Compiler (+ Project Learning / Project Orientation dictionary) and emit compiled pages plus companion artifacts.

**INPUTS**  
Stages 2–3 payloads; `context.planIndex`; feature flags (`isDrawingCompilerEnabled`, `isProjectLearningEnabled`, `isProjectOrientationEnabled`); `context.useMockAi`.

**OPERATIONS**

1. **Gate:** If compiler disabled, leave `pages = []` and still emit empty compiled-pages + audit companion.  
   - **File/function:** `isDrawingCompilerEnabled()`.

2. Select pages for compilation.  
   - **File/function:** `selectPagesForDrawingCompiler` (classification, reading order, empty-text page numbers).

3. **Optional Project Learning** (`isProjectLearningEnabled`): harvest/interpret/validate definitions; write companion `project-learning`.  
   - **File/function:** `runProjectLearning`.  
   - **Consumed later:** Merged into dictionary / orientation defs in this stage; Stage 6 may read `projectDictionary` override.

4. **Optional Project Orientation** (`isProjectOrientationEnabled`): build orientation dictionary, merge learning defs, `DictionaryGovernor.govern`, publish `project-dictionary` companion + `projectDictionary` artifact override.  
   - **Files:** `buildOrientationDictionary`, `DictionaryGovernor`, `CompilerInvestigationFacade`.

5. **Else if learning defs exist without orientation:** govern learning-only dictionary; same companion/override pattern.

6. Compile each selected page.  
   - **File/function:** `compileDrawingPage` (cross-page defs + orientation context).  
   - **Consumed later:** Stage 6 geometry/semantic/existence bridges.

7. Build compiler automation audit companion.  
   - **File/function:** `buildCompilerAutomationAudit`.

8. Persist primary `compiled-drawing-pages` artifact `{ pages }`.

**OUTPUTS**  
Primary: `compiled-drawing-pages` / `compiledDrawingPages`.  
Companions (conditional): `project-learning`, `project-dictionary`, `compiler-automation-audit`.  
Override key: `projectDictionary` (when published).

**DOWNSTREAM DEPENDENCIES**  
- Stage 6: `getPayload("compiledDrawingPages")`; optional `completedArtifacts.get("projectDictionary")`.  
- Geometry/semantic/wall-existence evidence builders consume compiled pages.

**HARD DEPENDENCIES**  
**DEPENDENCY:** Stage 6 always `getPayload("compiledDrawingPages")` (may be empty pages).  
**FACT:** If compiler flag off, stage still runs and returns empty `pages`.

---

## STAGE 6 — extractedEvidence

**PURPOSE TODAY**  
Produce the unified Evidence list (Claude/mock/replay + geometry/semantic bridges) that domain resolvers consume.

**INPUTS**  
Stages 2–5; optional `projectDictionary`; optional `userDecisionRunInput.evidenceReplay`; plan PDF path / OCR cache env for wall notes.

**OPERATIONS**

1. **Evidence replay branch** (if `evidenceReplay` set): fingerprint check; clone replay artifact payload; return early.  
   - **File/function:** inline + `computePlanSourceFingerprint`.  
   - **Consumed later:** Stages 7–12, 15.

2. Load classification, reading order, building assemblies, compiled pages, optional dictionary.

3. **Claude or mock extraction**  
   - Mock: `buildMockExtractedEvidence`.  
   - Live: `runFramingExtractionPasses` (+ companions: extraction budget audit, optional plan-reference trace).

4. Build geometry evidence from compiled pages; merge with Claude evidence.  
   - **Files:** `buildGeometryEvidenceFromCompiledPages`, `mergeExtractedAndGeometryEvidence`.

5. Area–system relationship bridge evidence (dictionary-aware).  
   - **File:** `buildAreaSystemRelationshipEvidence`.

6. Construction semantic relationship evidence + relationship-emission audit companion.  
   - **File:** `buildConstructionSemanticRelationshipEvidence`, `buildRelationshipEmissionAudit`.

7. Collect wall-assembly note texts (OCR/cache); build governed semantic compiler evidence; optionally adopt opening semantic evidence onto geometry subjects.  
   - **Files:** `collectWallAssemblyNoteTexts`, `buildGovernedSemanticCompilerEvidenceWithOwnership`, `adoptOpeningSemanticEvidenceOntoGeometry`.

8. **Optional semantic binding** (`isDrawingSemanticBindingEnabled`): binding evidence + semantic-binding audit companion.  
   - **Files:** `buildSemanticBindingEvidenceFromCompiledPages`, `buildSemanticBindingAudit`.

9. Wall existence evidence for PBG runs (after other wall emitters).  
   - **File:** `buildWallExistenceEvidenceFromCompiledPages`.  
   - **HISTORICAL/INTENT:** Comment in stage: existence-only for corroborated runs; requires opening parent demand to limit decision burden.

10. Enrich/publish compiler automation audit companion (merge conflict counts).

11. Persist `extracted-framing-evidence` `{ evidence }`.

**OUTPUTS**  
Primary: `extracted-framing-evidence` / `extractedEvidence`.  
Companions: extraction audit, plan-reference trace, relationship-emission audit, semantic-binding audit, compiler-automation-audit (as published).

**DOWNSTREAM DEPENDENCIES**  
- Stages 7–12: each `getPayload("extractedEvidence")` → domain `resolve*`.  
- Stage 15: evidence IDs for confidence.  
- Stage 16: evidence list for package product state.

**HARD DEPENDENCIES**  
**DEPENDENCY:** Stages 7–12, 15, 16 require this artifact via `getPayload` / product-state input.

---

## STAGE 7 — wallFraming

**PURPOSE TODAY**  
Resolve Evidence into wall + wall-segment domain objects.

**INPUTS**  
Stage 6 evidence; optional UserDecision run input.

**OPERATIONS**

1. `resolveWallFraming(evidence[, userDecision options])`.  
   - **File:** `resolvers/resolveWallFraming.ts`.  
   - **FACT:** Clusters/converges wall evidence into `walls` + `segments` with properties and resolutionTraces.  
   - **Consumed later:** Stage 8 (openings + backlinks), 13–16, calculations.

2. Persist `wall-framing` artifact.

**OUTPUTS**  
`wall-framing` / `wallFraming` (`walls`, `segments`).

**DOWNSTREAM DEPENDENCIES**  
- Stage 8: parent mapping / backlinks.  
- Stage 13: `validateWallFraming`; related maps for floor/roof/openings.  
- Stage 14: `calculateWallFraming`; opening calc needs walls.  
- Stages 15–16: ids, confidence, report, product state.

**HARD DEPENDENCIES**  
**DEPENDENCY:** Stages 8, 13–16 `getPayload("wallFraming")`. Stage 8 also throws if wall artifact missing when publishing link override.

---

## STAGE 8 — openings

**PURPOSE TODAY**  
Resolve openings from Evidence (with wall context); optionally rewrite wall opening link lists.

**INPUTS**  
Stages 6–7; optional UserDecision input.

**OPERATIONS**

1. `resolveOpenings(evidence, { wallFraming, userDecisions… })`.  
   - **File:** `resolvers/resolveOpenings.ts`.  
   - **FACT:** Builds opening objects; can set `parentWallId` / `parentObjectId` from physical-run mapping when wall/segment exist.

2. `applyWallOpeningBacklinks(wallPayload, openings)` — update wall/segment `openingIds` when links change.

3. Persist openings artifact.

4. If links changed: publish wallFraming artifact override + `wall-framing-links` companion.  
   - **Files:** `createLinkedWallFramingArtifact`, stage side-effects.

**OUTPUTS**  
`openings` / `openings`; optional overridden `wallFraming` + companion.

**DOWNSTREAM DEPENDENCIES**  
- Stage 9: openings for header linking.  
- Stage 13–16: validation, calc, confidence, report.  
- Stage 14: `calculateOpeningFraming` reads openings + walls; **FACT:** calculator skips an opening when `parentObjectId` does not resolve to a wall segment (`resolveParentSegment` → `continue`).

**HARD DEPENDENCIES**  
**DEPENDENCY:** Stages 9, 13–16 require openings artifact. Stage 9 throws if openings artifact missing when linking.

---

## STAGE 9 — structuralMembers

**PURPOSE TODAY**  
Resolve structural members from Evidence; link opening↔header relationships; optionally override openings/members artifacts.

**INPUTS**  
Stages 6 + 8; optional UserDecision input.

**OPERATIONS**

1. `resolveStructuralMembers(evidence[, userDecisions])` → scalar members payload.  
   - **File:** `resolvers/resolveStructuralMembers.ts`.

2. `linkOpeningHeaderRelationships(evidence, openings, scalarPayload)` → linked openings + members.  
   - **FACT:** May set `headerMemberId` / association fields used later.

3. Persist structural-members artifact (scalar payload first).

4. If opening header links changed: override openings artifact + companion.  
5. If member↔opening links changed: override structuralMembers artifact + companion.

**OUTPUTS**  
`structural-members` / `structuralMembers`; optional overridden `openings` / `structuralMembers` + link companions.

**DOWNSTREAM DEPENDENCIES**  
- Stages 13–16: validation, `calculateStructuralMembers`, confidence, report.  
- Opening header validation/calc paths read linked openings when overrides applied.

**HARD DEPENDENCIES**  
**DEPENDENCY:** Stages 13–16 `getPayload("structuralMembers")`. Requires openings artifact present for linking block.

---

## STAGE 10 — sheathing

**PURPOSE TODAY**  
Resolve sheathing systems/areas from Evidence.

**INPUTS**  
Stage 6 evidence; optional UserDecision input.

**OPERATIONS**

1. `resolveSheathing(evidence[, userDecisions])`.  
   - **File:** `resolvers/resolveSheathing.ts`.  
   - **FACT:** Produces `systems` + `areas` (areas may be empty).

2. Persist `sheathing` artifact.

**OUTPUTS**  
`sheathing` / `sheathing`.

**DOWNSTREAM DEPENDENCIES**  
- Stages 13–16: `validateSheathing`, `calculateSheathing` (iterates **areas** only), confidence, report.

**HARD DEPENDENCIES**  
**DEPENDENCY:** Stages 13–16 `getPayload("sheathing")`.

---

## STAGE 11 — floorFraming

**PURPOSE TODAY**  
Resolve floor framing systems/areas from Evidence.

**INPUTS**  
Stage 6 evidence; optional UserDecision input.

**OPERATIONS**

1. `resolveFloorFraming(evidence[, userDecisions])`.  
   - **File:** `resolvers/resolveFloorFraming.ts` (includes local convergence/fragment behavior inside resolver module tree).

2. Persist `floor-framing` artifact.

**OUTPUTS**  
`floor-framing` / `floorFraming`.

**DOWNSTREAM DEPENDENCIES**  
- Stages 13–16: floor validation/calc/confidence/report.

**HARD DEPENDENCIES**  
**DEPENDENCY:** Stages 13–16 `getPayload("floorFraming")`.

---

## STAGE 12 — roofFraming

**PURPOSE TODAY**  
Resolve roof framing systems/planes from Evidence.

**INPUTS**  
Stage 6 evidence; optional UserDecision input.

**OPERATIONS**

1. `resolveRoofFraming(evidence[, userDecisions])`.  
   - **File:** `resolvers/resolveRoofFraming.ts`.

2. Persist `roof-framing` artifact.

**OUTPUTS**  
`roof-framing` / `roofFraming`.

**DOWNSTREAM DEPENDENCIES**  
- Stages 13–16: roof validation/calc/confidence/report.

**HARD DEPENDENCIES**  
**DEPENDENCY:** Stages 13–16 `getPayload("roofFraming")`.

---

## STAGE 13 — validation

**PURPOSE TODAY**  
Run framing domain validators; emit validation issues + review items (+ quantityImpacts including `canCalculate`).

**INPUTS**  
Stages 7–12 domain payloads (wall, openings, structural, floor, roof, sheathing).  
**FACT:** Pipeline does **not** pass blocking, connectorsHardware, assumptions, or framingScope payloads into the coordinator (those validator branches are unused on this path).

**OPERATIONS**

1. `coordinateFramingValidation({ wallFraming, openings, structuralMembers, floorFraming, roofFraming, sheathing })`.  
   - **File:** `validators/validation-coordinator.ts`.  
   - **Sub-ops (FACT):**  
     1. `validateWallFraming`  
     2. `validateFloorFraming` (optional related wall/opening/SM maps)  
     3. `validateRoofFraming` (same)  
     4. `validateSheathing`  
     5. `validateOpenings` (parent maps when walls present)  
     6. `validateStructuralMembers`  
   - Each failed rule can mint issues + review items with `quantityImpacts[].canCalculate`.  
   - **Consumed later:** Stage 14 `isQuantityBlocked`; Stage 15 confidence; Stage 16 review/issue ids + summary.

2. Persist `validation` artifact.

**OUTPUTS**  
`validation` / `validation` (`validationIssues`, `validationResults`, `reviewItems`).

**DOWNSTREAM DEPENDENCIES**  
- Stage 14: passed into every domain calculator via coordinator; `isQuantityBlocked` suppresses quantities when matching issue has `canCalculate === false`.  
- Stage 15: confidence from validation + objects.  
- Stage 16: `reviewItemIds`, `validationIssueIds`, summary counts; product-state builder.

**HARD DEPENDENCIES**  
**DEPENDENCY:** Stages 14–16 `getPayload("validation")`.

---

## STAGE 14 — calculations

**PURPOSE TODAY**  
Run domain calculators; collect materials, assumptions, pending claims.

**INPUTS**  
Stages 7–13 payloads.

**OPERATIONS**

1. `coordinateFramingCalculations({ wallFraming, openings, structuralMembers, floorFraming, roofFraming, sheathing, validation })`.  
   - **File:** `calculators/calculation-coordinator.ts`.  
   - **Sub-ops (FACT):**  
     1. `calculateWallFraming` (uses validation blocks)  
     2. `calculateOpeningFraming` (walls+openings+validation; assumptions/pending; skips without parent segment)  
     3. `calculateStructuralMembers`  
     4. `calculateFloorFraming`  
     5. `calculateRoofFraming`  
     6. `calculateSheathing` (areas only)  
     7. `collectPendingClaims` + `buildClaimCandidacyContext` + `admitMaterialClaimCandidate`  
     8. `deriveMaterialClaimStatus` on materials lacking status  
   - **Also FACT:** Opening path may `consultAssumptionRegistry` (king/sill/cripple) inside opening calculator.

2. Persist `framing-calculations` (`materials`, `assumptions`, `pendingClaims`).

**OUTPUTS**  
`framing-calculations` / `calculations`.

**DOWNSTREAM DEPENDENCIES**  
- Stage 16: copies `materials`, `pendingClaims` into final takeoff; product-state uses calculations.

**HARD DEPENDENCIES**  
**DEPENDENCY:** Stage 16 `getPayload("calculations")`. Stage 15 does **not** read calculations.

---

## STAGE 15 — confidence

**PURPOSE TODAY**  
Compute confidence evaluations for objects/takeoff from validation + domain objects + evidence ids.

**INPUTS**  
Stages 6–13 (evidence + domains + validation). **FACT:** Does not read Stage 14 calculations.

**OPERATIONS**

1. `coordinateFramingConfidence({ pipelineRunId, scopeName, validation, domains…, evidenceIds, useExplicitFixture })`.  
   - **File:** `confidence/confidence-coordinator.ts`.  
   - **Consumed later:** Stage 16 requires a takeoff-targeted evaluation for summary labels / `confidenceEvaluationId`.

2. Persist `confidence` artifact.

**OUTPUTS**  
`confidence` / `confidence`.

**DOWNSTREAM DEPENDENCIES**  
- Stage 16: finds `target.kind === "takeoff"` evaluation; throws if missing; copies completion/labels into summary; product-state includes confidence.

**HARD DEPENDENCIES**  
**DEPENDENCY:** Stage 16 `getPayload("confidence")` and throws if no takeoff evaluation.  
**FACT:** Calculators do not import confidence.

---

## STAGE 16 — report

**PURPOSE TODAY**  
Assemble final framing takeoff artifact + package product-state companion.

**INPUTS**  
Stages 6–15 (domains, calculations, validation, confidence, evidence).

**OPERATIONS**

1. Require takeoff confidence evaluation (throw if absent).

2. `buildFramingPackageProductState(...)` → companion `framing-package-product-state`.  
   - **File:** package product-state builder (imported in stage file).

3. Build `final-framing-takeoff` payload: object id lists, `materials`, `pendingClaims`, review/validation ids, confidence id, summary counts/labels from confidence.

4. Persist primary takeoff artifact.

**OUTPUTS**  
`final-framing-takeoff` / report path used by CLI; companion package-product-state.

**DOWNSTREAM DEPENDENCIES**  
Outside pipeline: CLI/UI/export consumers of the takeoff artifact. No later pipeline stage.

**HARD DEPENDENCIES**  
**DEPENDENCY:** Requires artifacts from stages 6–15 as wired above. Missing confidence takeoff evaluation throws.

---

## Cross-stage concern index

Concern → where it currently occurs (no consolidation advice)

**Validation**  
→ Stage 13 (`coordinateFramingValidation`, domain validators); Stage 14 (`isQuantityBlocked`); Stage 15/16 consume issues/reviews/labels.

**Confidence**  
→ Stage 15 (`coordinateFramingConfidence`); Stage 16 summary + product-state.

**Identity / subject resolution / convergence**  
→ Stage 6 (geometry/semantic/existence subject keys); Stages 7–12 (`resolve*` modules, including cluster/convergence helpers inside resolvers).

**Relationships**  
→ Stage 6 (area–system bridge, construction semantic edges, opening adopt-onto-geometry); Stage 8 (wall↔opening backlinks); Stage 9 (opening↔header links); Stage 13 (parent/covered/associated validators); Stage 14 (opening parent segment gate in calculator).

**Assumptions**  
→ Stage 14 only in production path (`consultAssumptionRegistry` inside `calculateOpeningFraming`; assumption objects on calculations payload). Stage 13 does not pass assumptions payload to `validateAssumptions`.

**Material Claims**  
→ Stage 14 (`collectPendingClaims`, `admitMaterialClaimCandidate`, `deriveMaterialClaimStatus`, `claimStatus` on materials); Stage 16 copies `pendingClaims` into takeoff.

**Review-item creation**  
→ Stage 13 validators (`buildFailedBatch` / `createReviewItem`); Stage 16 lists `reviewItemIds`. Opening assumptions link to existing review item ids rather than minting a separate `origin: "assumption"` producer in `src/` (FACT from prior inspection).

**Provenance / resolution traces**  
→ Stages 7–12 resolvers write `resolutionTraces` / evidence ids on objects; Stage 14 `collectLineItemProvenance` for material lines; Stage 6 evidence records.

**Authority**  
→ Stage 5 dictionary governor / orientation; Stage 6 governed semantic compiler evidence + optional binding authority fields on objects; not read by Stage 14 calculators as a direct import (FACT: calc uses validation + resolved fields).

**Material calculation**  
→ Stage 14 domain calculators only.

**Aggregation / takeoff assembly**  
→ Stage 16 final takeoff + package product-state; Stage 14 concatenates calculator outputs without merge/dedupe (coordinator comment).

**Project Dictionary / Learning / ODL**  
→ Stage 5 (learning + dictionary companions/override); Stage 6 extraction + bridges consume dictionary when present.

**Drawing Compiler / geometry**  
→ Stage 5 compile; Stage 6 geometry/existence/binding evidence from compiled pages.

**UserDecision / replay**  
→ Stage 6 evidence replay branch; Stages 7–12 optional userDecision options into resolvers; fingerprint guard on replay.

**Pipeline orchestration / artifacts**  
→ All stages via `createFramingStageArtifact` + `PipelineRunner`; side-effect companions/overrides in stages 5, 6, 8, 9, 16.

---

## Notes for decision-makers (factual only)

1. **FACT:** `getPayload` throws `Required artifact from stage 'X' is missing` — that defines most hard stage-to-stage edges.  
2. **FACT:** Stage 4 is a hardcoded stub but Stage 6 still requires the artifact.  
3. **FACT:** Stage 15 does not feed Stage 14; Stage 16 requires Stage 15.  
4. **FACT:** Stage 14 is where Material Claims pending mint and assumption consult currently sit.  
5. **FACT:** Opening calculator currently skips when parent segment unresolved — that is calculator behavior consuming Stage 8 fields, not a separate pipeline stage.

**END OF INVENTORY.** No KEEP/REMOVE, no migration sequence, no redesign.
