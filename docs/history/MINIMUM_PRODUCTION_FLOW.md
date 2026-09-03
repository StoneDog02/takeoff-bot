# Minimum Production Flow

**Status:** FINAL PRODUCTION-FLOW PLANNING PASS — no implementation yet.  
**Authority:** Locked product/architecture decisions supersede conflicting text in `RESET_ARCHITECTURE_AUDIT.md` and any material-specific slice plans.  
**Related:** [`docs/RESET_MIGRATION_PLAN.md`](RESET_MIGRATION_PLAN.md) (KEEP/ABSORB/DEV-ONLY/REMOVE inventory). This document is the **executable blueprint** for the architecture **reset** itself.

**Critical framing of this document**

- We are **not** organizing the next Build phase around one material family (e.g. wall sheathing).
- The next implementation phase **accomplishes the architecture reset** across the framing engine.
- Material-family improvements (L×H sheathing, opening-host inference, new assumptions, truss logic, etc.) are **post-reset takeoff capability work**, unless a capability literally cannot survive the reset without a minimal adaptation.
- The reset should **expose** takeoff deficiencies honestly — not hide them by fixing every family at once.

---

## 1. Minimum production information flow

Responsibilities — **not** a requirement to create one class/stage/service per arrow.

```text
PLAN PDFs
  → READ THE PLANS
       ODL / OCR / Claude / Drawing Compiler (as appropriate)
       Project Dictionary / Learning (project-local meaning)

  → UNDERSTAND THE PROJECT / HOUSE (domain-owned)
       walls, openings, floors, roofs, structural members, sheathing, …
       each domain resolves its own objects from reader output

  → FOR EACH DOMAIN: DETERMINE MATERIAL REQUIREMENTS
       domain logic + Construction Brain (deterministic TS)
       house decides what exists — materials do not claim existence

  → SATISFY CALCULATION INPUTS (domain-local precedence)
       A. plan fact
       B. deterministic derivation
       C. governed assumption (verify the INPUT)
       D. exceptional Not Determinable

  → CALCULATE MATERIAL QUANTITIES
       domain calculators

  → VALIDATE OUR READING / INPUTS / MATH / OUTPUT INTEGRITY
       at natural owners — not a permission-to-calculate bureaucracy

  → PRODUCE CLEAN CONTRACTOR TAKEOFF
       construction-language materials + assumed-input reviews
```

**Separately (not on the permission path)**

```text
END: Material Taxonomy answer key → CALCULATED | NOT APPLICABLE | NOT DETERMINABLE
     (taxonomy content designed later; not part of emit)

ALONGSIDE: Developer / observability lane
     artifacts, replay, provenance, diagnostics, confidence, traces, audits
     MUST NOT decide whether a material emits
```

### Reader vs construction knowledge (locked)

| Stack | Job |
|-------|-----|
| ODL / OCR / Claude / Drawing Compiler / Dictionary | What do the plans say/show? |
| Domain TS + Construction Brain | What framing materials does this construction require, and how much? |

No `ConstructionBrainService`. Claude is not the estimator.

### Relationships (locked)

Relationships are **tools for calculation**, not goals of the data model.

Establish or retain a relationship only when necessary to:

- correctly interpret plan information;
- deterministically derive an input required by a material calculation;
- prevent duplicate material counting; or
- satisfy another concrete takeoff-correctness requirement.

A construction object does **not** need a complete/canonical relationship graph to exist or calculate. Resolving `parentWallId` (etc.) is not itself the product — knowing the surrounding construction information the calculator actually needs is.

### Forbidden replacement abstractions

Do **not** introduce: Unified Material Claim Framework, Universal Resolution Engine, Universal Input Satisfaction Layer, Unified Provenance Authority Layer, ConstructionBrainService, or “taxonomy-as-applicability-engine.”

---

## 2. Domain / material ownership

| Domain | Interpretation owner | Calculation owner | Shared helpers OK |
|--------|---------------------|-------------------|-------------------|
| Walls | `resolveWallFraming` | `calculateWallFraming` | geometry length utils, assumption registry library |
| Openings | `resolveOpenings` | `calculateOpeningFraming` | eligibility module (no claim vocabulary), assumption registry |
| Structural members | `resolveStructuralMembers` | `calculateStructuralMembers` | schedule-mark helpers |
| Floor | `resolveFloorFraming` (+ local fragment helpers) | `calculateFloorFraming` | — |
| Roof | `resolveRoofFraming` | `calculateRoofFraming` | — |
| Sheathing | `resolveSheathing` | `calculateSheathing` | — |
| Blocking / connectors / hardware / fasteners | schemas exist; pipelines largely unwired | `calculateFasteners` only when payload present | leave unwired as capability gap post-reset |

**Input completion is domain-owned.** Shared assumption registry is a **library**, not an authority layer all domains must “pass through” to earn inputs.

**Orchestration:** `PipelineRunner` + thin `coordinateFramingCalculations` may call domains in sequence. That is wiring, not a universal resolver.

---

## 3. Required vs unnecessary relationships

### Generally required when they serve calc/interpretation

| Relationship | Why it can be required |
|--------------|------------------------|
| Wall segment → parent wall | Length/assembly inputs for studs/plates |
| Opening → host wall/segment | Stud size, spacing, eligibility for opening framing — **only if** those inputs are needed and not otherwise available |
| Floor area → floor system | Joist type/size/spacing ownership |
| Sheathing area → sheathing system | Panel identity for material line |
| Header SM ↔ opening | Avoid double-count / associate header LF when both paths exist |

### Not required as existence/calc gates

| Pattern | Why unnecessary as gate |
|---------|-------------------------|
| Complete coveredObjectIds graph before any sheathing SF | Calc needs coverage + panel identity, not a finished coverage graph |
| Authority grade on bindings before emit | Dev/reader quality, not permission |
| Canonical subject convergence completeness before calc | Prefer domain-local identity; don’t invent new fan-in frameworks |
| Evidence lineage completeness before calc | Facts matter; ceremony does not |
| Schedule definition objects “admitted” as material claims | Schedule defs are definitions; occurrences calculate |

**Test for any relationship in production architecture:** If removing it would not change a material quantity, prevent a duplicate, or impair a necessary derivation/interpretation, it should not gate production.

---

## 4. Intermediate-object reapplication

Every major intermediate concept must reapply for its job under the minimum flow.

| Current object / concept | Reapply verdict | Role after reset |
|--------------------------|-----------------|------------------|
| Evidence | **KEEP (slim)** | Reader→domain fact transport; not emit permission |
| Compiled drawing pages | **KEEP** | Geometry / marks / compiler output |
| Project Dictionary | **KEEP (minimum job)** | Project-local symbol → meaning |
| Domain resolved objects (walls, openings, …) | **KEEP** | Domain understanding |
| Resolution traces | **DEV-ONLY** on contractor path; OK on objects for replay | Debug |
| Validation issues (`canCalculate`) | **REMOVE as calc gate**; keep integrity/conflict uses | Reading/math integrity at natural owners |
| Review items | **KEEP**, reshape | Assumed-input verify + rare ND + interpretation conflicts |
| Assumptions | **KEEP**, relocate out of claims packaging | Governed input completion |
| Material claim candidacy / pendingClaims / claimStatus | **REMOVE** from production | Optional DEV diagnostics only during transition |
| Authority grades | **DEV-ONLY** | Never emit prerequisite |
| Confidence evaluations | **DEV-ONLY** / soft label | Never emit prerequisite |
| Package-product-state enums | **DEV-ONLY** | Scorecards |
| Companion audits | **DEV-ONLY** | Engineering |
| Artifact envelopes / pipeline run ids | **KEEP** | Replay |
| Material Taxonomy | **END-CHECK only** (later) | Not in emit path |
| `buildingAssemblies` stub stage | **REMOVE** | Not real production understanding |
| Stage 13 monolithic validation | **REMOVE as architecture** | Redistribute integrity |
| Stage 15 confidence | **DEV-ONLY companion** | — |
| Stage 16 report | **KEEP** takeoff assembly; strip lifecycle jargon from contractor surface | — |

---

## 5. RESET WORK vs POST-RESET TAKEOFF CAPABILITY WORK

### A. RESET WORK

Changes necessary so the **production engine itself** follows the locked architecture.

Confirmed by code inspection (representative):

| Reset item | Current evidence |
|------------|------------------|
| Calculators must not depend on Material Claim existence/candidacy | `coordinateFramingCalculations` → `collectPendingClaims` / `admitMaterialClaimCandidate` / `deriveMaterialClaimStatus` |
| Stage 13 incompleteness must not grant/deny permission to calculate | `isQuantityBlocked` reads `canCalculate: false` in all major calculators |
| Assumptions reachable from domain calculators after derivation, before ND | Registry exists but openings often `continue` before consult; registry collocation under `claims/` |
| Relationships must not be arbitrary existence/calc gates | e.g. opening calc skips entire opening when `parentObjectId` null — even when dims exist |
| Domain calculators own required inputs | Already mostly true locally; dual-gated by validation |
| Absorb useful claim/validation/authority behavior into natural owners | eligibility, registry, review fan-out maps |
| Dev observability separated from production authority | confidence, package state, authority grades, companion audits |
| Aggregation/reporting without claim lifecycle | report carries `pendingClaims`, `claimStatus`, package enums |
| Pipeline orchestration reflects minimum flow | 16 stages include stub assemblies, validation permission wall, confidence gate labels |

**Reset success means:** failures that remain are reader / derivation / assumption-coverage / calculator / true-ND gaps — **not** permission machinery.

### B. POST-RESET TAKEOFF CAPABILITY WORK

Needed for a *complete* takeoff eventually — **not** required to establish the minimum architecture.

Examples (explicitly **out of reset** unless survival requires a tiny adaptation):

- Wall sheathing L×H coverage derivation  
- Governed 8' wall-height assumption product policy  
- Opening-host geometry inference improvements  
- Expanding assumption registry beyond existing opening defaults  
- Roof/truss package logic  
- Connector/hardware/blocking wiring  
- Floor member-length / LF derivations beyond what already works  
- New material formulas / applicability rules  
- Material Taxonomy content + end completeness check implementation  
- Final contractor review UX polish  

**Discipline:** If wall sheathing cannot calculate after reset because the domain lacks L×H derivation, that is an acceptable **post-reset backlog item (category 2/4)**. It is **not** acceptable if sheathing (or any family) remains absent because claims, Stage 13 permission, irrelevant relationships, authority/confidence, or unreachable assumptions blocked emit.

---

## 6. Concrete end-to-end RESET migration sequence

Organize by **architectural dependencies**, not material families.  
Prefer deletion/absorption. Preserve existing legitimate quantities wherever possible (**behavior-preserving** unless noted).

Baseline freeze (pre-step): capture Beckstead restore metrics (54 materials, 0 assumptions, openings/sheathing/roof 0 lines, etc.) under `artifacts/architecture-audit/` — documentation only.

---

### R0 — Freeze baseline & define success metrics

| | |
|--|--|
| **WHAT** | Record pre-reset Beckstead baseline; define reset completion checklist (§10). |
| **WHY** | Honest before/after; detect regressions vs architecture wins. |
| **FILES** | `artifacts/architecture-audit/` note only. |
| **PRESERVE** | Everything. |
| **REMOVABLE AFTER** | N/A. |
| **TESTS** | None (metrics). |
| **OUTPUT CHANGE** | No. |
| **TEMP KEEP** | All current machinery. |
| **EXIT** | Baseline numbers written and agreed. |

---

### R1 — Decouple calculators from validation incompleteness permission

| | |
|--|--|
| **WHAT** | Domain calculators stop treating Stage 13 `canCalculate: false` (via `isQuantityBlocked`) as the primary “missing field” veto. Calculators use their own required-input checks **after** fact/derivation/assumption attempts already present in that calculator. Retain blocks only for true integrity failures if any are expressed that way (or move integrity earlier). |
| **WHY** | Missing properties are inputs to satisfy, not permission denied. |
| **FILES** | `calculators/isQuantityBlocked.ts` (narrow or retire); `calculateWallFraming.ts`, `calculateOpeningFraming.ts`, `calculateFloorFraming.ts`, `calculateRoofFraming.ts`, `calculateStructuralMembers.ts`, `calculateSheathing.ts`, `calculateFasteners.ts`; observability readiness mirrors if they duplicate the gate. |
| **PRESERVE** | Calculator formulas; Brain forbidden inventions; existing emits when inputs already present. |
| **REMOVABLE AFTER** | Dependence of Stage 14 on Stage 13 for incompleteness. Stage 13 can remain temporarily as review minting only. |
| **TESTS** | Per-calculator: fabricate missing-property validation issues with `canCalculate: false`; when local inputs are present, materials still emit. Existing positive calculator tests stay green. |
| **OUTPUT CHANGE** | May increase materials **only** where objects already had inputs but validation starved emit — that is an architecture win, not a new formula. |
| **TEMP KEEP** | Stage 13 validators still run; claims still mint pending from validation (until R3). |
| **EXIT** | No calculator imports incompleteness permission as hard gate; wall/WB/crawl baseline quantities do not regress. |

---

### R2 — Domain-local assumption reachability (ordering + packaging)

| | |
|--|--|
| **WHAT** | (1) Move assumption registry + lifecycle helpers out of `claims/` packaging into an assumptions module. (2) Ensure each calculator that already has registry consults can reach them **before** declaring ND — fix ordering bugs that skip consult (e.g. opening `continue` on missing parent **before** any attempt to obtain needed surrounding inputs by derivation if already implemented, or at least don’t invent a new derivation here). (3) Do **not** expand registry with new product defaults (no 8' wall height in reset). |
| **WHY** | Assumptions keep takeoff moving; must be reachable. Expanding defaults is post-reset. |
| **FILES** | `claims/assumptionRegistry.ts` → e.g. `assumptions/assumptionRegistry.ts`; `applyAssumptionLifecycle.ts`; callers in `calculateOpeningFraming.ts`, `applyUserDecisions.ts`; update imports/tests. |
| **PRESERVE** | Existing king/sill/cripple defaults; closed registry discipline. |
| **REMOVABLE AFTER** | Claims packaging ownership of assumptions. |
| **TESTS** | Rewrite authority-ladder tests to registry tests; opening assumption unit tests; UserDecision confirm/replace. |
| **OUTPUT CHANGE** | Behavior-preserving except where consult was previously unreachable **with existing registry entries** (architecture win). |
| **TEMP KEEP** | Claims candidacy still present until R3. |
| **EXIT** | Registry not under claims; opening calculator can consult when surrounding inputs are available; Beckstead may still show 0 assumptions if openings still lack hosts — that is then a **derivation gap (B)**, not unreachable registry. |

---

### R3 — Remove Material Claims from the production path

| | |
|--|--|
| **WHAT** | Salvage: opening eligibility module; thin “takeoff quantity key” set for review; schedule_definition non-emit rules in openings domain; assumption registry already moved. Remove: `admitMaterialClaimCandidate` production use, `collectPendingClaims` horizontal mint, `deriveMaterialClaimStatus` on materials, contractor `pendingClaims` / `claimStatus` as takeoff model. Introduce minimal domain **Not Determinable** recording only if needed to replace pending rows without a new claim framework (e.g. skip emit + exceptional review). |
| **WHY** | House decides existence; claims are permission bureaucracy. |
| **FILES** | `claims/**` (delete or hollow); `calculation-coordinator.ts`; `schemas/claim-outcome.schema.ts`, `material.schema.ts`, `framing-takeoff.schema.ts`, `framing-artifacts.schema.ts`; report stage; `projectReviewRootCauses.ts`; scripts/tests tied to M1/M2 pending counts. |
| **PRESERVE** | Eligibility; assumptions; UserDecision; calculator required-input logic (already local). |
| **REMOVABLE AFTER** | Entire claims product surface. |
| **TESTS** | Delete/rewrite candidacy/authority tests; coordinator tests without pendingClaims; review queue still surfaces assumed-input reviews. |
| **OUTPUT CHANGE** | Prefer behavior-preserving material quantities; pendingClaims disappear or become DEV-only. |
| **TEMP KEEP** | Stage 13 may still emit many review items until R4. |
| **EXIT** | Production calc/report path has zero candidacy/pending mint imports; materials still emit for pre-reset capable families. |

---

### R4 — Collapse validation permission bureaucracy

| | |
|--|--|
| **WHAT** | Stop requiring Stage 13 for calculation. Keep/port: dangling refs, interpretation conflicts in resolvers, calculator input assertions, post-calc invariants. Delete or shrink validators whose only job was minting incompleteness `canCalculate: false`. Assumption reviews created at assumption time; ND at domain calc time; conflict reviews at resolution time. |
| **WHY** | Validate reading/math, not permission. |
| **FILES** | `stages/createFramingStages.ts` (validation stage optional/DEV); `validators/**`; `validation-coordinator.ts`; review workspace consumers. |
| **PRESERVE** | Real conflict detection; schema bounds. |
| **REMOVABLE AFTER** | Monolithic Stage 13 as production gate. |
| **TESTS** | Pipeline can compute materials with validation omitted or empty; integrity unit tests; Beckstead review count should fall without regressing capable materials. |
| **OUTPUT CHANGE** | Review volume down; materials hold or only change via R1 architecture wins. |
| **TEMP KEEP** | Optional DEV validation companion artifact. |
| **EXIT** | Full framing pipeline green without Stage 13 permission semantics; no calculator reads validation incompleteness. |

---

### R5 — Demote confidence, authority grades, package-product-state from production authority

| | |
|--|--|
| **WHAT** | Confidence stage → DEV companion or optional soft label not used as takeoff blocking. Authority grades never consulted for emit. Package-product-state / `CALCULATOR_STARVED` etc. DEV-only. Contractor report = materials + assumptions + human reviews (+ exceptional ND). |
| **WHY** | Observability ≠ permission. |
| **FILES** | `confidence/**`; report stage; `16-report.package-product-state`; UI read models if they gate on confidence/claims. |
| **PRESERVE** | Artifact writes for engineers. |
| **REMOVABLE AFTER** | Production dependence on confidence/authority/package enums. |
| **TESTS** | Report/CSV export tests for construction-language materials; confidence not required for material list. |
| **OUTPUT CHANGE** | Labels/jargon; not quantities (except removing false “blocked” product state). |
| **TEMP KEEP** | DEV companions on disk. |
| **EXIT** | Contractor-facing takeoff has no claimStatus/pendingClaims/authority/package handoff vocabulary. |

---

### R6 — Relationship gate audit (production path only)

| | |
|--|--|
| **WHAT** | Audit domain calculators/resolvers for relationship checks that skip calc when the calculator’s **actual required inputs** are already known or obtainable by existing fact/derivation/assumption paths. Soften **only** those that are pure permission graphs (e.g. skip entire opening solely because parent id null **when** no attempt is made and dims exist — document as residual; **do not** implement new host geometry inference in reset). Prefer: if required surrounding inputs missing → try existing derivation hooks if any → assume if registered → else ND. |
| **WHY** | Relationships serve calculation. |
| **FILES** | Especially `calculateOpeningFraming.ts` (`resolveParentSegment`); sheathing coveredObject validators if they block emit; structural association gates that block when length/size already present. |
| **PRESERVE** | Checks that prevent wrong quantities or duplicates. |
| **REMOVABLE AFTER** | Arbitrary parent-complete graphs as emit prerequisites. |
| **TESTS** | Unit tests: when required numeric/spec inputs are present without parent link, behavior matches locked rule (either calc if inputs sufficient, or ND — not claim/validation permission). **Do not** add new geometry-host golden tests as reset scope. |
| **OUTPUT CHANGE** | Only where relationship was pure gate and inputs were already sufficient. |
| **TEMP KEEP** | Parent fields on schemas (still useful when present). |
| **EXIT** | Documented list of remaining relationship uses all justify calc/interpretation/dedupe; no known pure permission relationship gates in calc path. |

---

### R7 — Pipeline hygiene for minimum flow

| | |
|--|--|
| **WHAT** | Remove or no-op stub `buildingAssemblies`. Optionally absorb classification/reading-order into ingest helpers. Keep reader (compiler + evidence), domain resolve, calculate, report as clear responsibilities. Do **not** invent a new sacred N-stage religion. |
| **WHY** | Orchestration reflects minimum flow. |
| **FILES** | `createFramingStages.ts`; related tests. |
| **PRESERVE** | `PipelineRunner`, fingerprints, Evidence replay. |
| **REMOVABLE AFTER** | Stub stage / redundant stage ceremony. |
| **TESTS** | Mock pipeline + evidence-replay integration. |
| **OUTPUT CHANGE** | No (orchestration only). |
| **TEMP KEEP** | Stage numbers may remain in artifact filenames during transition. |
| **EXIT** | Production stages map cleanly to read → understand → calculate → takeoff (+ DEV companions). |

---

### R8 — Full post-reset Beckstead run (honest)

| | |
|--|--|
| **WHAT** | Full framing takeoff run **or** complete evidence-replay through the **reset** pipeline on Beckstead. No material-count target. No Burton tuning. No new family logic. |
| **WHY** | Prove the engine; expose real backlog. |
| **FILES** | Run scripts / replay harness; write results under `artifacts/architecture-audit/` (post-reset report). |
| **PRESERVE** | N/A. |
| **TESTS** | This run **is** the proof. |
| **OUTPUT CHANGE** | Honest post-reset takeoff. |
| **EXIT** | Report per §8 completed; category-6 failures = reset incomplete. |

---

## 7. Per-step tests / replay protection (summary)

| Step | Protect with |
|------|----------------|
| R0 | Written baseline metrics |
| R1 | Calculator unit tests with hostile validation payloads; regression on wall stud/plate, WB LVL, crawl joist EA |
| R2 | Assumption registry tests; opening assumption paths; UserDecision Run-2 |
| R3 | Coordinator without claims; schema/parse tests; review workspace without admit APIs |
| R4 | Pipeline without validation permission; integrity tests |
| R5 | Report/export contractor surface tests |
| R6 | Targeted unit tests for unjustified relationship skips |
| R7 | Pipeline mock + evidence replay |
| R8 | Full Beckstead post-reset report |

Prefer Evidence replay / artifact recompute when paid live extract is unnecessary — except R8 should be a **full** framing takeoff path through the new pipeline (live or complete replay equivalent).

---

## 8. Full post-reset Beckstead checkpoint

After R8, report:

1. All emitted material lines and counts (by quantityKey / description).  
2. Assumptions used (count, property, values).  
3. Not Determinable material requirements (if recorded).  
4. Remaining review items (contractor-facing).  
5. Remaining developer diagnostics (companions).  
6. Material families with zero output.  
7. Any calculation still blocked by **software architecture** rather than missing construction capability.  
8. Any remaining Claims / authority / validation-permission / unjustified relationship dependency on the material-production path.  
9. Regressions vs pre-reset baseline capable materials.  
10. Improvements that occurred **solely** because architectural gates were removed.

### Failure classification (mandatory)

| # | Class | Meaning | Disposition |
|---|-------|---------|-------------|
| 1 | READER FAILURE | Plan info not successfully read/interpreted | Post-reset backlog |
| 2 | DOMAIN UNDERSTANDING / DERIVATION GAP | Info exists or could be derived; domain doesn’t yet | Post-reset backlog |
| 3 | ASSUMPTION COVERAGE GAP | Governed default appropriate but missing | Post-reset backlog |
| 4 | CALCULATOR / MATERIAL LOGIC GAP | Quantity logic missing/incomplete | Post-reset backlog |
| 5 | TRUE NOT DETERMINABLE | Insufficient plan info; no responsible derive/assume | Acceptable exceptional |
| 6 | RESIDUAL ARCHITECTURE FAILURE | Old machinery still blocked emit despite sufficient responsible information | **RESET INCOMPLETE** |

Examples of **post-reset backlog (not reset defects):** zero wall sheathing because L×H not implemented; zero openings because host geometry not inferred; zero roof truss package because V1/product scope excludes it.

Examples of **category 6:** inputs present on objects but `isQuantityBlocked` still vetoes; candidacy still suppresses; confidence blocks report materials; parent id null skips calc despite all numeric inputs present and no need for parent.

---

## 9. Reset completion criteria

The architecture reset is **complete** when:

- Production path follows the locked minimum information flow (§1).  
- Materials do not claim/earn existence.  
- Calculators do not require candidacy/admission.  
- Missing-property validation is not a pre-calculation permission gate.  
- Facts → derivations → assumptions can reach calculators in correct precedence (for **existing** registry entries and **existing** derivation hooks).  
- Relationships exist in production only where concrete calc/interpretation/dedupe requires them.  
- Developer confidence/provenance/diagnostics do not decide emit.  
- Domain calculators/natural owners hold the takeoff requirements they actually need (without claim contracts as second source of truth).  
- Useful replay/artifact/debug capability remains.  
- Contractor output is a material takeoff, not internal lifecycle state.  
- Full Beckstead run executes through this pipeline.  
- No major Beckstead failure is still **category 6**.

The reset does **NOT** require:

- Complete framing material coverage  
- Solving every Beckstead family  
- Final Material Taxonomy content  
- Burton parity  
- Every future governed assumption (including 8' wall height)  
- Every future deterministic derivation (including wall sheathing L×H)  
- Final contractor review UX  

Those are **post-reset takeoff capability work**.

---

## 10. Mapping current 16 stages → minimum flow

| Current stage | After reset |
|---------------|-------------|
| 1 verifiedPlanSet | KEEP / absorb into ingest |
| 2 pageClassification | KEEP reader routing |
| 3 planReadingOrder | ABSORB into reader/ingest |
| 4 buildingAssemblies | REMOVE stub |
| 5 compiledDrawingPages (+ PL/dict) | KEEP reader |
| 6 extractedEvidence | KEEP reader output |
| 7–12 domain resolvers | KEEP understand-house |
| 13 validation | REMOVE as permission; integrity elsewhere / DEV |
| 14 calculations | KEEP calculate (no claims mint) |
| 15 confidence | DEV-ONLY |
| 16 report | KEEP takeoff; strip jargon |

---

## 11. Explicit non-goals for reset Build steps

When executing this document in Build Mode:

- Do **not** implement wall sheathing L×H.  
- Do **not** add 8' wall-height assumption.  
- Do **not** expand opening-host geometry as a “reset win.”  
- Do **not** improve roof/truss/connectors/floor LF merely to raise Beckstead counts.  
- Do **not** create replacement universal abstractions.  
- Do **not** reopen architecture per material family — use this blueprint.

After reset + §8 report, user + ChatGPT prioritize the **post-reset backlog** (categories 1–5).

---

## 12. Stop

This is the final production-flow planning pass before reset implementation.

**Do not implement from this file until explicitly authorized.**  
**Do not enter Build Mode from this document alone.**

Supersedes organizing the next phase as a wall-sheathing-only vertical. Material-family proofs come **after** the honest minimum production engine exists.
