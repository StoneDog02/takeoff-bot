# Stage 10 Sheathing — Factual Finding

**Scope:** Current Stage 10 `sheathing` / `resolveSheathing`, involved helpers/schemas, and Stage 14 `calculateSheathing`.  
**Question:** After READ THE PLANS has understood wall/floor/roof construction, sheathing specifications, geometry, openings, schedules, notes, and natural relationships, what does current Stage 10 actually add before sheathing material calculation?  
**Secondary question:** Why does the current Beckstead pipeline produce zero sheathing material despite upstream reader recovery of sheathing-related construction information?  
**Authority:** Code, tests, and frozen Beckstead artifacts only. No KEEP/REMOVE recommendations. No replacement design.

**Primary files:**
- Stage wiring: [`createFramingStages.ts`](../src/scopes/framing/stages/createFramingStages.ts) (order 10)
- Resolver: [`resolveSheathing.ts`](../src/scopes/framing/resolvers/resolveSheathing.ts)
- Parent-system link: [`resolveSheathingAreaParentSystem.ts`](../src/scopes/framing/resolvers/resolveSheathingAreaParentSystem.ts), [`resolveEvidenceBackedParentSystemLink.ts`](../src/scopes/framing/resolvers/resolveEvidenceBackedParentSystemLink.ts)
- Property paths: [`sheathingPropertyPaths.ts`](../src/scopes/framing/resolvers/sheathingPropertyPaths.ts)
- Schema: [`sheathing.schema.ts`](../src/scopes/framing/schemas/sheathing.schema.ts)
- Area↔system bridge (Stage 6): [`buildAreaSystemRelationshipEvidence.ts`](../src/scopes/framing/geometry/buildAreaSystemRelationshipEvidence.ts)
- Extraction contract: [`extractFramingEvidence.ts`](../src/scopes/framing/prompts/extractFramingEvidence.ts) (sheathing rules)
- Calculator: [`calculateSheathing.ts`](../src/scopes/framing/calculators/calculateSheathing.ts)
- Validation: [`sheathing.validator.ts`](../src/scopes/framing/validators/sheathing.validator.ts)
- Beckstead evidence: `artifacts/b2.2m.4/runs/beckstead-audit-b/framing/` (M.4 frozen), `artifacts/b2.3-wave5/runs/beckstead-wave5-after/framing/` (wave5)

---

## 1. Stage 10 input

### What Stage 10 receives (actual wiring)

Stage 10 reads **only**:

1. Stage 6 `extractedEvidence.evidence` (`Evidence[]`)
2. Optional `userDecisionRunInput` (user decisions + review items for scalar overrides)

Stage 10 does **not** read wall framing, openings, floor framing, roof framing, compiled pages, `projectDictionary`, building assemblies, or geometry artifacts directly — despite [`sheathing.spec.md`](../src/scopes/framing/specs/sheathing.spec.md) listing those as consumed artifacts.

### Major properties — earliest source vs Stage 10 repackaging

| Property on `SheathingSystem` / `SheathingArea` | Typical plan/reader origin (learned) | How it reaches Stage 10 |
|---|---|---|
| System subject / mark (`SHS-001`, `SW2`, `ROOF SHEATHING`, …) | Sheathing schedule rows; Claude sheathing intent; general notes | `subjectKind:"sheathing-system"` Evidence with `subjectKey` = plan tag |
| `application` (wall / floor / roof) | Explicit schedule/note wording (“wall sheathing”, “subfloor”, “roof deck”) | Evidence `propertyPath:"application"`; `canonicalizeSheathingApplication` normalizes aliases |
| `panelSpecification.panelType` | Schedule / note panel name (OSB, plywood, gypsum wallboard) | Evidence on sheathing-system subject |
| `panelSpecification.thickness` | Schedule thickness column or explicit note | Evidence `panelSpecification.thickness` — **separate path** from panelType |
| `panelSpecification.grade`, `spanRating`, `exposureRating`, `edgeTreatment`, `specificationReference` | Schedule columns / nailing notes | Evidence on sheathing-system subject |
| `name`, `level`, `constructionPhase` | Schedule metadata | Evidence on sheathing-system subject |
| `areaSquareFeet` | **Explicit stated SF** on plan for an area tag | Evidence on `subjectKind:"sheathing-area"` only |
| `parentSystemTag` → `parentSystemId` | Explicit area→system ownership statement on plans | Evidence `parentSystemTag`; Stage 10 maps tag → `SHS-{tag}` ObjectId |
| `coveredWallTag` → `coveredObjectIds` | Explicit “covers wall W-001” style callout | Evidence relationship tag → `W-{tag}` ObjectId |
| `openingTag` → `openingIds` | Explicit opening association on sheathing area | Evidence relationship tag → `O-{tag}` ObjectId |
| `areaIds` on system | Derived from area `parentSystemId` links | Stage 10 `linkSystemAreaIds` (bookkeeping) |

**Information on other subjects that Stage 10 does not consume:**

| Reader fact | Where it lands | Stage 10 consumption |
|---|---|---|
| Wall schedule sheathing cell (`7/16" OSB SHEATHING`) | `subjectKind:"wall"`, `propertyPath:"assembly.sheathing"` (Beckstead M.4) | **Not read** — different subjectKind and property path |
| Compiler/PL schedule column | `propertyPath:"assembly.sheathingType"` on wall/SW definition cluster | **Not read** — path not in `SHEATHING_SYSTEM_PROPERTY_PATHS` or wall sheathing calc |
| Wall length × height | Stage 7 wall segments / geometry | **Not derived** — extraction rules forbid L×H sheathing SF |
| Floor/roof `areaSquareFeet` | Floor/roof domain objects | **Not borrowed** — spec forbids treating floor/roof area as sheathing coverage |
| Opening rough dims | Opening objects | **Not used** for sheathing area or deductions |

**Working fixture path** (`buildSheathingEvidenceForWall001`, `framing.sheathing.test.ts`): explicit `sheathing-system` + `sheathing-area` Evidence with separated panelType/thickness, application, parentSystemTag, areaSquareFeet, coveredWallTag → 160 SF material line.

---

## 2. Sheathing system / area creation

### What creates a `SheathingSystem`

`resolveSheathing`:

1. Filter Evidence with `subjectKind === "sheathing-system"`.
2. Group by `subjectKey` (schedule mark / note tag).
3. `convergeEvidenceByCanonicalObjectId` + `createSheathingSystemObjectId` → `SHS-{sanitizedKey}`.
4. `resolveOneSystem` per cluster — scalar fields from Evidence consensus via `SHEATHING_SYSTEM_PROPERTY_PATHS`.
5. `linkSystemAreaIds` — populate `system.areaIds` from resolved areas.

### What creates a `SheathingArea`

Same pattern with `subjectKind === "sheathing-area"` → `SHA-{sanitizedKey}`:

- Scalars: `areaSquareFeet`, `layout`
- Relationships: `parentSystemTag`, `coveredWallTag`, `openingTag` collected as tags → ObjectIds
- If no explicit `parentSystemTag`: `parentSystemId = SHS-UNRESOLVED`
- `applyInferredParentSystemLink` calls `resolveSheathingAreaParentSystemLink` — **Tier-A explicit tag only**; returns null without explicit `parentSystemTag` Evidence (no co-location, uniqueness, or SW-wall-type inference)

### Discover vs convert vs infer

| Behavior | Present in Stage 10? |
|---|---|
| Discover sheathing from PDF geometry | **No** |
| Infer application from wall type / shear-wall mark | **No** |
| Derive area from wall length × height | **No** (also forbidden in extraction prompts) |
| Convert `sheathing-system` / `sheathing-area` Evidence into domain objects | **Yes** — primary function |
| Infer panel spec from `wall.assembly.sheathing` | **No** (forbidden in extraction; not read in resolver) |
| Link area→system without explicit tag | **No** — fails closed to `SHS-UNRESOLVED` |

### Existence / eligibility requirements

- **System:** at least one `sheathing-system` Evidence record for a subjectKey.
- **Area:** at least one `sheathing-area` Evidence record for a subjectKey.
- Partial objects preserved when scalars conflict or are missing (validation/calc own blocking).
- Calculator additionally requires area’s `parentSystemId` to match an existing system in the same payload.

---

## 3. Resolution operations

| Step | Input | Output / change | New construction understanding? |
|---|---|---|---|
| Group by subjectKind | Evidence | system/area groups | No |
| Converge ObjectIds | raw subjectKeys | `SHS-*`, `SHA-*` clusters | Identity normalize |
| Scalar resolve (system) | Evidence per `SHEATHING_SYSTEM_PROPERTY_PATHS` | application, panelSpecification.*, name, level, phase | Select/normalize Evidence; conflict → unresolved trace |
| Application canonicalize | string candidate | `wall`/`floor`/`roof` via alias table | Normalization only |
| Scalar resolve (area) | `areaSquareFeet`, `layout` | nullable fields | Select Evidence |
| Relationship tags | `parentSystemTag`, `coveredWallTag`, `openingTag` | tags → ObjectId arrays | **Translation** of explicit tags |
| Parent system default | missing tag | `parentSystemId = SHS-UNRESOLVED` | Placeholder |
| Explicit parent link | `parentSystemTag` Evidence | `parentSystemId = SHS-{tag}` | Translation |
| `linkSystemAreaIds` | areas’ parentSystemId | `system.areaIds` | Bookkeeping backlink |
| User decisions | optional overrides | scalar override traces | No new plan facts |

**Not performed:** opening SF deduction, sheet count, waste factor, aggregation across walls, pitch adjustment, reading wall/floor/roof artifacts.

---

## 4. What the plans / reader already know (before Stage 10)

| Reader path | Example fact | Reaches Stage 10? |
|---|---|---|
| **Shear-wall / sheathing schedule (Claude sheathing intent)** | SW2: 7/16" OSB | **Partial** — M.4: `sheathing-system` SW2 with combined `panelType` string, no `application`, no `thickness` field; wave5: separated OSB + 7/16" + `application:"wall"` |
| **Wall-type sheathing on wall subject** | `wall SW2 assembly.sheathing = 7/16" OSB SHEATHING` | **No** — lands on Stage 7 wall object, not Stage 10 |
| **Drawing Compiler schedule column** | `assembly.sheathingType` on SW definition | **No** — path mismatch (`sheathingType` vs `panelSpecification.*`; subjectKind often `wall`/definition cluster not `sheathing-system`) |
| **Project Learning definitions** | `tests/fixtures/project-learning/t-r1-c2-sw-wb.json` sheathing on SW2 | **No** — PL stores `sheathing` on definition; compiler emits `assembly.sheathingType`; neither maps to `sheathing-system` Evidence paths |
| **General framing notes** | Roof sheathing OSB, span rating, nailing | **Partial** — M.4 `ROOF SHEATHING` system with panelType/thickness conflict, `application` unknown |
| **Explicit sheathing area SF** | “DOUBLE GARAGE 575 SF” | **Partial (wave5)** — `sheathing-area DOUBLE GARAGE areaSquareFeet=575` minted, but **no `parentSystemTag`** |
| **Floor area SF (same numeric value)** | `floor-framing-area GARAGE AREA areaSquareFeet=575` | **No** — floor domain; Stage 10 does not consume |
| **Wall geometry (length, height)** | Stage 7 segments with `lengthFeet` | **No** — not consumed; extraction forbids L×H sheathing |
| **Area↔system bridge (Stage 6)** | `buildAreaSystemRelationshipEvidence` P1–P4 proofs | **Only if `sheathing-area` subjects exist** — Beckstead wave5 audit: `bridgeEmissionCount: 0`, `parentSystemTagCount` only for floor areas |
| **Synthetic complete fixture** | SHS-001 + SHA-001 + 160 SF | **Yes** — full path to material |

**Property-path / representation gaps (factual):**

- `assembly.sheathing` (wall) ≠ `panelSpecification.panelType` / `panelSpecification.thickness` (sheathing-system)
- `assembly.sheathingType` (compiler) ≠ any Stage 10 path
- Combined schedule strings in `panelType` (e.g. `'7/16" OSB SHEATHING'`) do **not** populate `thickness` — calculator requires separate resolved thickness trace

---

## 5. Beckstead zero-sheathing trace

Frozen M.4 run (`artifacts/b2.2m.4/runs/beckstead-audit-b/framing/`): **6 systems, 0 areas, 0 sheathing material lines** (`14-calculations.json`, `16-report.json`). M.4 closeout documents blocker: `EVIDENCE_MISSING` — 0 sheathing-area subjects (`benchmarks/beckstead/comparisons/M4-PRODUCT-CLOSEOUT.md`).

Wave5 run (`beckstead-wave5-structural-milestone.test.ts`): **11 systems, 1 area, 0 sheathing material lines**.

### Fact-by-fact trace

#### A. SW2 wall sheathing spec (`7/16" OSB`)

| Stage | State |
|---|---|
| **Plan / reader** | Shear-wall schedule SW2; also `wall SW2 assembly.sheathing` |
| **Stage 6 Evidence (M.4)** | `sheathing-system SW2` → `panelSpecification.panelType="7/16" OSB SHEATHING"`; **no** `application`, **no** `panelSpecification.thickness`; duplicate panelType records |
| **Stage 6 Evidence (wave5)** | `sheathing-system SW2` → `application:"wall"`, `panelType:"OSB"`, `thickness:"7/16"` |
| **Stage 10** | M.4: `SHS-SW2`, `application:"unknown"`, `thickness:null`; wave5: fully resolved system identity |
| **Stage 13** | M.4: application + thickness validation failures on material key |
| **Stage 14** | **No area linked to SHS-SW2** → loop never pairs system with area → **0 lines** |
| **Failure boundary** | **Missing sheathing-area** (both runs); M.4 also **identity incomplete** on system |

#### B. SW1–SW5 schedule systems (panel strings, gypsum vs OSB)

| Stage | State |
|---|---|
| **Reader** | 6 `sheathing-system` subjects in M.4 |
| **Stage 10** | All minted; M.4 all `application:"unknown"`; all `thickness:null` (thickness embedded in `panelType` string where present) |
| **Stage 14** | 0 areas → **never evaluated** for SF |
| **Failure boundary** | **No areas** + M.4 **thickness/application path gap** |

#### C. Roof sheathing (`ROOF SHEATHING` / OSB, 5/8" vs 7/16")

| Stage | State |
|---|---|
| **Reader** | `sheathing-system ROOF SHEATHING` with conflicting thickness Evidence |
| **Stage 10** | `SHS-ROOF-SHEATHING`, `application:"unknown"`, thickness conflict → null |
| **Stage 14** | No roof sheathing area subject → **0 lines** |
| **Failure boundary** | **No sheathing-area** + thickness **conflict** + **application unknown** |

#### D. Garage / double-garage 575 SF (wave5)

| Stage | State |
|---|---|
| **Reader** | `sheathing-area DOUBLE GARAGE areaSquareFeet=575`; also `floor-framing-area GARAGE AREA areaSquareFeet=575` (floor, not sheathing) |
| **Stage 10** | `SHA-DOUBLE-GARAGE`, `areaSquareFeet=575`, **`parentSystemId=SHS-UNRESOLVED`** (no `parentSystemTag` Evidence) |
| **Stage 13** | `areaParentSystemResolved` fails — blocks area + material keys |
| **Stage 14** | `systemsById.get(SHS-UNRESOLVED)` → **undefined** → **skip area** (`calculateSheathing.ts` lines 218–222) |
| **Failure boundary** | **Area→system relationship not established** — reader has SF but not explicit parentSystemTag; no inference from SW5-GARAGE wall binding |

#### E. Wall SW5-GARAGE assembly sheathing notes

| Stage | State |
|---|---|
| **Reader** | `wall SW5-GARAGE assembly.sheathing` (“APA rated OSB…”) |
| **Stage 7** | Stored on wall assembly |
| **Stage 10** | **Not consumed** (wrong subjectKind) |
| **Stage 14 wall calc** | `WALL_QUANTITY_KEYS.sheathing` = **unsupported_capability** — no wall sheathing emitter |
| **Failure boundary** | **Representation/translation gap** — fact on wall object, no sheathing-area/system path |

#### F. Compiler `assembly.sheathingType` on SW4

| Stage | State |
|---|---|
| **Reader** | Schedule extraction → `assembly.sheathingType` (`materialUnlockAnalysis.ts`, `extractScheduleDefinitions.ts`) |
| **Stage 10** | **No matching property path or subjectKind** |
| **Failure boundary** | **Property-path mismatch** — documented as `PRODUCER_EXISTS_BUT_NOT_WIRED` |

### Beckstead summary classification

| Cause | Applies? |
|---|---|
| Reader never recovered sheathing info | **Partially false** — wave5 recovers systems + one area SF; M.4 recovers schedule systems |
| Derivation/calculator gap (no L×H, no sheet count) | **Yes** — architecture requires explicit `sheathing-area.areaSquareFeet`; no wall-geometry derivation |
| Representation/translation failure | **Yes** — `assembly.sheathing` / `assembly.sheathingType` on wall subjects; combined panelType strings; missing `parentSystemTag` on areas |
| Validation blocking | **Secondary** — M.4 systems would fail application/thickness validation; wave5 garage area fails parent-system validation; primary calc skip is **missing area↔system link** and **zero areas (M.4)** |
| No implemented calculator path | **No** — `calculateSheathing` implements SF emission; fixture and pipeline tests prove it when Evidence contract is satisfied |

**Combination:** zero Beckstead sheathing is **not** primarily “reader found nothing.” It is **missing sheathing-area population and area→system linking**, plus **M.4 system identity gaps** (application/thickness paths), with **wall/schedule sheathing facts stranded on non–sheathing-system Evidence paths**.

---

## 6. Fact vs derivation vs assumption

| Input / behavior | Classification | Notes |
|---|---|---|
| `application` | **FACT** (+ alias normalization) | Must appear on sheathing-system Evidence; aliases map “subfloor”→floor etc. |
| `panelSpecification.panelType` | **FACT** | Explicit Evidence; not parsed out of wall assembly strings |
| `panelSpecification.thickness` | **FACT** | Separate Evidence path; embedded thickness in panelType string does **not** satisfy calculator |
| `areaSquareFeet` | **FACT** | Explicit stated SF only; extraction forbids L×H |
| `parentSystemTag` | **FACT** | Explicit ownership statement; bridge may emit tag but requires sheathing-area subject |
| `coveredWallTag`, `openingTag` | **FACT** (association text) | Translated to ObjectIds; **not used in SF math** |
| `parentSystemId` from tag | **DERIVATION** | Tag → `SHS-{tag}` ObjectId |
| `coveredObjectIds`, `openingIds` | **DERIVATION** | Tag → wall/opening ObjectIds |
| `system.areaIds` | **DERIVATION** | From area parent links |
| `linkSystemAreaIds` | **DERIVATION** | Backlink bookkeeping |
| Wall length × height → sheathing SF | **UNRESOLVED** | Deliberately not implemented |
| Opening deduction from sheathing SF | **UNRESOLVED** | Calculator test: openingIds do not change quantity |
| Sheet count / waste | **UNRESOLVED** | Not in calculator |
| Floor/roof area → sheathing area | **UNRESOLVED** | Spec + code forbid |
| Governed defaults for missing thickness/application/area | **ASSUMPTION** | **None** — `assumptionRegistry.ts` has zero sheathing entries |
| `assembly.sheathing` on wall | **FACT** (on wall) but **UNRESOLVED for sheathing calc** | Stage 10 never reads it |

**Architectural unresolved despite upstream facts:** Beckstead has wall-schedule sheathing strings and wave5 has separated OSB/thickness/application on `sheathing-system SW2`, but **without a linked `sheathing-area` with explicit SF**, Stage 14 emits nothing. Garage 575 SF exists on sheathing-area Evidence but lacks parentSystemTag → UNRESOLVED parent blocks pairing.

---

## 7. Area derivation

### Wall sheathing

| Question | Current behavior |
|---|---|
| Is area read directly? | **Yes** — only via `sheathing-area` Evidence `areaSquareFeet` |
| Is wall length available upstream? | **Yes** on Stage 7 segments — **not consumed** by Stage 10/14 sheathing |
| Is wall height available? | Often **missing** on Beckstead walls — irrelevant because L×H not used |
| Is length × height performed? | **No** |
| Are openings deducted? | **No** — `openingIds` stored; calculator ignores for quantity |
| Are wall segments aggregated? | **No** — one line per sheathing area |
| Required relationships | Area must reference existing `parentSystemId`; covered walls optional for calc |

### Floor sheathing

| Question | Current behavior |
|---|---|
| Floor area read directly? | Only if emitted as `sheathing-area.areaSquareFeet` — **not** from `floor-framing-area.areaSquareFeet` |
| Stage 10 consumption | Floor framing artifacts **not read** |
| Beckstead | `GARAGE AREA` 575 SF on **floor-framing-area** — does not populate sheathing |

### Roof sheathing

| Question | Current behavior |
|---|---|
| Roof area read directly? | Only explicit `sheathing-area.areaSquareFeet` — **not** from `roof-plane.areaSquareFeet` |
| Pitch/slope involved? | **No** in sheathing calculator |
| Beckstead | Roof systems minted; **0 roof sheathing areas** |

**Distinction:** Information may exist upstream (wall dims, floor SF, schedule specs) but **current Stage 10/calculator only consumes explicit sheathing-domain Evidence** for coverage quantity.

---

## 8. Panel specification flow

### Working example (fixture / pipeline test)

```
Plan text: "Panel type: OSB", "Panel thickness: 7/16\"", "Application: wall"
→ Claude/fixture Evidence: sheathing-system SHS-001, paths panelSpecification.panelType, .thickness, application
→ Stage 10: SHS-001 system with resolved panel spec
→ Stage 14: description "7/16\" OSB wall sheathing", quantity = area.areaSquareFeet
```

### Beckstead SW2 (wave5 — spec recovered, still zero material)

```
Plan: SW2 shear-wall schedule — 7/16" OSB wall sheathing
→ Reader: sheathing-system SW2 with application=wall, panelType=OSB, thickness=7/16"
→ Stage 10: SHS-SW2 resolved system identity
→ Missing: sheathing-area with areaSquareFeet + parentSystemTag=SW2 (or equivalent)
→ Stage 14: no material line
```

### Beckstead SW2 (M.4 frozen — spec partially stranded)

```
Plan: same schedule row
→ Reader: sheathing-system SW2 panelSpecification.panelType="7/16" OSB SHEATHING" (combined string)
→ Also: wall SW2 assembly.sheathing (duplicate on wall subject)
→ Stage 10: SHS-SW2, application=unknown, thickness=null
→ Stage 14: would fail identity checks even if an area existed
```

### Compiler / Project Learning path (not consumed)

```
Plan schedule column "Sheathing"
→ extractScheduleDefinitions: propertyPath assembly.sheathingType
→ Stage 6 semantic Evidence on SW* definition cluster
→ Stage 10: no sheathing-system mint from this path
→ Stage 7: WALL_PROPERTY_PATHS has assembly.sheathing, not assembly.sheathingType
```

**Translation boundaries:** subjectKind (`wall` vs `sheathing-system`), property path (`assembly.sheathing*` vs `panelSpecification.*`), combined vs split type/thickness, and area-domain separation (`sheathing-area` vs wall/floor geometry).

---

## 9. Relationships

| Relationship | First known | Software representation | Consumer | Required for SF formula? | If link fails |
|---|---|---|---|---|---|
| Area → system | Explicit plan ownership note | `parentSystemTag` Evidence → `area.parentSystemId` | Stage 10, Stage 14 (`systemsById.get`) | **Yes** | Area skipped; validation blocks area/material keys |
| System → areas (backlink) | Derived | `system.areaIds` | Validation consistency | No for math | Validation may block if inconsistent |
| Area → walls | Explicit covered-wall callout | `coveredWallTag` → `coveredObjectIds` | Stage 13 validation only | **No** — calculator ignores | Warning only; SF unchanged |
| Area → openings | Explicit opening tag | `openingTag` → `openingIds` | Stage 13 validation only | **No** — no deduction | Warning only; SF unchanged |
| Wall type SW* → sheathing system SW* | Plan schedule co-marking | **Not linked** in Stage 10 | — | — | Beckstead: systems and walls coexist without auto-bridge |
| Shear-wall wall → sheathing spec | Schedule + wall assembly | Split across wall + sheathing-system Evidence | Stage 7 vs Stage 10 separately | Wall path does not feed sheathing calc |

**D14 lens (investigative only):** Covered-wall and opening tags are **translations** of explicit plan associations. Area→system requires **explicit parentSystemTag** — the garage 575 SF case shows reader-learned area geometry **without** the ownership link Stage 10 requires, so the fact does not reach calculation despite existing on Evidence.

---

## 10. What Stage 14 actually calculates

**Single emitter:** `calculateSheathing` → one material line per qualifying area.

### Emitted material

| Material | Construction inputs | Formula | Software prerequisites | Skip / null conditions |
|---|---|---|---|---|
| **Sheathing coverage SF** (`sheathing.area` quantity key; described as wall/floor/roof sheathing) | `area.areaSquareFeet`; `system.application`; `system.panelSpecification.panelType`; `system.panelSpecification.thickness` | `quantity = areaSquareFeet` (SF); optional grade/span/exposure/edge in description only | Resolved traces for application, panelType, thickness, areaSquareFeet; valid `parentSystemId` → existing system; `isQuantityBlocked` false on `sheathing.area` and `sheathing.material` | Missing any required field or unresolved trace; unknown application; parent system missing; validation block; quantity ≤ 0 |

**Not emitted:** sheet count, panel each count, waste, linear feet of edge, fastener quantities, separate `sheathing.material` line (companion key in claim contracts — identity gates emission but only **area** line is emitted).

**Schema/domain fields not driving calc:** `layout`, `level`, `constructionPhase`, `coveredObjectIds`, `openingIds`, `specificationReference`, optional panel spec fields (included in description only when resolved).

**Wall sheathing quantity key** (`wall.sheathing`): declared **unsupported_capability** — no calculator.

---

## 11. Assumption registry

**No governed assumptions exist for sheathing.** `assumptionRegistry.ts` contains opening entries only.

Missing inputs that cause unresolved/blocked behavior (not filled by defaults):

- `areaSquareFeet` on sheathing-area
- `parentSystemTag` for area→system ownership
- `application`, `panelSpecification.panelType`, `panelSpecification.thickness` on sheathing-system
- Explicit sheathing-area subjects (Beckstead M.4)

---

## 12. Validation / authority dependencies

Stage 14 consults validation via `isQuantityBlocked(validation, [system.id, area.id], quantityKey)` for **`sheathing.area`** and **`sheathing.material`**.

| Stage 13 rule | Trigger | Blocks | Construction vs representation |
|---|---|---|---|
| `areaParentSystemResolved` | `parentSystemId` not in systems map | area + material | **Representation** — tag link missing (`SHS-UNRESOLVED`) |
| `systemAreasConsistent` | areaIds / parentSystemId mismatch | area + material | **Representation** |
| `applicationResolved` | `application === "unknown"` | **material only** (area key may still pass per validator) | Missing explicit application Evidence |
| `panelTypeResolved` | panelType null + unresolved trace | **material only** | Missing type Evidence |
| `thicknessResolved` | thickness null + unresolved trace | **material only** | Missing thickness Evidence |
| `areaSquareFeetResolved` | area SF null | **area** (material may still pass per validator) | Missing explicit SF |
| `coveredObjectsResolved` | dangling `coveredObjectIds` | **Neither** (warning; area canCalculate true) | Representation |
| `openingReferencesResolved` | dangling `openingIds` | **Neither** (warning) | Representation |

**Calculator also consults:** `isQuantityInputResolved` on traces for application, panelType, thickness, areaSquareFeet — unresolved trace method blocks emission even if scalar non-null.

**Not consulted:** confidence grades, Evidence relationship enums, `coveredObjectIds` / `openingIds` for math.

---

## 13. Minimum current calculator contract

| Sheathing material | Actual construction inputs used | Deterministic derivations currently performed | Other software prerequisites | Formula / behavior |
|---|---|---|---|---|
| **Sheathing coverage (SF)** | Explicit `areaSquareFeet`; panel type + thickness; application (label/classification) | Tag→ObjectId for parent/covered/opening (not used in math); `system.areaIds` backlink | `sheathing-system` + `sheathing-area` objects; area.parentSystemId resolves to existing system; resolved traces; validation not blocking area+material keys | `quantity = areaSquareFeet` SF; category `structural-panel` for osb/plywood tokens; **no opening deduction, no sheets, no waste** |

---

## Bottom line (factual)

### What work does Stage 10 perform?

Stage 10 **does not read walls, floors, roofs, openings, or geometry**. It converts **`sheathing-system` and `sheathing-area` Evidence** into `SheathingSystem` / `SheathingArea` domain objects with canonical `SHS-*` / `SHA-*` ObjectIds, resolves scalar panel specifications and explicit coverage SF, **translates** relationship tags (`parentSystemTag`, `coveredWallTag`, `openingTag`) into ObjectId pointers, links areas onto systems when explicit parent tags exist, and preserves partial objects when inputs are missing or conflicted.

It **does not** discover sheathing from wall geometry, **does not** derive area from length × height, **does not** pull panel specs from wall assembly fields, and **does not** create sheathing areas from floor/roof domains.

### Why does Beckstead produce zero sheathing?

**Combination**, dominated by **representation and calculator-input gaps**, not total reader failure:

1. **Missing sheathing-area subjects with explicit SF (M.4)** — six systems minted, zero areas; primary M.4 blocker (`EVIDENCE_MISSING`).
2. **Missing area→system ownership (wave5)** — `DOUBLE GARAGE` 575 SF minted but `parentSystemId = SHS-UNRESOLVED`; calculator skips before SF emission.
3. **No linked area for otherwise-complete systems (wave5 SW2 etc.)** — panel spec recovered on system; no sheathing-area + parentSystemTag → no pairing.
4. **Property-path / subjectKind stranding (M.4 and compiler paths)** — schedule sheathing on `wall.assembly.sheathing` or `assembly.sheathingType` never reaches Stage 10; M.4 combined `panelType` strings leave `thickness` null and `application` unknown.
5. **No derivation fallback** — wall length/height and floor/roof areas are upstream but **explicitly not consumed**; no assumption registry fills gaps.
6. **Validation blocking is secondary** — would reinforce failures on M.4 system identity and wave5 parent link, but the dominant failure is **no qualifying area↔system pair** reaching the calculator loop.
