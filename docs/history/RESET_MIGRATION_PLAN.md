# Reset Migration Plan

**Status:** MIGRATION PLAN ONLY — no production implementation.  
**Destination:** Locked product/architecture decisions (user + ChatGPT review of `artifacts/architecture-audit/RESET_ARCHITECTURE_AUDIT.md`).  
**Where locked decisions conflict with the audit, these decisions win.**  
**Role of this document:** Map the *current* codebase onto the *target* model and define the smallest safe removal/absorption order.

**Executable reset blueprint:** [`docs/MINIMUM_PRODUCTION_FLOW.md`](MINIMUM_PRODUCTION_FLOW.md) — architecture reset (R0–R8) vs post-reset takeoff capability work. Do not organize the next Build phase around a single material family.

---

## 0. Destination (locked — do not redesign)

### Product

Accept residential construction plan PDFs → return an accurate, complete framing material takeoff in contractor construction language.

### House decides what exists

Materials do not claim/earn existence. Domain logic + Construction Brain determine requirements implied by the understood house. If the house requires it and the engine can responsibly determine it, calculate it.

### Reader vs Brain

| Layer | Job |
|-------|-----|
| ODL / OCR / Claude / Drawing Compiler | What do the plans say/show? |
| Deterministic domain logic + Construction Brain | What framing materials does this construction require, and how much? |

No `ConstructionBrainService`. Claude is not the estimator. Narrow Brain context to Claude only when needed for plan interpretation.

### Input completion (domain-owned)

Per domain, in order:

1. **Plan fact**  
2. **Deterministic derivation** (estimator math/relationships — not assumption)  
3. **Governed assumption** (authorized default + human verify the *input*)  
4. **Not Determinable** (exceptional)

**No** universal Input Satisfaction Engine.  
**No** universal Plan Interpretation / Resolution Engine.  
**No** replacement claim/applicability frameworks.

### Validation

Validate **our reading and our math**, not the architect’s design. Prefer natural owners (schema, domain interpretation, calculator input, post-calc integrity). Monolithic Stage 13 is not required.

### Material Taxonomy

**Not** part of material-production flow. **Not** an applicability engine.  
End-of-run **answer key / completeness reference** only: each relevant family accounted for as `CALCULATED` | `NOT APPLICABLE` | `NOT DETERMINABLE`. Taxonomy content designed separately later — **out of scope for this migration’s implementation work**.

### Review

Normal: “verify this governed input.” Exceptional: Not Determinable. Dev jargon stays off the contractor path.

### Dev lane

Artifacts, replay, provenance, diagnostics, reader confidence, traces — valuable when they do not gate calculation.

---

## 1. Current → target classification

### KEEP (already serves the target)

| Current | Why it stays |
|---------|----------------|
| `PipelineRunner` + artifact envelopes | Replay, lineage, deterministic persistence — keep mechanism; do not treat 16 stage *names* as sacred product architecture |
| Drawing Compiler (`src/compiler/**`) | Plan reading / geometry |
| Project Learning + ODL harvest (`src/project-reading/projectLearning/**`) | Plan reading / project defs |
| Project Dictionary + governor (minimum job: project-local meaning) | Understand the project |
| Domain resolvers: `resolveWallFraming`, `resolveOpenings`, `resolveFloorFraming`, `resolveRoofFraming`, `resolveStructuralMembers`, `resolveSheathing` | Domain-owned interpretation (extend locally; do not wrap in a universal resolver) |
| Domain calculators: `calculateWallFraming`, `calculateOpeningFraming`, `calculateFloorFraming`, `calculateRoofFraming`, `calculateStructuralMembers`, `calculateSheathing`, (+ fasteners when wired) | Quantity production |
| Construction Brain markdown + extraction brain packs | Knowledge source; TS implements takeoff math |
| Assumption schema + factories + `consultAssumptionRegistry` pattern | Governed assumptions (expand; relocate out of `claims/` packaging) |
| UserDecision → Run-2 recalculation path | Confirm/change assumed inputs |
| Evidence as *reader output transport* (see simplify) | Facts from Claude/geometry bridges |
| Report/takeoff assembly core | Customer-facing materials list |
| `npm test` / fixture / Beckstead replay harnesses | Migration safety net |

### SIMPLIFY / ABSORB

| Current | Useful behavior | Natural owner after absorption |
|---------|-----------------|--------------------------------|
| `src/framing/claims/assumptionRegistry.ts` | Closed Brain-authorized defaults; consult-before-block | Standalone assumptions module (e.g. `…/assumptions/`); called **from each domain calculator** |
| `applyAssumptionUserDecisionLifecycle` | active → confirmed/replaced | Assumptions + review/userDecision |
| `claimContracts.ts` required-input path lists | Which properties identity/arithmetic/review-only per quantityKey | **Already largely duplicated inside calculators** — absorb remaining as calculator/domain comments or small per-domain input helpers; **delete claim-role/admission framing** |
| `openingClaimApplicability.ts` | Category eligibility for opening qty keys | Opening domain (resolver + calculator); keep as small eligibility module **without** claim vocabulary |
| `admitMaterialClaimCandidate` schedule_definition suppress + assembly→child fan-out | Don’t emit schedule defs as occurrences; review targeting | Openings resolver / review workspace |
| `quantityKeyAffectsAdmittedEmitClaim` | Thin “is this a takeoff quantity key?” for review queue | Review workspace (rename away from “admit”) |
| Domain validators that check dangling IDs / unit sanity | Our reading integrity | Domain resolvers + calculator input checks + small integrity helpers |
| Opening parent/host linking + geometry gap ownership | Deterministic derivation of wall↔opening | **Openings (+ walls) domain** — strengthen geometry derivation *before* Not Determinable |
| Floor fragment consolidation / evidence converge-by-object-id | Reduce duplicate objects | Keep as **domain-local** helpers inside floor/wall/member resolvers — not a new convergence product |
| `buildingAssemblies` stage | Currently a stub fixture | Remove as stage; real assembly understanding stays inside domain resolvers / reader when needed |
| Page classification + reading order stages | Routing | Absorb into reader/ingest helpers; optional thin stages OK if cheaper than churn |
| Material `claimStatus` on line items | Provenance-ish | Prefer `assumptionIds` + review linkage; drop claim status from product schema over time |
| Report package-product-state | Package handoff enums | DEV-ONLY companion or delete from contractor path |
| Review titles with internal object IDs | Some human text exists | Rewrite toward sheet/mark/construction language when touching review |

### DEV-ONLY

| Current | Notes |
|---------|--------|
| Companion audits (compiler-automation, semantic-binding, relationship-emission, extraction work units, etc.) | Keep generating if useful; never gate calc |
| `pendingClaims` / `BLOCKED_*` / `UNSUPPORTED_CAPABILITY` product surface | Reclassify as diagnostics or delete after domain Not Determinable exists |
| `admitMaterialClaimCandidate` / candidacy context as product | Remove; any residual maps → review DEV |
| Authority grades / `bindingAuthorityGrade` as emit prerequisites | Observability / reader quality only |
| Confidence stage as hard “blocked” takeoff label | Soft DEV/reader signal optional; must not decide material production |
| Resolution traces dumps in contractor UI | Keep on objects for replay/debug |
| Package enums (`CALCULATOR_STARVED`, `ROUTED_NOT_EXTRACTED`, …) | Developer scorecards only |
| `buildFailureTaxonomy` / framing audit runners | Engineering tools |

### REMOVE (scaffolding — after salvage)

| Current | Why remove under locked model |
|---------|-------------------------------|
| Material claim existence / M2 candidacy / horizontal pending mint as product architecture (`collectPendingClaims` product path, claim-outcome as takeoff model) | House decides existence; claims are permission bureaucracy |
| Validation `canCalculate: false` → `isQuantityBlocked` as the **primary** way calculators refuse work | Starves calc before derivation/assumption; replaces domain input completion |
| Monolithic Stage 13 as permission-to-calculate bureaucracy | Validation ≠ existence permission; redistribute legitimate checks |
| Any plan to build Unified Claim / Universal Resolver / Universal Input Satisfaction / Unified Provenance Authority | Forbidden by locked decisions |
| Treating Material Taxonomy as production applicability engine | Locked: end answer key only |
| Contractor-facing claim/authority/pipeline jargon | Product is the takeoff |

**Remove does not mean “delete on day one.”** It means: extract useful rules → migrate callers → delete scaffolding → prove Beckstead.

---

## 2. Answers to the twelve plan questions

### Q1 — What already matches and should remain?

Reader stack (ODL/OCR/Claude/Compiler/Dictionary), domain resolvers, domain calculators, Brain knowledge files, artifact/replay pipeline, assumption consult pattern (opening kings/sill/cripples), UserDecision recalculation, takeoff report materials list.

### Q2 — What should be removed outright?

After salvage: claim candidacy/admission product path; pendingClaims as normal contractor review; authority-grade emit gates; confidence-as-calc-blocker; Stage 13’s role as pre-calc permission wall; stub `buildingAssemblies` as architecture; any new unified abstraction proposals.

### Q3 — What to absorb, and where?

See §1 SIMPLIFY / ABSORB table. Highest value:

- Assumption registry → assumptions module + **every** domain calculator that needs defaults  
- Opening eligibility → openings domain  
- Required-input knowledge → already in calculators; stop dual-maintaining via `claimContracts`  
- Geometry host linking → openings/walls derivation  
- Review fan-out maps → review workspace without “admission”

### Q4 — What becomes DEV-ONLY?

Companion audits, package-product-state, claim/pending diagnostics, authority grades, confidence hard-block labels, resolution-trace contractor dumps, failure taxonomies.

### Q5 — Which current restrictions block legitimate deterministic derivations?

| Restriction | Location | Target under locked model |
|-------------|----------|---------------------------|
| Sheathing SF must be explicit; must not L×H | `docs/FRAMING_V1_LIMITATIONS.md`; sheathing calc/validators | **Rework:** length × height (fact or assumed height) is **derivation**, not invention |
| Floor `joistLayoutLengthFeet` / `joistMemberLengthFeet` must be explicit; no derive from geometry | Same doc + floor validators/calc | **Rework where responsible:** derive from plan geometry/dims when deterministic; do not invent from IRC tables |
| Opening nominal dims required to unblock framing family | V1 limitations + openings validator | Prefer rough when rough is the plan fact; derive relationships via geometry |
| Opening calculator `continue` when `parentObjectId` null | `calculateOpeningFraming.resolveParentSegment` | Domain must **derive** host when geometry allows **before** Not Determinable |
| `isQuantityBlocked` honors missing-property validation before assume | All major calculators | Calculators own: fact → derive → assume → else Not Determinable |
| Assumption registry too narrow + unreachable | `assumptionRegistry.ts` + opening skip | Expand only Brain-authorized entries; call **after** derivation, **before** Not Determinable |
| Jack invent forbidden | V1 + opening calc | **Keep** unless product later authorizes (still a product decision) |
| No truss package / no connector inference / no IRC sizes | V1 + Brain forbidden | **Keep** as Not Determinable / out of scope — not “derivation” |
| Sheathing areas never minted (0 areas on Beckstead) | Sheathing resolver | Domain must create coverage from wall/floor/roof geometry when specs exist |

### Q6 — How do governed assumptions become reachable before Not Determinable?

**Per domain calculator** (not a universal layer):

```text
for each applicable quantity in this domain:
  gather inputs from resolved domain objects
  if missing: try domain deterministic derivation
  if still missing: consultAssumptionRegistry(quantityKey, propertyPath)
  if assumed: emit quantity + assumption record + human review on the INPUT
  if not registered / ineligible: mark Not Determinable (exceptional)
  never ask Stage 13 permission first
```

**Concrete code move:** Stop treating `isQuantityBlocked(validation, …)` as authoritative for “missing input.” Either:

- remove validation quantity-impact blocking from the calc path, or  
- only honor blocks that mean *integrity failure* (conflict / impossible units), not *incomplete field*.

Opening path must not `continue` past missing parent until geometry derivation and assumption policy have run.

### Q7 — How do calculators consume facts / derivations / assumptions without a universal Input Satisfaction layer?

Keep **`coordinateFramingCalculations`** as a thin orchestrator that *calls domain calculators* (it already does). Each calculator:

- reads its domain payload(s)  
- performs domain-local derivation helpers (can live next to that calculator/resolver)  
- calls shared **assumption registry helper** only as a library  
- emits materials + assumptions + exceptional not-determinable records  

Shared code allowed: geometry utils, unit parsing, assumption registry, review-item factory. Shared code **forbidden:** a service that all domains must “pass through” to earn inputs.

Salvage from `claimContracts`: treat as a **checklist while migrating**, then delete — calculators already enforce most paths (`calculateWallFraming`, `calculateFloorFraming`, etc.).

### Q8 — Domain-owned resolution using existing resolvers?

Do **not** introduce a Plan Interpretation engine.

| Domain | Keep / extend |
|--------|----------------|
| Walls | `resolveWallFraming` — conflict resolution for competing lengths; geometry length authority |
| Openings | `resolveOpenings` — identity convergence local to openings; **host derivation** from compiler gaps/marks |
| Floor | `resolveFloorFraming` + existing fragment consolidation helper |
| Roof | `resolveRoofFraming` — stick vs truss typing; avoid false common-rafter on prefab truss |
| Structural | `resolveStructuralMembers` — schedule def vs occurrence |
| Sheathing | `resolveSheathing` — mint areas from covering geometry when specs known |

Pipeline may still *call* these functions in sequence; that is orchestration, not a universal resolver authority.

### Q9 — Safest dependency order (do not destroy reader/calc/replay)

See **§3 Migration phases** below. Principle: unlock calculation completion **before** deleting observability; salvage rules **before** deleting claims; keep artifact replay green at every step.

### Q10 — Tests / replays per step

See each phase in §3. Baseline: existing `tests/framing/*`, `tests/core/*calculator*`, user-decision Run-2 tests, Beckstead artifact replay under `artifacts/beckstead-floor-wb-restore-20260829-122807/`.

### Q11 — When to rerun Beckstead to prove gate removal helps?

**First proof checkpoint:** after Phase B (decouple calc from `canCalculate` starvation) + Phase C (assumptions reachable on openings/walls) — expect assumptions > 0 and opening/sheathing/floor completion movement **without** requiring full claim deletion.

**Second proof:** after Phase D derivation unlocks (sheathing L×H / area mint; opening host geometry).

Do not wait until all scaffolding is deleted to measure completion.

### Q12 — Remaining product decisions (cannot invent architecture to avoid)

1. **Wall height 8'** — authorize as governed residential default in Brain/registry, or only when project-configured? (Locked review example implies authorize + review.)  
2. **Jack studs** — remain explicit-only / User Decision only?  
3. **Prefab / scissor trusses** — package line, presence-only review, or out of scope?  
4. **Sheathing sheet conversion + waste** — in V1 takeoff or later? (L×H SF derivation is separate from sheet count.)  
5. **Opening host aggression** — how far geometry may bind schedule-only marks without a visible gap?  
6. **Contractor confidence display** — show anything, or DEV-only?  
7. **Not Determinable contractor UX** — copy/shape (must not resurrect claim jargon).  
8. **Taxonomy document content** — separate research track; migration only reserves an end-check hook.

---

## 3. Migration phases (smallest safe order)

Each phase: **WHAT / WHY / enables / preserve / protect**.

### Phase A — Freeze baseline (no behavior change)

**WHAT:** Capture Beckstead scorecard from current restore run (54 materials, 0 assumptions, ~190 pending, package counts, ID traces in audit). Add a durable “reset baseline” note under `artifacts/architecture-audit/` or benchmarks if needed — **documentation/metrics only**.

**WHY:** Prove later deltas.

**Enables:** Honest before/after.

**Preserve:** Everything.

**Protect:** Do not mutate production; optional script read-only.

---

### Phase B — Decouple calculators from validation permission gates

**WHAT:**

1. Stop using Stage 13 `canCalculate: false` (via `isQuantityBlocked`) as the primary incompleteness gate inside domain calculators.  
2. Calculators perform their own required-input checks **after** local derivation/assumption attempts.  
3. Keep honoring true integrity failures if any (conflicting resolved values, invalid units) — preferably detected in domain resolution or explicit integrity helpers, not “field missing.”

**WHY:** Locked model — missing fields are not “permission denied”; they are inputs to satisfy. Audit showed this coupling as the main completion killer.

**Enables:** Materials can calculate when objects already have enough facts; assumptions can run; openings no longer die solely because a validator fired first.

**Preserve:** Calculator formulas; Brain forbidden inventions; UserDecision paths; artifact schemas initially (may still *carry* unused validation payloads).

**Protect:**

- Unit tests per calculator: given resolved inputs, emit quantities with `validation` containing blocking issues that only mean “property unresolved” — quantities must still emit when calculator-local inputs are present.  
- Existing positive calculator tests must stay green.  
- Beckstead **replay from saved Evidence** (no paid re-extract required): material count must not regress on walls/WB/crawl joist; expect pending↓ / materials↑ only after later phases if objects still lack fields.

**Exit criteria:** Calculators no longer import validation incompleteness as hard block; `isQuantityBlocked` either deleted or reduced to integrity-only.

---

### Phase C — Make governed assumptions reachable (domain-local)

**WHAT:**

1. Move `assumptionRegistry` (+ lifecycle helper) out of `claims/` packaging into an assumptions module.  
2. Opening calculator: **do not skip** the whole opening before attempting host derivation (Phase D) and king/sill/cripple registry consult.  
3. Add only Brain-authorized registry entries required by locked product (at minimum: align wall height policy with product decision #1 in §2 Q12 once decided).  
4. Emit assumption records + human-sized review items on the **input**, not pending claim rows.  
5. Ensure UserDecision confirm/replace still recalculates dependents (existing Run-2 tests).

**WHY:** Assumptions were intended to keep takeoff moving; Beckstead 0 assumptions proves unreachability.

**Enables:** `assumptions.length > 0` on Beckstead when defaults apply; opening kings/sills/cripples when host+dims known; wall-height-dependent sheathing when authorized.

**Preserve:** Closed registry discipline (no LLM-authored defaults); forbidden engineered assumptions.

**Protect:**

- `tests/framing/material-claim-authority-ladder.test.ts` → rewrite to assumption-registry tests (no claim ladder).  
- Opening calculator unit tests for king default + review.  
- Cross-domain UserDecision Run-2 tests.

**Exit criteria:** On Beckstead replay/recompute: assumptions > 0 for at least opening and/or wall-height paths when eligible; no dependence on M1 claim vocabulary.

---

### Phase D — Unlock estimator-natural deterministic derivations (domain-local)

**WHAT (targeted reworks of V1 limitations + domain code):**

| Domain | Derivation to restore |
|--------|----------------------|
| Sheathing | From resolved/assumed wall (or floor/roof) geometry → coverage SF (**derivation**); mint sheathing areas when systems have specs |
| Openings | Geometry gap / mark ownership → `parentObjectId` / `parentWallId` when deterministic |
| Floor | Where plan geometry/dims responsibly give layout axis length or member length, derive — still no IRC invention |
| Walls | L×H for sheathing inputs once height fact/assumed |

**Update** `docs/FRAMING_V1_LIMITATIONS.md` to match locked derivation model (doc change is part of migration clarity; not a new framework).

**WHY:** “Not written” ≠ unknown. Current sheet forbids estimator math the locked model requires.

**Enables:** Sheathing materials > 0; opening materials > 0 for hosted openings; floor LF where sibling evidence exists.

**Preserve:** No truss package invention; no connector invention; no engineered size invention; jack policy until product decides.

**Protect:**

- New focused unit tests per derivation (geometry → host; L×H → SF).  
- Beckstead checkpoint: openings materials > 0 for geometry-hosted set; sheathing areas > 0 or SF lines > 0; crawl LF if member length derivable.  
- Regression: wall stud/plate and WB2 LVL and crawl EA must remain.

**Exit criteria:** Documented V1 limits no longer contradict Facts→Derivations→Assumptions; Beckstead shows movement on openings/sheathing.

---

### Phase E — Remove Material Claims product scaffolding

**WHAT:**

1. Salvage complete (Phases B–C): eligibility module, assumption registry moved, review fan-out renamed.  
2. Remove from production takeoff path: `collectPendingClaims` horizontal mint, `admitMaterialClaimCandidate`, `deriveMaterialClaimStatus` on materials, claim-outcome as contractor model.  
3. Replace exceptional outcomes with domain **Not Determinable** records (minimal schema — not a new claim framework).  
4. Delete or hollow `claimContracts.ts` after calculator ownership confirmed.  
5. Strip `claimStatus` from customer takeoff view/CSV.

**WHY:** Locked — claims are not product architecture.

**Enables:** Simpler calc coordinator; review queue tied to inputs/assumptions; less jargon.

**Preserve:** Assumption consult; opening eligibility; UserDecision; DEV diagnostics if still needed under new names.

**Protect:**

- Rewrite/remove `material-claim-candidacy-admission.test.ts`, authority-ladder tests.  
- Review workspace tests: primary queue still surfaces assumed-input reviews.  
- Beckstead: materials must not regress vs Phase D; pendingClaims may disappear or become DEV-only.

**Exit criteria:** No production import of candidacy/pending mint; takeoff builds without claim status.

---

### Phase F — Collapse validation bureaucracy

**WHAT:**

1. Stop requiring Stage 13 output for calculation.  
2. Keep/port: dangling reference checks, conflict detection in resolvers, calculator input assertions, post-calc invariants (non-negative, aggregates, duplicate physical member guards as they are implemented).  
3. Delete or shrink domain validators whose only job was minting `canCalculate: false` incompleteness issues.  
4. Review items for assumptions generated at assumption creation time; Not Determinable at domain calc time.

**WHY:** Validate reading/math, not permission.

**Enables:** Smaller pipeline; fewer 700+ false “review” items that are really incomplete gates.

**Preserve:** Real conflict reviews (“two lengths for same wall — which owns?”) at resolution time.

**Protect:** Resolver conflict tests; any integrity tests; Beckstead review count should fall while materials rise or hold.

**Exit criteria:** Pipeline can compute materials without Stage 13; optional integrity pass does not recreate incompleteness gates.

---

### Phase G — Dev-only demotion (confidence, package state, authority)

**WHAT:** Confidence stage → optional DEV companion; package-product-state → DEV; authority grades never consulted for emit; contractor report shows materials + assumed-input reviews only.

**WHY:** Observability must not gate production.

**Enables:** Clean customer output.

**Preserve:** Artifacts on disk for engineers.

**Protect:** UI/export tests for takeoff CSV language; report schema may keep optional DEV fields behind flags.

---

### Phase H — Pipeline stage hygiene (last)

**WHAT:** Optionally merge/absorb stub stages (`buildingAssemblies`), fold classification/order into ingest, keep Compiler + domain resolve + calc + report as clear responsibilities — **without** inventing a new fixed N-stage religion.

**WHY:** 16 stages are accretion, not product.

**Enables:** Cognitive simplicity for future work.

**Preserve:** `PipelineRunner` ordering guarantees; replay fingerprints; Evidence replay.

**Protect:** Full framing pipeline mock + Beckstead evidence-replay integration tests.

**Do this last** so earlier completion wins are not blocked on stage renames.

---

### Phase I — Taxonomy end-check hook (after taxonomy research)

**WHAT:** When the separately designed taxonomy document exists, add an **end-of-run** accounted-for check: `CALCULATED | NOT APPLICABLE | NOT DETERMINABLE`. No production applicability engine.

**WHY:** Locked taxonomy role.

**Enables:** Completeness reporting without driving emit.

**Preserve:** Domain logic as sole applicability authority.

**Protect:** Fixture asserting known applicable families accounted for.

**Out of scope now:** Expanding taxonomy content.

---

## 4. Subsystem migration sheets (ruthless)

### Evidence

- **KEEP** as reader→domain fact transport for now.  
- **SIMPLIFY:** stop treating Evidence completeness / provenance richness as calc permission.  
- **DEV-ONLY:** evidence ID dumps in contractor review.  
- **Do not** build a replacement Evidence Authority Layer.

### Identity / convergence

- **ABSORB** into domain resolvers (already largely there).  
- **Do not** schedule “authoritative property contribution & fragment fan-in” as a product milestone.  
- Fix stranding by domain derivation (openings host, sheathing areas), not new transport frameworks.

### Authority / provenance gates

- **DEV-ONLY**; remove from emit path (Phase G).

### Material Claims

- **REMOVE** product path (Phase E) after salvage (Phases B–C).

### Stage 13 validation

- **REMOVE as gate**; redistribute integrity (Phase F).

### Confidence

- **DEV-ONLY** (Phase G).

### Review generation

- **SIMPLIFY** toward assumed-input + rare Not Determinable + resolution conflicts.  
- Stop minting hundreds of calculation-blocked items as the normal queue.

### Assumption registry

- **KEEP pattern**; **SIMPLIFY** location; **expand reach** domain-locally; order = after derivation, before Not Determinable.

### Resolvers

- **KEEP** domain-owned; strengthen local derivation.

### Calculators

- **KEEP**; own input completion; drop validation permission coupling.

### Project Dictionary / Learning / Compiler

- **KEEP**; continue feeding domain resolvers; do not add claim-like governance for dictionary facts to “count.”

### Artifacts / replay

- **KEEP**; critical safety net throughout.

### Report / takeoff

- **KEEP** materials assembly; **REMOVE** jargon fields from contractor surface; human construction language descriptions.

### V1 limitations

- **REWORK** derivation bans that contradict locked Facts→Derivations→Assumptions; **KEEP** true invention bans.

---

## 5. Beckstead proof plan

| Checkpoint | After phase | Expect (directional) |
|------------|-------------|----------------------|
| Baseline | A | 54 materials, 0 assumptions, openings 0, sheathing 0 |
| Gates loosened | B | No regress on 54; possibly small gains if objects already complete |
| Assumptions live | C | assumptions > 0; some opening lines if hosts already present |
| Derivations | D | openings > 0 (hosted); sheathing > 0; possible floor LF |
| Claims gone | E | same materials without pendingClaims product surface |
| Validation slim | F | review item count down; materials hold/up |
| Dev demotion | G | contractor report clean |

Prefer **Evidence replay / stage-14+ recompute** when possible to avoid paid full runs; schedule one live Beckstead after Phase D for empirical proof.

---

## 6. What this plan deliberately does *not* do

- Does not redesign Material Taxonomy content  
- Does not add ConstructionBrainService / Universal Resolver / Input Satisfaction Engine / Unified Claims  
- Does not implement the reset  
- Does not preserve claims “because tests exist”  
- Does not treat audit’s older “taxonomy-as-applicability-engine” recommendation as destination (superseded)  
- Does not require replacing 16 stages with another fixed stage count before completion improves  

---

## 7. Suggested first implementation slice (when Build Mode is later authorized)

Smallest vertical that proves the destination:

1. Phase B for **opening + wall** calculators only (`isQuantityBlocked` incompleteness ignored).  
2. Phase C opening assumption consult actually fires on Beckstead-hosted openings.  
3. Measure assumptions + opening material lines on replay.

Stop and review before sheathing L×H / claim deletion / stage surgery.

---

## 8. Stop

This document is the migration plan.

**Do not implement from this file until explicitly authorized.**  
**Do not enter Build Mode from this document alone.**

Evidence sources: `artifacts/architecture-audit/RESET_ARCHITECTURE_AUDIT.md`, locked decisions in the authorizing prompt, and current code under `src/framing/**`, `docs/FRAMING_V1_LIMITATIONS.md`, Beckstead artifacts `beckstead-floor-wb-restore-20260829-122807`.
