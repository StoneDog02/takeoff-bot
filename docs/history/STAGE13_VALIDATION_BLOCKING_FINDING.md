# Stage 13 Validation / Blocking — Factual Finding

**Scope:** Current Stage 13 `validation` / `coordinateFramingValidation`, all domain validators, blocking contract, and Stage 14 calculator consumption.  
**Controlling principle under investigation:** Validators validate the engine's interpretation/calculation integrity — not the architect's design.  
**Authority:** Code, tests, and frozen Beckstead M.4 artifacts only. No KEEP/REMOVE recommendations. No replacement design.

**Primary files:**
- Stage wiring: [`createFramingStages.ts`](../src/framing/stages/createFramingStages.ts) (order 13)
- Coordinator: [`validation-coordinator.ts`](../src/framing/validators/validation-coordinator.ts)
- Rule IDs: [`rule-ids.ts`](../src/framing/validators/rule-ids.ts)
- Blocking helper: [`isQuantityBlocked.ts`](../src/framing/calculate/isQuantityBlocked.ts)
- Input resolution gate: [`isQuantityInputResolved.ts`](../src/framing/calculate/isQuantityInputResolved.ts)
- Issue/result builders: [`buildValidationBatch.ts`](../src/framing/validators/buildValidationBatch.ts), [`createValidationIssue.ts`](../src/framing/validators/createValidationIssue.ts)
- Stage 14 coordinator: [`calculation-coordinator.ts`](../src/framing/calculate/calculation-coordinator.ts)
- Pending claims from blocks: [`collectPendingClaims.ts`](../src/framing/claims/collectPendingClaims.ts)
- Beckstead artifact: `artifacts/b2.2m.4/runs/beckstead-audit-b/framing/13-validation.json`

---

## 1. Stage 13 input / output / wiring

### What Stage 13 receives (actual pipeline wiring)

Stage 13 `run()` in `createFramingStages.ts` reads **resolved domain payloads from Stages 7–12 only**:

| Input artifact / payload | Stage source |
|---|---|
| `wallFraming` | Stage 7 |
| `openings` | Stage 8 |
| `structuralMembers` | Stage 9 |
| `sheathing` | Stage 10 |
| `floorFraming` | Stage 11 |
| `roofFraming` | Stage 12 |

Stage 13 does **not** read in the main pipeline:

- Stage 6 `extractedEvidence` directly
- `userDecisionRunInput`
- `blocking`, `connectorsHardware`, `assumptions`, `framingScope` payloads
- Compiled pages, Project Dictionary, geometry artifacts, confidence

`coordinateFramingValidation` **can** run additional validators when those optional payloads are supplied (tests, future wiring), but **Beckstead M.4 Stage 13 executes only the six domains above**.

Cross-domain maps built inside validation:

- `buildWallsById`, `buildOpeningsById`, `buildStructuralMembersById` — for floor/roof/sheathing/openings reference checks
- `buildRelatedObjectMaps` / `relatedObjectsById` — for sheathing covered objects, structural member associations (when parent artifacts exist)

### What Stage 13 emits

`ValidationPayload` (`validationArtifactSchema`):

| Output field | Content |
|---|---|
| `validationIssues[]` | Failed rules: severity, ruleId, target, explanation, `quantityImpacts[]`, evidenceIds, reviewItemIds |
| `validationResults[]` | Per-rule outcomes: `passed` / `failed` / `skipped` for every rule evaluation |
| `reviewItems[]` | Human-facing review actions linked to issues (`origin: "validation"`) |

Each `validationIssue.quantityImpact` carries:

- `quantityKey` — stable string (e.g. `wall.studs`, `opening.king-studs`)
- `canCalculate: boolean` — **the only field Stage 14 calculators consult for suppression**
- `description` — human text; also used for pending-claim basis

Object-level vs quantity-level:

- **Object-level:** rules inspect scalar properties on one object (`wall.type.resolved`, `member.length.resolved`)
- **Relationship-level:** rules inspect ObjectId links (`wall.segment.parent.resolved`, `floor.area.parentSystem.resolved`)
- **Quantity-level impact:** `quantityImpacts` declare which quantity keys are calculable; calculators match on `(objectId set, quantityKey)`

### Where Stage 13 sits

```
Stages 7–12  resolved domain objects
      ↓
Stage 13     validation artifact (issues + results + review items)
      ↓
Stage 14     calculators (optional `validation` param → `isQuantityBlocked`)
      ↓
Stage 15     confidence (reads validation)
Stage 16     report (references validationIssueIds, reviewItemIds)
```

Stage 13 does not mutate resolved objects. It produces a parallel audit layer consumed optionally by Stage 14.

---

## 2. Complete validator inventory

**Executed in Beckstead M.4 pipeline:** wall, openings, structural members, sheathing, floor, roof (67 rule functions).  
**Implemented but not fed in M.4 Stage 13:** blocking, connectors-hardware, assumptions, framing-scope (27 additional rule functions).  
**Total implemented:** 94 rule functions across 10 validator modules.

Legend — **Blocks qty?**: any failure path with `canCalculate: false` for listed quantity key(s).  
**Severity** values used in code: `critical`, `blocking`, `warning`, `info`.

### Walls (`validateWallFraming`) — 7 rules

| Rule ID | Objects / properties | Trigger (fail) | Severity | Blocks qty? | Quantity keys |
|---|---|---|---|---|---|
| `wall.segment.parent.resolved` | `WallSegment.parentWallId` vs walls map | Parent wall ID missing | critical | Yes | `wall.studs`, `wall.plates` |
| `wall.segments.consistent` | `BuildingWall.segmentIds` ↔ `WallSegment.parentWallId` | Bidirectional segment list mismatch | critical | Yes | `wall.studs`, `wall.plates` |
| `wall.type.resolved` | `BuildingWall.wallType`; assembly stud/plate fields | `wallType === null` | critical | **Partial** | studs: false unless studSize+spacing resolved; plates: false unless plateCount resolved |
| `wall.height.resolved` | `assembly.heightFeet`, trace | Height null and trace not resolved | warning | **Partial** | `wall.sheathing` false; studs/plates **true** |
| `wall.geometry.length.resolved` | `WallSegment.lengthFeet`, trace | Length null and trace not resolved | blocking | Yes | `wall.studs`, `wall.plates` |
| `wall.location.resolved` | `BuildingWall.location` | `location === "unknown"` | warning | No | *(none)* |
| `wall.bearing.resolved` | `BuildingWall.bearingStatus` | `bearingStatus === "unknown"` | warning | No | *(none)* |

Note: `wall.sheathing` quantity key is declared in validation but **no wall calculator emits sheathing** — sheathing is Stage 10.

### Openings (`validateOpenings`) — 11 rules

| Rule ID | Objects / properties | Trigger (fail) | Severity | Blocks qty? | Quantity keys |
|---|---|---|---|---|---|
| `opening.parent.resolved` | `Opening.parentObjectId` vs parent map | Not schedule_definition and parent null/missing | critical | Yes | category-gated emit keys (framing, king-studs, rough-sill, cripples) |
| `opening.parentWall.resolved` | `Opening.parentWallId` vs parent map | Not schedule_definition and parentWall null/missing | critical | Yes | `opening.framing`, `opening.king-studs` (if eligible) |
| `opening.category.resolved` | `Opening.category` | `category === "unknown"` | critical | Yes | `opening.framing` |
| `opening.dimensions.nominal.resolved` | nominal width/height, traces | Either nominal dimension unresolved | critical | Yes | `opening.framing`, `opening.header` |
| `opening.dimensions.rough.resolved` | rough width/height; nominal fallback | Either rough dimension unresolved | warning | **Partial** | If nominal complete: framing true + category-gated; else framing false |
| `opening.header.reference.resolved` | `headerMemberId` vs structuralMembers map | Header ID set but member missing | critical | Yes | `opening.header` |
| `opening.quantity.resolved` | `quantity`, trace; identityRole | Not schedule_definition and quantity null/unresolved trace | critical | Yes | category-gated emit keys |
| `opening.jackStudCount.resolved` | category, quantity, parent, header, jackStudCount | King-stud-eligible + header linked + jack count not explicit | warning | Yes | `opening.jack-studs` only |
| `opening.kingStudCount.default` | category, quantity, parent, kingStudCount | King-stud-eligible + default-of-2 used | warning | No | `opening.king-studs` **true** (review only) |
| `opening.roughSillSize.default` | sill-eligible category, rough width | Default sill inheritance | warning | No | `opening.rough-sill` **true** |
| `opening.crippleLayout.default` | cripple-eligible category, rough width | Default cripple layout continuation | warning | No | cripples **true** |

### Structural members (`validateStructuralMembers`) — 10 rules

| Rule ID | Objects / properties | Trigger (fail) | Severity | Blocks qty? | Quantity keys |
|---|---|---|---|---|---|
| `member.category.resolved` | `category` | `category === "unknown"` | critical | Yes | `member.material`, `member.length` |
| `member.material.resolved` | `materialType`, trace | materialType null/unresolved | critical | Yes | `member.material` |
| `member.size.resolved` | `size`, trace | size null/unresolved | critical | Yes | `member.material` |
| `member.length.resolved` | `lengthFeet`, trace | length null/unresolved | critical | Yes | `member.length` |
| `member.quantity.resolved` | `quantity`, trace | quantity null or trace `unresolved` | critical | Yes | `member.material` |
| `member.plyCount.resolved` | `category`, `plyCount` | built-up-member and plyCount unresolved | critical | Yes | `member.material` |
| `member.associatedObjects.resolved` | `associatedObjectIds` vs map | Non-empty refs and dangling ID | warning | No | `member.material` **true** |
| `member.supportedObjects.resolved` | `supportedObjectIds` vs map | Non-empty refs and dangling ID | critical | Yes | `member.length` |
| `member.supportingObjects.resolved` | `supportingObjectIds` vs map | Non-empty refs and dangling ID | critical | Yes | `member.length` |
| `member.connectors.resolved` | `connectorIds` vs map | Non-empty refs and dangling ID | warning | No | `member.material` **true** |

Calculator emits only `member.material` (LF); blocking `member.length` also suppresses material via dual-key check.

### Sheathing (`validateSheathing`) — 8 rules

| Rule ID | Objects / properties | Trigger (fail) | Severity | Blocks qty? | Quantity keys |
|---|---|---|---|---|---|
| `sheathing.area.parentSystem.resolved` | `SheathingArea.parentSystemId` | Parent system missing | critical | Yes | `sheathing.area`, `sheathing.material` |
| `sheathing.system.areas.consistent` | system `areaIds` ↔ area `parentSystemId` | Bidirectional mismatch | critical | Yes | both |
| `sheathing.system.application.resolved` | `application` | `application === "unknown"` | critical | **Partial** | `sheathing.material` false; `sheathing.area` **true** |
| `sheathing.system.panelType.resolved` | `panelSpecification.panelType` | panelType null/unresolved | critical | **Partial** | material false; area true |
| `sheathing.system.thickness.resolved` | `panelSpecification.thickness` | thickness null/unresolved | critical | **Partial** | material false; area true |
| `sheathing.area.areaSquareFeet.resolved` | `areaSquareFeet`, trace | SF null/unresolved | critical | **Partial** | area false; material **true** |
| `sheathing.area.coveredObjects.resolved` | `coveredObjectIds` vs map | Dangling refs | warning | No | area **true** |
| `sheathing.area.openings.resolved` | `openingIds` vs map | Dangling refs | warning | No | area **true** |

### Floor framing (`validateFloorFraming`) — 14 rules

| Rule ID | Objects / properties | Trigger (fail) | Severity | Blocks qty? | Quantity keys |
|---|---|---|---|---|---|
| `floor.area.parentSystem.resolved` | `FloorFramingArea.parentSystemId` | Parent missing OR inferred parent trace (`supported-inference`) | critical / warning | Yes / No | critical fail: both joist keys false; inference warning: both **true** |
| `floor.system.areas.consistent` | system `areaIds` ↔ area parent | Bidirectional mismatch | critical | Yes | `floor.joists`, `floor.joist-linear-feet` |
| `floor.system.assembly.joistType.resolved` | `assembly.joistType` | null/unresolved | critical | Yes | both |
| `floor.system.assembly.joistSize.resolved` | `assembly.joistSize` | null/unresolved | critical | Yes | both |
| `floor.system.assembly.joistSpacing.resolved` | `assembly.joistSpacingInches` | null/unresolved | critical | Yes | both |
| `floor.area.spanDirection.resolved` | span direction / layout-axis authority | No layout-axis authority | critical | Yes | both |
| `floor.area.joistLayoutLength.resolved` | `joistLayoutLengthFeet` | null/unresolved | critical | Yes | both |
| `floor.area.joistMemberLength.resolved` | `joistMemberLengthFeet` | null/unresolved | warning | **Partial** | joists **true**; LF **false** |
| `floor.area.areaSquareFeet.resolved` | `areaSquareFeet` | null/unresolved | warning | No | both **true** |
| `floor.area.joistLinearFeet.type.supported` | parent system joistType | Type resolved but not simple-area LF allowlist | warning | **Partial** | joists **true**; LF **false** |
| `floor.area.boundingWalls.resolved` | `boundingWallIds` | Dangling refs when wall map supplied | warning | No | both **true** |
| `floor.area.openings.resolved` | `openingIds` | Dangling refs | warning | No | both **true** |
| `floor.area.structuralMembers.resolved` | `structuralMemberIds` | Dangling refs | warning | No | both **true** |

### Roof framing (`validateRoofFraming`) — 13 rules

| Rule ID | Objects / properties | Trigger (fail) | Severity | Blocks qty? | Quantity keys |
|---|---|---|---|---|---|
| `roof.plane.parentSystem.resolved` | `RoofPlane.parentSystemId` | Parent missing (incl. `RFS-UNRESOLVED`) | critical | Yes | `roof.common-rafters` |
| `roof.system.planes.consistent` | system `planeIds` ↔ plane parent | Bidirectional mismatch | critical | Yes | common-rafters |
| `roof.system.assembly.framingType.resolved` | `assembly.framingType` | null/unresolved | critical | Yes | common-rafters |
| `roof.system.assembly.framingType.commonRafterEligible` | framingType token | Resolved but not stick-rafter eligible | warning | Yes | common-rafters **false** |
| `roof.system.assembly.memberSize.resolved` | `memberSize` | null/unresolved | critical | Yes | common-rafters |
| `roof.system.assembly.memberSpacing.resolved` | `memberSpacingInches` | null/unresolved | critical | Yes | common-rafters |
| `roof.plane.spanDirection.resolved` | `spanDirection` | null/unresolved | critical | Yes | common-rafters |
| `roof.plane.rafterLayoutLength.resolved` | `rafterLayoutLengthFeet` | null/unresolved | critical | Yes | common-rafters |
| `roof.plane.pitch.resolved` | `pitch` | null/unresolved | warning | No | common-rafters **true** |
| `roof.plane.areaSquareFeet.resolved` | `areaSquareFeet` | null/unresolved | warning | No | common-rafters **true** |
| `roof.plane.boundingWalls.resolved` | `boundingWallIds` | Dangling refs | warning | No | common-rafters **true** |
| `roof.plane.openings.resolved` | `openingIds` | Dangling refs | warning | No | common-rafters **true** |
| `roof.plane.structuralMembers.resolved` | `structuralMemberIds` | Dangling refs | warning | No | common-rafters **true** |

### Implemented but not executed in M.4 Stage 13

**Blocking (6 rules):** `blocking.type/material/size/location/associatedObjects` — blocks `blocking.material` / `blocking.quantity` when payload supplied; no Stage 14 blocking calculator wired in main pipeline.

**Connectors & hardware (8 rules):** connector/hardware/fastener type + association checks — blocks `connector.material`, `hardware.material`, `fastener.material`; fastener calc only runs when connectors payload passed to Stage 14 (not in M.4 pipeline).

**Assumptions (7 rules):** policy/review/approval/source/conflict checks on `Assumption` objects — can block affected quantity keys listed on assumption.

**Framing scope (6 rules):** snapshot integrity — dangling validation/confidence/review ID refs; **no quantity impacts**.

---

## 3. Blocking mechanism

### End-to-end path

```
Domain validator rule fails
  → buildFailedBatch(createValidationIssue + createReviewItem)
  → validationIssue.quantityImpacts[] with canCalculate: false
  → merged into ValidationPayload.validationIssues
  → Stage 14 calculator calls isQuantityBlocked(validation, objectIds[], quantityKey)
  → if true: return null (no material line)
  → collectPendingClaims may admit BLOCKED_MISSING_REQUIRED_INPUT pending claim
```

### `isQuantityBlocked` contract (exact)

From [`isQuantityBlocked.ts`](../src/framing/calculate/isQuantityBlocked.ts):

1. If `validation` is **undefined**, never blocked (calculators run without Stage 13).
2. Match issue where `issue.target.kind === "object"` AND `issue.target.objectId` is in the calculator's contributing object ID set.
3. Match `quantityImpact.quantityKey === quantityKey` AND `canCalculate === false`.
4. Unrelated issues on other objects or other quantity keys do **not** suppress.

**Severity does not participate.** A `warning` with `canCalculate: false` blocks the same as `critical`.

**Review item `blockingStatus` does not participate** in calculator suppression — only `quantityImpacts.canCalculate`.

### Object ID participation

Calculators pass contributing IDs per quantity:

| Calculator | Typical ID set passed to `isQuantityBlocked` |
|---|---|
| Wall studs/plates | `[wall.id, segment.id]` |
| Opening framing | `[opening.id, wall.id, segment.id]` and/or `[opening.id]` |
| Floor/roof/sheathing area | `[system.id, area/plane.id]` |
| Structural member | `[member.id]` — blocks if **either** `member.material OR member.length` blocked |

### Calculator independent guards

Even when validation passes, calculators skip when:

- `isQuantityInputResolved` fails (null value OR trace `method === "unresolved"`)
- Domain-specific gates (e.g. `isStickCommonRafterFramingType`, `isWoodStudWall`, opening category eligibility)
- Parent/system membership checks (`system.planeIds.includes(plane.id)`)
- Numeric guards (`quantity <= 0`, non-finite)

---

## 4. Classify each validation rule (factual)

| Class | Description | Example rules |
|---|---|---|
| **A — Construction input usability** | Required spacing/dimension/spec absent for attempted formula | `wall.geometry.length.resolved`, `floor.area.joistLayoutLength.resolved`, `opening.quantity.resolved`, `member.length.resolved`, `sheathing.area.areaSquareFeet.resolved` |
| **B — Mathematical / software invariant** | Impossible numeric state or duplicate-output contract | *(none explicit)* — numeric positivity enforced in calculators, not validators |
| **C — Construction interpretation conflict** | Mutually incompatible evidenced interpretations | *(minimal)* — segment/wall consistency could reflect conflicting segment ownership |
| **D — Representation / relationship consistency** | Parent ObjectId, backlink, dangling pointer | `wall.segment.parent.resolved`, `floor.area.parentSystem.resolved`, `opening.header.reference.resolved`, `member.supportedObjects.resolved`, `sheathing.system.areas.consistent` |
| **E — Authority / trace / lifecycle** | Value present but trace/identity lifecycle unsatisfied | `opening.quantity.resolved` (trace `unresolved`); floor inferred-parent warning path |
| **F — Design / construction-practice judgment** | Judging architect's specification reasonableness | **None identified** — rules check resolution/eligibility, not code compliance |
| **G — Other** | Review-only defaults; calculator-family gates | `opening.kingStudCount.default`, `roof.system.assembly.framingType.commonRafterEligible`, `floor.area.joistLinearFeet.type.supported` |

Many rules span **A + D** (e.g. missing parent system is both unusable for area→system calculator loop and internal link failure).

---

## 5. Construction requirement vs software prerequisite

| Material / quantity | Actual construction/math requirements | Stage 13 validation requirements | Other software prerequisites | If prerequisite fails |
|---|---|---|---|---|
| **Wall studs (each)** | segment length; stud spacing; stud size | length resolved; optional type/parent/consistency blocks | segment on wall; `isQuantityInputResolved` on three fields | No line item |
| **Wall plates (LF)** | segment length; plate count | same family as studs | same | No line item |
| **Opening king studs** | category eligible; quantity; parent segment; stud size (via wall) | parent, category, quantity, nominal dims; king default warning only | wood stud wall; king count explicit or assumption path | No line / assumption path |
| **Opening jack studs** | explicit `jackStudCount`; header link for eligibility | jack count unresolved warning blocks | header + eligibility gate | pending claim or skip |
| **Opening rough sill (LF)** | rough width; quantity; sill-eligible category | rough dims (warning if nominal fallback) | stud size on wall | No line |
| **Opening cripples** | rough height/width; category; wall height context | cripple default warnings only (non-blocking) | layout assumption in calculator | assumption + line or skip |
| **Structural member LF** | category; material; size; length; quantity; ply if built-up | same fields resolved; supported/supporting refs if set | materialType not `unknown` | No line |
| **Sheathing SF** | area SF; application; panel type; thickness | area SF; parent link; consistency | system↔area membership in calculator | No line |
| **Floor joists (each)** | layout length; spacing; joist size/type; layout axis | same + parent system + span authority | area linked to system; non-slab compatibility | No line |
| **Floor joist LF** | member length; simple-area joist type | member length warning block; type-support warning | `isSimpleAreaJoistLinearFeetTypeSupported` | count may emit; LF skipped |
| **Roof common rafters (each)** | layout length; spacing; member size; stick framing type; span direction | same + parent plane link + stick eligibility | `isStickCommonRafterFramingType`; plane in system.planeIds | No line |

---

## 6. Beckstead blocking audit (M.4 frozen)

**Artifact:** `13-validation.json` — **480 issues**, **480 review items**, **1172 validation results**.  
**Stage 14 output:** **52 material lines** (26 stud + 26 plate). **0 pending claims** from validation blocks.

**Critical re-run result:** `coordinateFramingCalculations` with vs without `validation` produces **identical 52 materials**. **Zero** Beckstead material lines are suppressed solely by Stage 13 blocking.

### By domain

| Domain | Objects validated | Top blocking rules (issue count) | Qty keys marked blocked | Lines suppressed by Stage 13 | Absent for other reasons |
|---|---|---|---|---|---|
| **WALLS** | 42 walls, 26 segments | height (42), location (42), bearing (38), length (11), type (11) | studs 22, plates 22, sheathing 42 | **0** — 26 segments emit; blocked issues target non-emitting segments | Segments without length/spacing never reach calculator |
| **OPENINGS** | 57+ openings | rough dims (57), nominal (55), category (35), parent (30), quantity (23) | framing 274, header 55, king 57, … | **0** | Missing parent/dims/quantity; calculator skips independently |
| **STRUCTURAL MEMBERS** | 11 members | quantity (11), length (10) | material 28, length 16 | **0** | All members missing length and/or quantity in resolved objects |
| **SHEATHING** | systems + areas | parent (12), area SF, panel specs | material 12, area blocked on areas | **0** | Missing area SF, parent links, application (`unknown`) |
| **FLOOR FRAMING** | systems + areas | parent (8), member length (8), layout/span | joists 27, LF 35 | **0** | No layout length / parent links on frozen artifact |
| **ROOF FRAMING** | 5 systems, 2 planes | parent (17), framingType, layout, span | common-rafters 17 | **0** | Truss construction + missing stick-rafter inputs; calculator path absent |

**Removing Stage 13 alone would not add any Beckstead material line** — verified by re-running Stage 14 without validation payload.

---

## 7. False-negative / representation blocking (proved)

Examples where construction/math inputs exist for the formula but validation suppresses output **beyond** calculator guards.

### Example 1 — Dangling supported-object reference (proved in code)

**Setup:** Structural member with `lengthFeet=16`, `quantity=2`, all category/material/size traces resolved; `supportedObjectIds: ["W-MISSING"]`.

| Step | Result |
|---|---|
| Known construction | 16 ft × 2 = 32 LF member material |
| Representation | Supported-object pointer dangling |
| Validation | `member.supportedObjects.resolved` → `member.length` `canCalculate: false` |
| Calculator without validation | **1 material line** emitted |
| Calculator with validation | **0 lines** |

Formula does **not** read `supportedObjectIds`. Block is **D — representation consistency** applied to a quantity the calculator does not consume.

### Example 2 — Selective validation block with complete inputs (test contract)

**Setup:** [`wall-framing.calculator.test.ts`](../tests/core/wall-framing.calculator.test.ts) — complete wall payload; artificial issue blocking only `wall.studs`.

| Step | Result |
|---|---|
| Calculator without validation | studs + plates emit |
| Calculator with validation | plates emit (60 LF), **studs suppressed** |

Proves mechanism: validation can block one quantity key while inputs exist. This is **intentional quantity-scoped blocking**, not missing construction — used to prove contract, not Beckstead data.

### Example 3 — Floor area with complete joist inputs but wrong parent ID

**Setup:** [`floor-framing.validator.test.ts`](../tests/core/floor-framing.validator.test.ts) — area has layout 20 ft, span, spacing; `parentSystemId: "FFS-MISSING"`.

| Step | Result |
|---|---|
| Validation | Blocks joists |
| Calculator | **Also 0** — cannot resolve system without parent link |

**Not a false-negative** — calculator requires same parent link. Construction inputs present on area object but **system pairing** missing.

### Beckstead

**No proved Beckstead case** where validation alone suppresses a line the calculator would emit with frozen artifacts.

---

## 8. Legitimate safety blocking (proved)

| Example | Formula | Value absent? | Derivable? | Assumption exists? | Without Stage 13 block | Calculator guards anyway? |
|---|---|---|---|---|---|---|
| Segment length null | wall studs `ceil(L×12/spacing)+1` | Yes — no length on segment | No in Stage 7 | No | Skip (null length) | **Yes** — `isQuantityInputResolved(lengthFeet)` |
| Opening quantity null | all opening quantities × count | Yes | No | King stud default only | Skip | **Yes** |
| Member length null | LF = length × qty × ply | Yes on Beckstead members | No | No | Skip | **Yes** |
| Sheathing area SF null | SF = areaSquareFeet | Yes on Beckstead areas | No | No | Skip | **Yes** |
| Roof truss framingType | common rafter count | Truss type present; stick path wrong | N/A | No | Skip | **Yes** — `isStickCommonRafterFramingType` |
| Jack stud count missing | jack studs × quantity | Yes when header linked | No registry entry | **No** | pending claim | **Yes** — explicit count required |

Stage 13 and Stage 14 **align** on Beckstead for all absent-output domains — double gate, not conflicting gate.

---

## 9. Validation vs calculator duplication

| Check | Stage 13 | Stage 14 | Unique to Stage 13? |
|---|---|---|---|
| Null / unresolved input | `isPropertyResolved` / null checks on objects | `isQuantityInputResolved` (null + trace `unresolved`) | Partial overlap — calculator is final gate |
| Quantity blocked | `quantityImpacts.canCalculate: false` | `isQuantityBlocked()` | **Yes** — only validation produces review items + pending claims |
| Parent system exists | `*.parentSystem.resolved` | `systemsById.get(parentSystemId)` + membership arrays | Calculator skips silently; validation records issue |
| Stick/truss eligibility | `roof.framingType.commonRafterEligible` | `isStickCommonRafterFramingType` | Duplicate — both block truss rafter count |
| Joist LF type support | `floor.joistLinearFeet.type.supported` | `isSimpleAreaJoistLinearFeetTypeSupported` | Duplicate |
| Sheathing application unknown | `sheathing.application.resolved` | `application === "unknown"` check | Duplicate |
| Opening category / parent | opening parent/category rules | eligibility functions in calculator | Calculator would skip; validation adds review surface |
| Numeric positivity | — | `quantity <= 0` / `emitLineItem` | **Calculator only** |

**Stage 14 is already safe** against most null/missing inputs without Stage 13. Stage 13 adds **declarative quantity-scoped blocks**, **review items**, **validation results audit trail**, and **pending-claim admission** from blocked keys.

---

## 10. Warnings / review / blocking

| Concept | Behavior |
|---|---|
| **warning severity** | Can still set `canCalculate: false` → **blocks material** (e.g. `roof.framingType.commonRafterEligible`, `opening.jackStudCount.resolved`) |
| **critical / blocking severity** | Same blocking mechanism via `canCalculate` |
| **review item** | Always paired with failed validation issue; may exist while material still calculates if `canCalculate: true` |
| **reviewStatus** | `review-required`, `review-recommended` — informational for humans; not consulted by calculators |
| **blockingStatus** on review item | `blocked`, `partially-blocked`, `not-blocked` — drives review UX reason; **not** consulted by `isQuantityBlocked` |
| **unresolved trace** | Blocks calculator via `isQuantityInputResolved`; may also fail validation rules |
| **assumption** | Validated only if assumptions payload supplied; not in M.4 Stage 13 |
| **confidence** | Stage 15 — separate from validation blocking |

**Can a warning block material?** **Yes** — when `canCalculate: false`.  
**Can review exist while material calculates?** **Yes** — e.g. king stud default, pitch missing on roof, inferred floor parent.  
**Does unresolved always mean blocked?** **In calculators:** yes for that property path. **In validation:** only if rule sets `canCalculate: false`.  
**Does validation turn uncertainty into absence?** **Only** when `canCalculate: false` and calculator would otherwise emit — proved in tests; **not on Beckstead frozen run**.

Developer diagnostics (validation results skipped/passed counts) and human review items are co-emitted in the same artifact.

---

## 11. Authority / claim / trace dependencies

Stage 13 consults **resolution traces** via `isPropertyResolved` (validator) — distinct from calculator's `isQuantityInputResolved`:

| Trace state | Validator | Calculator |
|---|---|---|
| Property null, no trace | Fail resolved rules | Skip |
| Property present, trace `unresolved` | May pass if value present (validator checks null OR unresolved via `isPropertyResolved`) | **Skip** — explicit `unresolved` blocks |
| Property present, trace `evidence` / `explicit` | Pass | Calculate |

**Evidence IDs** on objects are collected into issues/results for provenance — they do **not** change blocking logic directly.

**Claim / candidacy / completion / confidence** — not read by Stage 13 validators. Stage 15 confidence reads validation output afterward.

**User decisions** — not consumed by Stage 13 in pipeline wiring.

**Assumption registry** — consulted in Stage 14 calculators for opening defaults; assumption **validator** runs only when assumptions payload supplied.

---

## 12. Cross-domain validation

| Rule family | Construction relationship | Internal representation required | Blocks if fails | Formula requires it? |
|---|---|---|---|---|
| Opening → wall/segment | Opening hosted in wall run | `parentObjectId`, `parentWallId` | opening framing quantities | **Yes** — calculator needs segment for stud size/spacing |
| Opening → header member | Header carries opening load | `headerMemberId` → structural member exists | `opening.header` | Header quantity uses member object |
| Sheathing area → system | Sheathing spec applies to area | `parentSystemId` + `system.areaIds` | sheathing area/material | **Yes** — calculator pairs area+system |
| Floor/roof area → system | Joist/rafter spec owns bay | same pattern | joist/rafter quantities | **Yes** |
| Floor/roof → walls/openings/members | Optional spatial associations | `boundingWallIds`, etc. | **No** (warnings only) | **No** — not in count formulas |
| Structural member → supported objects | Load path / span context | `supportedObjectIds` resolve | `member.length` (also blocks material) | **No** in current LF formula |
| Wall segment → wall | Segment is part of wall | `parentWallId`, `segmentIds` | studs/plates | **Yes** — segment length on child |

**D14 lens:** Beckstead roof truss information is understood on Evidence before Stage 12, but plane→system link failure is **representation** — however Beckstead roof output is primarily blocked by **missing calculator path and stick-rafter inputs**, not validation alone.

---

## 13. What Stage 13 does NOT do

Supported by code:

- Does **not** derive missing construction inputs
- Does **not** invoke assumption registry or fill defaults (except flagging default-assumption review items for openings)
- Does **not** calculate quantities
- Does **not** resolve reader/Evidence conflicts (marks conflicts upstream in resolvers; validation checks resulting object state)
- Does **not** improve geometry
- Does **not** determine complete material scope or Material Taxonomy coverage
- Does **not** judge code compliance or architect design quality
- Does **not** run blocking/connectors/assumptions/framing-scope validators in M.4 pipeline (modules exist, payloads not wired)
- Does **not** mutate resolved domain objects

---

## 14. Minimum factual validation contract

### TABLE A — Blocking that protects actual calculation inputs

| Rule | Domain | Construction/math protected | Material | Calculator also guards? |
|---|---|---|---|---|
| `wall.geometry.length.resolved` | Wall | segment length for spacing count | studs, plates | Yes |
| `wall.type.resolved` (partial) | Wall | stud size/spacing when type missing | studs, plates | Yes |
| `opening.parent.resolved` | Opening | hosted opening location | opening framing | Yes |
| `opening.quantity.resolved` | Opening | opening count multiplier | all opening qty | Yes |
| `opening.dimensions.nominal.resolved` | Opening | opening size | framing, header | Yes |
| `member.length.resolved` | Structural | member span | material LF | Yes |
| `member.quantity.resolved` | Structural | member count | material LF | Yes |
| `sheathing.area.areaSquareFeet.resolved` | Sheathing | coverage area | sheathing SF | Yes |
| `floor.area.joistLayoutLength.resolved` | Floor | bay length for joist count | joists | Yes |
| `roof.plane.rafterLayoutLength.resolved` | Roof | bay length for rafter count | common rafters | Yes |
| `roof.system.assembly.framingType.commonRafterEligible` | Roof | stick vs truss family | common rafters | Yes (`isStickCommonRafterFramingType`) |

### TABLE B — Blocking caused by representation / lifecycle requirements

| Rule | Domain | Internal requirement | Material | Construction present? | Failure behavior |
|---|---|---|---|---|---|
| `wall.segment.parent.resolved` | Wall | segment parent wall exists | studs, plates | Length may exist on orphan segment | Block + review |
| `floor.area.parentSystem.resolved` | Floor | area→system ObjectId | joists, LF | Joist fields may exist on area | Block + review |
| `roof.plane.parentSystem.resolved` | Roof | plane→system link | common rafters | Pitch/spacing may exist | Block + review |
| `sheathing.area.parentSystem.resolved` | Sheathing | area→system link | area, material | Panel spec may exist on system | Block + review |
| `member.supportedObjects.resolved` | Structural | supported IDs resolve | material (via length key) | **Length/qty can be present** | Block material despite calculable LF |
| `opening.header.reference.resolved` | Opening | header member ID valid | header | Opening otherwise complete | Block header only |
| `floor.area.parentSystem.resolved` (inference) | Floor | confirm inferred parent | joists, LF | Values present | Review only — **does not block** |

### TABLE C — Non-blocking validation / diagnostics

| Rule | Domain | Purpose | Severity | Downstream effect |
|---|---|---|---|---|
| `wall.location.resolved` | Wall | interior/exterior classification | warning | Review item only |
| `wall.bearing.resolved` | Wall | bearing classification | warning | Review item only |
| `wall.height.resolved` | Wall | height for sheathing (not wall calc) | warning | Blocks `wall.sheathing` key only (no wall calc emitter) |
| `opening.kingStudCount.default` | Opening | default king count disclosure | warning | Material may emit with assumption |
| `opening.roughSillSize.default` | Opening | sill size inheritance disclosure | warning | Material may emit |
| `opening.crippleLayout.default` | Opening | cripple layout disclosure | warning | Material may emit with assumption |
| `floor.area.areaSquareFeet.resolved` | Floor | SF review (not in count formula) | warning | No calc effect |
| `roof.plane.pitch.resolved` | Roof | pitch review (not in count formula) | warning | No calc effect |
| `*.boundingWalls/openings/structuralMembers.resolved` | Floor/roof/sheathing | dangling optional refs | warning | No calc effect |
| `member.associatedObjects.resolved` | Structural | dangling optional refs | warning | No calc effect |

---

## Bottom line (factual)

### 1. What unique production capability does Stage 13 provide?

A **declarative, quantity-key-scoped audit layer** between resolved objects and Stage 14: it records pass/fail/skip per rule, attaches **review items** for humans, marks **`canCalculate`** per quantity key, and feeds **pending claims** / Stage 15 confidence — without modifying domain objects.

### 2. How much blocking protects calculation inputs vs representation?

**Both**, but with different effects on Beckstead:

- **Input-usability rules** (class A) mirror calculator null/trace gates — legitimate double protection.
- **Representation rules** (class D) include cases like **`member.supportedObjects.resolved`** where construction numbers exist but internal pointers block output the formula does not use.
- On **Beckstead M.4**, all absent materials are explained by **missing calculator inputs or missing calculator paths first**; validation records many issues but **suppresses zero additional lines**.

### 3. Which calculators safely refuse unusable inputs without Stage 13?

**All current emitters** — wall, opening, structural, sheathing, floor, roof — use `isQuantityInputResolved` and domain gates that skip null/unresolved/wrong-family inputs independently. Beckstead proves Stage 14 output is **identical with validation omitted**.

### 4. Which Beckstead lines are genuinely suppressed by Stage 13?

**None.** 52 wall stud/plate lines emit with or without validation. Zero floor, opening, structural, sheathing, roof lines emit in either mode.

### 5. Does Stage 13 validate interpretation/math, enforce architecture, or judge design?

**Combination of interpretation/input integrity (A, E) and internal representation consistency (D)**, plus **calculator-family eligibility flags (G)**. It does **not** judge architect design (no class F rules identified). It **does** enforce software relationship contracts beyond what several formulas require.

### 6. What validation behavior is necessary for existing calculators to avoid incorrect output?

For **numeric correctness on present inputs**, Stage 14's own guards are sufficient on Beckstead. Stage 13 **selective quantity blocking** (tests in `wall-framing.calculator.test.ts`, `calculation-coordinator.test.ts`) is necessary for the **contract** that validation can suppress one quantity key without suppressing unrelated keys on the same object — a capability calculators do not infer themselves. Representation blocks (e.g. dangling supported objects) prevent output the calculator **would** emit, serving **conservative interpretation policy**, not formula math.
