# Reset Implementation Plan (D1–D24)

**Status:** Authoritative reset implementation plan (locked D1–D24).  
**Authority:** [`docs/PIPELINE_RESET_DECISIONS.md`](PIPELINE_RESET_DECISIONS.md) D1–D24 locked. Older planning docs ([`RESET_MIGRATION_PLAN.md`](RESET_MIGRATION_PLAN.md), [`MINIMUM_PRODUCTION_FLOW.md`](MINIMUM_PRODUCTION_FLOW.md)) are secondary where they conflict (e.g. they still KEEP Stages 7–12 resolvers as production stages — **D13–D19 remove those**).

---

## Verdict

Smallest coherent path: new thin framing orchestrator that (1) indexes the PDF, (2) runs today’s reader stack as one internal `READ THE PLANS` responsibility, (3) adapts reader-established facts into plain domain construction bags (absorbing buried Stage 7–12 reconciliation), (4) runs preserved Stage 14 formulas without Stage 13/claims/confidence, (5) writes a minimal temporary materials JSON. Evidence may remain **reader-internal transport** for Claude/bridges in the first reset; it is not a production existence/eligibility gate. Old 16-stage greenness is not a goal.

```mermaid
flowchart LR
  upload[UPLOAD_PDF_indexPlan]
  read[READ_THE_PLANS]
  calc[CALCULATE_DERIVE_ASSUME]
  out[TEMP_MATERIAL_OUTPUT]
  upload --> read --> calc --> out
```

---

## 1. Map current repository → four boxes

Classification key: **A** Upload · **B** Read · **C** Calculate/Derive/Assume · **D** Material taxonomy output · **E** Dev/debug/test · **F** Remove

| Component | Path | Job today | Class | Abstraction survives? | Logic survives? | Sever / destination |
|-----------|------|-----------|-------|----------------------|-----------------|---------------------|
| `indexPlan` / PlanIndex | [`src/pdf/indexPlan.ts`](src/pdf/indexPlan.ts) | PDF → page index | **A** | Yes | Yes | Keep as upload entry |
| Stage 1 `verifiedPlanSet` | [`createFramingStages.ts`](src/framing/stages/createFramingStages.ts) | Persist plan index as stage | **E/F** | No as production stage (D1) | Plan index concept | Dev artifact optional; not a stage |
| Page classification | [`resolvePageClassificationForPipeline.ts`](src/pdf/resolvePageClassificationForPipeline.ts), [`classifyPlanPages.ts`](src/pdf/classifyPlanPages.ts) | Page kinds/roles | **B** | Not as own stage (D2/D5) | Yes | Internal to `readPlans` |
| Reading order | [`buildPlanReadingOrder.ts`](src/pdf/buildPlanReadingOrder.ts) | Ordered pages | **B** | Not as own stage (D3) | Yes | Absorb into `readPlans` |
| Stage 4 buildingAssemblies | stub in `createFramingStages` | Hardcoded mock assemblies | **F** | No (D4) | No | Remove; stop feeding Claude |
| Project Learning | [`projectLearning/runProjectLearning.ts`](src/project-reading/projectLearning/runProjectLearning.ts) | Project defs from schedules/notes | **B** | Capability yes; stage no (D6) | Yes | Inside `readPlans` |
| Project Orientation / dictionary | [`buildOrientationDictionary.ts`](src/project-reading/buildOrientationDictionary.ts) | Project conventions | **B** | Impl not locked (D7) | Yes | Inside `readPlans` |
| `DictionaryGovernor.govern` | [`dictionaryGovernor.ts`](src/project-reading/dictionaryGovernor.ts) | Reader-integrity of defs | **B** | Abstraction not locked (D8) | Integrity checks yes | Inside `readPlans`; simplify later OK |
| Drawing Compiler | [`compileDrawingPage.ts`](src/compiler/compileDrawingPage.ts) | Geometry, marks, dims, schedules | **B** | Yes capability (D9) | Yes | Inside `readPlans`; audits = **E** |
| Claude extraction | [`runFramingExtractionPasses.ts`](src/framing/extract/runFramingExtractionPasses.ts), [`extractFramingEvidence.ts`](src/framing/prompts/extractFramingEvidence.ts) | Plan reading | **B** | Prompt/pass sequencing yes | Yes | Inside `readPlans` |
| Geometry/semantic Evidence bridges | [`src/framing/geometry/*`](src/framing/geometry) | Compiler → Evidence rows | **B→C adapter / F packaging** | Evidence packaging **F** as authority (D10) | Useful facts yes | Absorb into construction adapters; keep bridges only while adapters need them |
| Wall existence Evidence | `buildWallExistenceEvidenceFromCompiledPages` | Existence eligibility rows | **F** | No (D10) | Physical runs already from compiler | Do not gate takeoff on existence Evidence |
| `resolveWallFraming` | [`resolveWallFraming.ts`](src/framing/resolve/resolveWallFraming.ts) | Evidence → walls | **F stage**; buried merge **B/C** | Stage no (D13) | Type/schedule merge yes | → `interpretWalls` construction adapter |
| `resolveOpenings` | [`resolveOpenings.ts`](src/framing/resolve/resolveOpenings.ts) | Evidence → openings + ObjectId parents | **F stage** (D15) | Opening objects yes | Host-wall context yes | → `interpretOpenings`; attach host assembly, not ObjectId chain as authority |
| `applyWallOpeningBacklinks` | [`applyWallOpeningBacklinks.ts`](src/framing/resolve/applyWallOpeningBacklinks.ts) | Reverse `openingIds` | **F/E** | Not required (D15) | Optional debug only | Drop from calc path |
| `applyStructuralMemberAuthority` | [`structuralMemberAuthority.ts`](src/framing/resolve/structuralMemberAuthority.ts) | Dimensional/mark/qty/synonym rules | **C** (absorb) | Authority subsystem **F** (D16) | Rules yes | → structural interpret/calc prep |
| `linkOpeningHeaderRelationships` | [`linkOpeningHeaderRelationships.ts`](src/framing/resolve/linkOpeningHeaderRelationships.ts) | Tag → ObjectId links | **F** as gate (D16) | Reader relationship meaning **B** | Keep mark associations if reader has them | Not calc gate |
| Floor helpers | [`floorFragmentConsolidation.ts`](src/framing/resolve/floorFragmentConsolidation.ts), [`floorLayoutAuthority.ts`](src/framing/resolve/floorLayoutAuthority.ts), [`floorAreaMaterialCompatibility.ts`](src/framing/resolve/floorAreaMaterialCompatibility.ts) | Joist parse, MAX SPAN, fragments, spacing axis, slab | **B/C** | Resolver stage **F** (D18) | All listed rules yes | → floor interpret before calc |
| Roof resolve | [`resolveRoofFraming.ts`](src/framing/resolve/resolveRoofFraming.ts) | Evidence → roof objects | **F stage** (D19) | Plain roof structs OK | Family from reader + `isStickCommonRafterFramingType` | Family gate stays in calculator |
| Sheathing resolve | [`resolveSheathing.ts`](src/framing/resolve/resolveSheathing.ts) | Evidence → system/area + backlinks | **F stage** (D17) | Spec+coverage concepts yes | Application canonicalize yes | → sheathing interpret; no parentSystemId gate |
| Domain calculators | [`calculators/calculate*.ts`](src/framing/calculators) | Formulas | **C** | Orchestration contract no (D21) | Formulas + local guards yes | Strip validation/claim deps |
| Opening assumption factories + registry | [`createOpening*Assumption.ts`](src/framing/calculators), [`assumptionRegistry.ts`](src/framing/claims/assumptionRegistry.ts) | Three governed defaults | **C** | Registry API not locked (D21) | Three behaviors yes | Keep reachable from opening calc; leave registry in place first reset |
| `coordinateFramingCalculations` | [`calculation-coordinator.ts`](src/framing/calculate/calculation-coordinator.ts) | Fan-out + pendingClaims | **C** simplify | Pending path **F** (D22) | Fan-out yes | New thin coordinator without claims/validation |
| Stage 13 validation | [`validation-coordinator.ts`](src/framing/validators/validation-coordinator.ts) | Material permission | **F** (D20) | No centralized gate | Local calc guards already exist | Delete from production path |
| `isQuantityBlocked` | [`isQuantityBlocked.ts`](src/framing/calculate/isQuantityBlocked.ts) | Stage 13 suppress | **F** | No | — | Remove from calculators |
| Claims / PendingMaterialClaim | [`src/framing/claims/*`](src/framing/claims) | Candidacy/pending | **F** (D22) | Assumption consult only | Assumption consult only | Delete pending/candidacy from production |
| Stage 15 confidence | [`confidence/*`](src/framing/confidence) | Labels after calc | **F** (D23) | No | — | Remove from production |
| Stage 16 report | Stage 16 in `createFramingStages` | Package materials + lifecycle | **F** stage (D24); **D** requirement remains | Current envelope no | Materials content from calc | Replace with temp terminal output |
| `PipelineRunner` / ArtifactStore | [`PipelineRunner.ts`](src/core/pipeline/PipelineRunner.ts), [`ArtifactStore.ts`](src/core/artifacts/ArtifactStore.ts) | Stage runner + persistence | **E** (+ thin write for temp out) | 16-stage product path no | Artifact write useful | Keep mechanism; new orchestrator not forced through 16 orders |
| UI report loaders | [`src/ui/*`](src/ui) | Load `16-report` | **E** adapt later | Old contract breaks (D24) | — | Out of first-reset success criteria |
| Construction Brain markdown | [`knowledge/framing/*`](knowledge/framing) | Domain knowledge | **C** source | Yes | Yes | Unchanged |

---

## 2. Minimum new production path

**Not** four facades over stages 1–16. One framing entry that owns the North Star sequence.

### Runtime sequence

1. **UPLOAD:** `indexPlan(pdfPath)` → `PlanIndex` (+ optional fingerprint).
2. **READ THE PLANS** (`readFramingPlans`):
   - page classification
   - reading order
   - (no buildingAssemblies)
   - Project Learning → Orientation/dictionary → `DictionaryGovernor` integrity (flags as today)
   - Drawing Compiler over selected pages
   - Claude/extraction passes + compiler bridges (internal)
   - **Construction interpretation adapters** emit `FramingConstruction` (walls, openings, members, floors, roofs, sheathing) — this is the production reader boundary
3. **CALCULATE / DERIVE / ASSUME** (`calculateFramingTakeoff`):
   - domain calculators in current order: walls → openings(+walls) → structural → floor → roof → sheathing → fasteners if payload present
   - no validation payload
   - no pendingClaims
   - opening assumptions via existing factories/registry
4. **TEMP OUTPUT:** write minimal materials JSON (+ optional debug companions under **E**).

### Concrete owners

| Role | Proposal |
|------|----------|
| Entry | Extend [`src/app.ts`](src/app.ts) to call reset orchestrator for framing (keep CLI flags `--pdf/--live/--project`) |
| Orchestration | New [`src/framing/output/runFramingResetTakeoff.ts`](src/framing/output/runFramingResetTakeoff.ts) |
| Reader | New [`src/framing/output/readFramingPlans.ts`](src/framing/output/readFramingPlans.ts) composing existing Stage 2/3/5/6 functions |
| Reader output boundary | `FramingConstruction` schema module under `src/framing/output/` (or `schemas/construction-understanding.schema.ts`) |
| Calculation | New thin [`src/framing/output/calculateFramingTakeoff.ts`](src/framing/output/calculateFramingTakeoff.ts) wrapping preserved calculators |
| Calc output boundary | Array of temporary material rows (+ assumptions list for debug) |
| Temp final output | `artifacts/{projectId}/framing/reset-takeoff.json` (name locked in plan) |
| Debug/replay | Optional write of plan index, compiled pages, raw extraction under same project dir — **not** production authority |

Internal reader sequencing stays. No top-level production stages for classify/order/compile/extract.

---

## 3. Minimum reader → calculator contract

Start from **calculator-required fields**, not Evidence/resolver schemas.

### Walls ([`calculateWallFraming.ts`](src/framing/calculate/calculateWallFraming.ts))

| Need | Reader can establish? | Derive? | Old machinery to drop |
|------|----------------------|---------|------------------------|
| Segment `lengthFeet` | Yes (compiler dims / Claude) | — | Evidence length + Stage 7 converge |
| `studSpacingInches`, `studSize`, `plateCount` | Yes (notes, schedule/type, Learning) | — | semanticTypeKey Evidence inheritance chain (keep **merge meaning**) |
| Opening zones for net studs | Opening RO width + position on host segment | Net deduction is calc | parent ObjectId backlinks |

**Useful plain structs:** wall + segment with `assembly` + `lengthFeet` (strip `resolvedObjectBase` traces as authority).

### Openings ([`calculateOpeningFraming.ts`](src/framing/calculate/calculateOpeningFraming.ts))

| Need | Reader? | Derive/Assume? | Drop |
|------|---------|----------------|------|
| Category, quantity, RO dims | Yes | — | Identity clustering as stage |
| Host wall stud size/spacing | Yes via host relationship | — | `parentPhysicalRunKey` → Stage7 ObjectId → `parentObjectId` **as gate** |
| kingStudCount | Rarely explicit | Assume 2 | claimStatus |
| jackStudCount | Sometimes | No assume (skip if missing; no pending claim) | PendingMaterialClaim |
| Rough sill size | — | Assume = wall stud size | — |
| Cripple layout | — | Assume layout-continuation | — |

**Reset attachment:** opening carries `hostWall` construction snapshot (studSize, spacing, wood-stud eligibility) and optional position — not a mandatory canonical parent ObjectId.

### Structural members ([`calculateStructuralMembers.ts`](src/framing/calculate/calculateStructuralMembers.ts))

| Need | Reader? | Derive? | Drop |
|------|---------|---------|------|
| category, materialType, size, lengthFeet, quantity | Yes | qty=1 single-occurrence rule; dimensional size over mark; beam/header synonym | `supportedObjectIds` gate; Stage 13 dangling link block |
| plyCount if built-up | Yes / from size parse | Authority parse | Authority subsystem name |

### Sheathing ([`calculateSheathing.ts`](src/framing/calculate/calculateSheathing.ts))

| Need | Reader? | Derive? | Drop |
|------|---------|---------|------|
| application, panelType, thickness | Yes when stated | — | sheathing-system Evidence remint |
| `areaSquareFeet` | Sometimes | Geometry derivation = **post-reset** (D17) | parentSystemId / areaIds gates |

First reset: emit SF only when coverage+spec known; zeros elsewhere = honest gaps.

### Floor ([`calculateFloorFraming.ts`](src/framing/calculate/calculateFloorFraming.ts))

| Need | Reader? | Derive? | Drop |
|------|---------|---------|------|
| joistSpacing, size, type | Yes (+ combined-description parse) | Parse split | Evidence subjectKind path lock |
| joistLayoutLengthFeet (spacing axis) | Yes (40' bay) | spacing-axis authority recognition | parentSystemTag→Id gate |
| joistMemberLengthFeet | Yes / MAX SPAN recovery | Misassigned span recovery | — |
| slab exclusion | Yes | Compatibility rule | Eligibility architecture |
| Joist count / LF | — | `ceil(L×12/s)+1`; `count×memberLen` | — |

### Roof ([`calculateRoofFraming.ts`](src/framing/calculate/calculateRoofFraming.ts))

| Need | Reader? | Derive? | Drop |
|------|---------|---------|------|
| framingType / family | Yes (Beckstead truss known) | Stick-only path | Using family as existence gate |
| layout length, spacing, memberSize | When stick | `ceil…+1` | parentSystemId / planeIds gates |

Beckstead zero roof = **expected capability gap** (no truss calc), not reset failure.

### Fasteners

Preservable if `ConnectorsHardware` construction bag present; Stage 14 today never passes it — wire only if reader already produces fastener quantities; otherwise leave unwired (honest gap).

### Explicit non-goals

No universal Evidence replacement, resolved-object framework, relationship engine, or input-satisfaction engine. Domain-specific plain structs only.

---

## 4. Trace: reader → formula today vs reset

### Wall studs (pattern for all domains)

**Today:** reader/compiler/Claude → Evidence wall subjects → `resolveWallFraming` (cluster, canonical ID, semanticTypeKey inherit, traces) → Stage 13 quantityImpacts → `isQuantityBlocked` → `isQuantityInputResolved(traces)` → `calculateWallFraming`.

**Reset:** reader establishes wall run + assembly → `interpretWalls` merge type/schedule onto run → plain wall/segment → calculator null-checks fields → formula.

### Floor joists (Beckstead 31 / 527)

**Today:** reader knows crawl joist + 40' + 17' → Evidence system/area → relationship bridges mint parentSystemTag → `resolveFloorFraming` (+ fragment/MAX SPAN/spacing-axis) → parentSystemId/areaIds → calc often never reached on frozen M.4.

**Reset:** reader facts + floor interpret helpers (parse, MAX SPAN, fragments, spacing-axis, slab check) → floor area with layout/member length + assembly → `countRegularlySpacedJoists` / LF.

### Opening kings

**Today:** opening Evidence → resolve + ObjectId parent → validation → calc + assumption registry → claimStatus / pendingClaims → Stage 16 assumptionIds.

**Reset:** opening + host wall assembly → calc + same three assumptions → temp output `assumptionUsed` / short note; no pending claims.

### Structural LF

**Today:** member Evidence → resolve → authority post-pass → optional header ObjectId links → Stage 13 can block on dangling `supportedObjects.resolved` → calc.

**Reset:** member fields + authority rules as pure functions → calc; ignore optional opening links.

**Translation machinery that disappears:** Evidence existence/authority grades, canonical ObjectId convergence as gate, Stage 7–12 as production stages, Stage 13 `canCalculate`, claim candidacy, pendingClaims, Stage 15, Stage 16 packaging, wall existence Evidence gate, bidirectional backlink requirements.

---

## 5. Extraction / absorption checklist

| Capability | Current location | Future owner | Migration action |
|------------|------------------|--------------|------------------|
| Page classification | `plans/resolvePageClassificationForPipeline.ts` | B `readFramingPlans` | Call in place; drop stage wrapper |
| Reading order | `plans/buildPlanReadingOrder.ts` | B | Call in place |
| Project Learning | `projectLearning/*` | B | Call inside read; keep companions as **E** |
| Project Orientation / dictionary | `buildOrientationDictionary.ts` | B | Same |
| DictionaryGovernor integrity | `dictionaryGovernor.ts` | B | Keep `govern` behavior; OK to simplify later |
| Drawing Compiler | `drawing-compiler/compileDrawingPage.ts` | B | Same; audits **E** |
| Wall type/schedule merge | `resolveWallFraming` `resolveOneWall` | B interpretWalls | Extract merge without Evidence converge theater |
| Structural dimensional/mark/qty/synonym | `structuralMemberAuthority.ts` | C prep / interpretMembers | Keep pure functions; drop Authority product |
| Schedule mark vs dimensional size | same | C | Keep |
| Beam/header terminology | same | C | Keep |
| Explicit single-occurrence qty | same | C | Keep |
| Combined joist description parse | `floorFragmentConsolidation.applyCombinedJoistTypeSplit` | B/C floor interpret | Extract |
| MAX SPAN / member length recovery | `floorLayoutAuthority.ts` | B/C | Extract |
| Fragment/sibling reconciliation | `floorFragmentConsolidation.ts` | B/C | Extract |
| Spacing-axis recognition | `floorLayoutAuthority` / `hasJoistCountLayoutAxisAuthority` | C guard | Keep meaning; drop Evidence-only authority labeling if possible |
| Slab vs wood | `floorAreaMaterialCompatibility.ts` | C | Keep |
| Roof framing-family | reader `framingType` + `isStickCommonRafterFramingType` | B + C | Keep calculator family guard |
| Opening assumptions (3) | assumption factories + registry | C opening calc | Keep wired; no new assumption architecture |
| D21 formulas | `calculate*.ts` + `netStudDeduction.ts` | C | Keep; strip Stage 13/claim deps |
| Calculator local guards | same files | C | Keep required-input/math/family; replace trace-resolution checks with field null checks |

**Do not delete** a resolver file until its checklist rows are moved or re-exported from the new interpret modules.

---

## 6. Deletion plan

### A. DELETE ENTIRELY (from production path; delete modules when unused)

- Stage 4 buildingAssemblies stub and Claude assemblies injection
- Stage 13 production wiring + `isQuantityBlocked` usage
- Stage 15 confidence coordinator from production
- Stage 16 report stage + required ConfidenceEvaluation
- `PendingMaterialClaim` / `collectPendingClaims` / candidacy admission from production calc path
- Wall existence Evidence as eligibility gate
- Opening↔header ObjectId linking as calc prerequisite
- Bidirectional backlink requirements (`openingIds`, `system.areaIds`, etc.) as gates

### B. REMOVE FROM PRODUCTION BUT RETAIN TEMPORARILY FOR DEV/REPLAY

- `createFramingStages` 16-stage array (audit/scripts may keep calling until rewritten)
- Artifact companions: compiler audit, extraction budget, relationship-emission audit, package-product-state
- Evidence snapshot writes
- Frozen Beckstead artifact dirs under `artifacts/` (read-only baseline)
- UI loaders of old report (break OK; fix later if needed)

### C. EXTRACT USEFUL LOGIC, THEN DELETE SURROUNDING ABSTRACTION

- Stages 7–12 resolvers → interpret adapters + delete stage wrappers
- Stage 6 Evidence packaging excess → keep only bridges adapters still need
- `coordinateFramingCalculations` claim post-processing → thin fan-out
- `resolvedObjectBase` / resolutionTraces as calc authority → optional debug fields only

### D. KEEP BUT SIMPLIFY

- Domain calculators (D21 list)
- Assumption registry consult for three opening cases
- Reader stack (classify → learn → compile → extract)
- PipelineRunner/ArtifactStore as generic writers
- Material line core fields for temp output (description, qty, unit, category)

---

## 7. Assumptions in the first reset

**Do not** design a new assumption architecture.

| Item | Detail |
|------|--------|
| Where | Factories under `calculators/createOpening*.ts`; consult via [`assumptionRegistry.ts`](src/framing/claims/assumptionRegistry.ts); applied inside [`calculateOpeningFraming.ts`](src/framing/calculate/calculateOpeningFraming.ts) |
| Depends on today | Eligible opening + host wood-stud wall fields; registry; optional user-decision lifecycle |
| Simplest reachability | Keep calling `calculateOpeningFraming` from reset coordinator with walls+openings; leave registry where it is; stop emitting `pendingClaims`; stop requiring claimStatus |
| Disclosure | On temp material rows: `assumptionUsed: true` + short `assumptionNote` (e.g. `kingStudCount=2`) when factories fire; optional parallel `assumptions[]` debug array. No Stage 16 ID join |

No new assumption domains.

---

## 8. Review / validation in the first reset

- Reader integrity: keep DictionaryGovernor / learning validation inside **B**.
- Calculator guards: keep local required-input / numeric / family checks; remove Stage 13 path.
- Human review: **not** a material permission gate; **no** generalized review architecture required for first reset.
- **Explicit:** first reset operates **without** a replacement Stage 13 and without review as a production stage.

---

## 9. Temporary terminal output (D24)

Smallest useful schema (`reset-takeoff.json`):

```ts
{
  schemaVersion: 1,
  projectId, pdfPath, createdAt,
  materials: [{
    description, quantity, unit, category?,
    domain?: "wall"|"opening"|"structural"|"floor"|"roof"|"sheathing"|"fastener",
    quantityKey?: string,           // debug
    assumptionUsed?: boolean,
    assumptionNote?: string,
    debugSourceIds?: string[]       // cheap if already on hand
  }],
  assumptions?: [{ id?, summary, quantityKeys? }],  // debug only
  meta?: { wallCount?, openingCount?, ... }         // optional counts, not completeness
}
```

**Not included:** taxonomy accounting, stock/waste, confidence, pendingClaims, claimStatus, Stage 16 summaries, domain inventories as completeness, generalized run status.

---

## 10. Test strategy

| Class | Examples | Action |
|-------|----------|--------|
| KEEP | `tests/core/*calculator*.test.ts`, net-deduction, floor joist math, structural authority unit tests, assumption schema/factory tests, drawing-compiler unit tests that prove geometry/marks, project-learning unit tests | Preserve; point at extracted helpers if moved |
| MODIFY | Calculator tests that assert `isQuantityBlocked` / pendingClaims / claimStatus; opening tests requiring ObjectId parent only | Drop gate assertions; feed plain construction |
| REMOVE | Confidence coordinator tests as production requirement; pending candidacy ladder; Stage 13-as-permission suites; Stage 16 confidence-required schema tests | Delete or quarantine |
| REPLACE LATER | Full `tests/pipeline/framing.*.test.ts` 16-stage green suite | Do not require green during reset |

**Minimum new tests:**

1. Unit: `readFramingPlans` returns `FramingConstruction` from fixture evidence/compiler fixtures (no live Claude).
2. Unit: each interpret adapter preserves checklist behaviors (floor 40/16/17 → ready for 31/527; structural mark-vs-size; slab skip).
3. Unit: `calculateFramingTakeoff` on fixture construction → expected materials; assumptions flagged; no validation arg.
4. Replay: optional frozen reader artifact → adapters → calc (no paid API).
5. One wiring test: orchestrator writes `reset-takeoff.json`.
6. Milestone: full live Beckstead once (section 12).

Avoid paid Claude during phases 1–5 except targeted AI boundary tests already required for reader changes.

---

## 11. Implementation order (6 phases)

### Phase 0 — Plan doc lock
- Write `docs/RESET_IMPLEMENTATION_PLAN.md` (this document).
- Exit: plan approved; no code yet.

### Phase 1 — Construction boundary + thin orchestrator skeleton
- **Objective:** Compilable four-box shell with empty/fixture construction → temp output.
- **Create:** `src/framing/output/*` (`runFramingResetTakeoff`, `readFramingPlans` stub, `FramingConstruction` schema, `writeResetTakeoff`, `calculateFramingTakeoff` stub).
- **Change:** `app.ts` framing path calls reset orchestrator (feature flag or replace).
- **Remove:** nothing mandatory yet.
- **Tests:** schema + write artifact unit test.
- **Exit:** CLI with mock/fixture construction writes `reset-takeoff.json`.

### Phase 2 — Wire READ THE PLANS
- **Objective:** Real classify → order → learning/dictionary/compiler → extraction into reset reader (no Stage 4).
- **Change:** Move calls from Stage 2/3/5/6 into `readFramingPlans`; stop requiring buildingAssemblies.
- **Create:** debug writers for compiled pages / raw extraction (**E**).
- **Remove from production path:** Stage 1–6 as mandatory PipelineRunner product path for framing CLI.
- **Tests:** fixture/replay reader tests; no full Beckstead yet.
- **Exit:** Beckstead PDF can produce reader debug artifacts without Stages 7–16.

### Phase 3 — Interpret adapters + calculator reconnect
- **Objective:** Construction bags feed preserved formulas; buried logic extracted.
- **Create/extract:** `interpretWalls`, `interpretOpenings`, `interpretStructuralMembers`, `interpretFloorFraming`, `interpretRoofFraming`, `interpretSheathing` from resolver helpers.
- **Change:** Calculators — remove `isQuantityBlocked`; replace trace-gated `isQuantityInputResolved` with field checks; opening host via construction snapshot; strip pendingClaims from opening result / coordinator.
- **Remove:** validation arg from production calc path; claim post-process in coordinator.
- **Tests:** KEEP calculator fixtures + MODIFY parent/validation cases; floor 31/527 fixture through interpret→calc.
- **Exit:** Fixture construction (including Beckstead-like floor) emits materials without Stage 13/15/16.

### Phase 4 — Assumptions disclosure + temp output finalize
- **Objective:** Three opening assumptions reachable; temp output shows assumption use.
- **Change:** Keep registry; map assumptions into temp rows.
- **Remove:** claimStatus as required material field for temp schema.
- **Tests:** opening assumption unit tests still pass via calc path.
- **Exit:** Documented temp schema stable.

### Phase 5 — Bypass/delete obsolete production machinery
- **Objective:** Framing production no longer depends on Stages 7–16, pending claims, confidence, report.
- **Change:** Quarantine or delete dead production imports; leave audit `createFramingStages` only if scripts need until updated; update scripts that assumed `16-report.json` to read `reset-takeoff.json` only as needed for Beckstead run tooling.
- **Tests:** New reset suite green; old 16-stage suite not required green.
- **Exit:** `npm test` focused reset set green; build green.

### Phase 6 — Full Beckstead milestone
- **Objective:** Section 12 success criteria.
- **Run:** live Beckstead once; capture baseline artifacts/metrics.
- **Exit:** Baseline recorded; capability gaps listed honestly (not fixed in this phase).

---

## 12. First post-reset Beckstead success

**Success means:**

- Beckstead PDF enters reset path
- Reader capabilities run (classification, learning/compiler as flagged, extraction)
- Construction reaches calculators without Stage 13/Evidence eligibility/claim lifecycle
- Preserved formulas run wherever genuine inputs exist (expect walls; expect floor if interpret preserves 40'/16"/17'; openings/members/sheathing if inputs present; roof stick-only likely zero)
- Three opening assumptions reachable when openings eligible
- `reset-takeoff.json` produced
- No Stage 13 permission, pendingClaims, Stage 15, or Stage 16 required
- Zeros explainable as missing reader/domain/calculator capability

**Capture:** materials JSON; optional reader debug dumps; counts of materials by domain; list of domains with zero output + one-line reason; assumption notes; compare qualitatively to frozen M.4 (52 wall lines) as baseline reference, not pass/fail completeness.

---

## 13. Risks / capability-loss check

| Capability | Location | Why it matters | Preserve how | Test |
|------------|----------|----------------|--------------|------|
| Wall type/schedule → assembly | `resolveWallFraming` merge | Stud size/spacing/plates | Extract into interpretWalls | Wall fixture with SW mark |
| Floor MAX SPAN recovery | `floorLayoutAuthority` | 17' member length | Extract before deleting Stage 11 | Fixture misassigned span |
| Floor spacing-axis 40' | same + calc | 31 joists | Keep layout length field + authority meaning | 40/16 → 31 |
| Combined joist parse | `floorFragmentConsolidation` | Type+size | Extract | `"11 7/8\" TJI 210"` fixture |
| Slab exclusion | `floorAreaMaterialCompatibility` | No false wood joists | Keep in interpret/calc | Slab fixture → zero joists |
| Structural mark vs size | `structuralMemberAuthority` | Correct size/LF | Keep pure functions | Mark-as-size fixture |
| Single-occurrence qty | same | LF without explicit qty | Keep | Length-only member fixture |
| Opening host context | Stage 8 mapping | Kings/sills/cripples/net studs | Host snapshot on opening | Opening+wall fixture without ObjectId theater |
| Three opening assumptions | factories + registry | Governed defaults | Keep wired | Existing assumption tests |
| Stick vs truss roof | `isStickCommonRafterFramingType` | No false rafters on Beckstead truss | Keep calc guard | Truss framingType → zero common rafters |
| DictionaryGovernor integrity | `dictionaryGovernor.ts` | Bad defs don’t poison reader | Keep in readPlans | Existing governor tests |
| Net stud deduction | `netStudDeduction.ts` | Correct stud counts | Keep | Existing net-deduction tests |
| Project Learning defs | `projectLearning/*` | Project-specific meaning | Keep in readPlans | Learning unit tests |

**Not a risk:** old 16-stage pipeline breaks.

---

## 14. File-by-file change map (major)

| File / Module | Current Job | Reset Action | Future Owner | Phase | Notes |
|---------------|-------------|--------------|--------------|-------|-------|
| `docs/RESET_IMPLEMENTATION_PLAN.md` | missing | **CREATE** | docs | 0 | This plan |
| `src/framing/output/runFramingResetTakeoff.ts` | — | **CREATE** | orchestrator | 1 | Entry |
| `src/framing/output/readFramingPlans.ts` | — | **CREATE** | B | 1–2 | Compose reader |
| `src/framing/output/framingConstruction.schema.ts` | — | **CREATE** | B→C boundary | 1 | Plain structs |
| `src/framing/output/interpret*.ts` | — | **CREATE** | B/C | 3 | From resolvers |
| `src/framing/output/calculateFramingTakeoff.ts` | — | **CREATE** | C | 1/3 | Thin fan-out |
| `src/framing/output/writeResetTakeoff.ts` | — | **CREATE** | D temp | 1 | Temp JSON |
| `src/app.ts` | 16-stage runner | **MODIFY** | A entry | 1 | Call reset |
| `src/framing/stages/createFramingStages.ts` | 16 stages | **BYPASS** / later delete | E audit only | 5 | Not production |
| `src/pdf/indexPlan.ts` | Upload | **KEEP** | A | — | |
| `src/pdf/resolvePageClassificationForPipeline.ts` | Stage 2 | **KEEP** call from read | B | 2 | |
| `src/pdf/buildPlanReadingOrder.ts` | Stage 3 | **KEEP** | B | 2 | |
| Stage 4 stub | assemblies | **DELETE** from path | F | 2 | |
| `project-interpreter/**` | Learning/dict | **KEEP** | B | 2 | |
| `drawing-compiler/**` | Compile | **KEEP** | B | 2 | |
| `extraction/runFramingExtractionPasses.ts` | Claude | **KEEP** | B | 2 | Drop assemblies dep |
| `geometry/*` Evidence bridges | Package Evidence | **SIMPLIFY**/extract | B adapter | 3 | |
| `resolvers/resolveWallFraming.ts` | Stage 7 | **EXTRACT→DELETE stage** | interpretWalls | 3/5 | |
| `resolvers/resolveOpenings.ts` | Stage 8 | **EXTRACT→DELETE stage** | interpretOpenings | 3/5 | |
| `resolvers/applyWallOpeningBacklinks.ts` | Backlinks | **REMOVE** from prod | E optional | 5 | |
| `resolvers/resolveStructuralMembers.ts` | Stage 9 | **EXTRACT→DELETE stage** | interpretMembers | 3/5 | |
| `resolvers/structuralMemberAuthority.ts` | Authority | **KEEP logic / DROP product** | C | 3 | |
| `resolvers/linkOpeningHeaderRelationships.ts` | ObjectId links | **REMOVE** as gate | F/E | 5 | |
| `resolvers/resolveSheathing.ts` | Stage 10 | **EXTRACT→DELETE stage** | interpretSheathing | 3/5 | |
| `resolvers/resolveFloorFraming.ts` + floor helpers | Stage 11 | **EXTRACT→DELETE stage** | interpretFloor | 3/5 | |
| `resolvers/resolveRoofFraming.ts` | Stage 12 | **EXTRACT→DELETE stage** | interpretRoof | 3/5 | |
| `calculators/calculate*.ts` | Formulas | **MODIFY** strip gates | C | 3 | D21 preserve |
| `calculators/calculation-coordinator.ts` | +claims | **REPLACE** by reset calc | C | 3 | |
| `calculators/isQuantityBlocked.ts` | Stage 13 gate | **DELETE** from prod | F | 3 | |
| `claims/collectPendingClaims.ts` etc. | Pending | **REMOVE** from prod | F | 3–5 | D22 |
| `claims/assumptionRegistry.ts` | Assumptions | **KEEP** | C | 4 | |
| `validators/validation-coordinator.ts` | Stage 13 | **REMOVE** from prod | F | 5 | D20 |
| `confidence/*` | Stage 15 | **REMOVE** from prod | F | 5 | D23 |
| Stage 16 report assembly | Terminal | **REMOVE** | F; temp D | 5 | D24 |
| `schemas/material.schema.ts` | Line items | **KEEP**/simplify for temp | C/D | 4 | |
| `core/pipeline/PipelineRunner.ts` | Stages | **RETAIN** for E | E | — | |
| `src/ui/*` report loaders | Old report | **BYPASS** first reset | E later | 6 | Break OK |
| Calculator/authority/floor unit tests | Prove math | **KEEP/MODIFY** | tests | 3 | |
| Pipeline 16-stage tests | Old arch | **REMOVE requirement** | — | 5 | |
| New `tests/framing/reset/*` | — | **CREATE** | tests | 1–5 | |

---

## 15. Questions / decisions that block implementation

**NO ARCHITECTURAL BLOCKERS — READY FOR IMPLEMENTATION APPROVAL.**

Defaults locked by this plan (not reopenings of D1–D24):

- Evidence may remain reader-internal transport in the first reset; production boundary is `FramingConstruction` → calculators.
- Temporary output file: `reset-takeoff.json` as specified in §9.
- First-reset success is CLI + artifacts, not UI report compatibility.
- Fasteners stay unwired unless reader already supplies counts.
- Old `createFramingStages` may linger for audit scripts until Phase 5 cleanup; framing CLI production path does not use it.
