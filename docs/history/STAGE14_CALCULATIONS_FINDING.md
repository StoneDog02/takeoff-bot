# Stage 14 Calculations — Factual Finding

**Scope:** Current Stage 14 `calculations` / `coordinateFramingCalculations` and all domain calculator modules.  
**Controlling architecture:** `UPLOAD PDF → READ THE PLANS → CALCULATE / DERIVE / ASSUME → MATERIAL TAXONOMY OUTPUT`  
**Purpose:** Determine what genuine construction/takeoff intelligence exists in the calculator layer, what it requires, what old-pipeline dependencies attach to it, and what can be carried into a minimum reset without expanding domain capability.  
**Authority:** Code, tests, and frozen Beckstead artifacts only. No replacement design. No implementation recommendations.

**Primary files:**
- Stage wiring: [`createFramingStages.ts`](../src/framing/stages/createFramingStages.ts) (order 14)
- Coordinator: [`calculation-coordinator.ts`](../src/framing/calculate/calculation-coordinator.ts)
- Calculators: [`calculateWallFraming.ts`](../src/framing/calculate/calculateWallFraming.ts), [`calculateOpeningFraming.ts`](../src/framing/calculate/calculateOpeningFraming.ts), [`calculateStructuralMembers.ts`](../src/framing/calculate/calculateStructuralMembers.ts), [`calculateSheathing.ts`](../src/framing/calculate/calculateSheathing.ts), [`calculateFloorFraming.ts`](../src/framing/calculate/calculateFloorFraming.ts), [`calculateRoofFraming.ts`](../src/framing/calculate/calculateRoofFraming.ts), [`calculateFasteners.ts`](../src/framing/calculate/calculateFasteners.ts)
- Helpers: [`netStudDeduction.ts`](../src/framing/calculate/netStudDeduction.ts), [`isQuantityInputResolved.ts`](../src/framing/calculate/isQuantityInputResolved.ts), [`isQuantityBlocked.ts`](../src/framing/calculate/isQuantityBlocked.ts)
- Assumptions: [`assumptionRegistry.ts`](../src/framing/claims/assumptionRegistry.ts), [`collectPendingClaims.ts`](../src/framing/claims/collectPendingClaims.ts)
- Quantity contracts: [`claimContracts.ts`](../src/framing/claims/claimContracts.ts), [`rule-ids.ts`](../src/framing/validators/rule-ids.ts)
- Material schema: [`material.schema.ts`](../src/framing/schemas/material.schema.ts)
- Beckstead: `artifacts/b2.2m.4/runs/beckstead-audit-b/framing/14-calculations.json`; fixture path in [`beckstead-m6-frozen-pipeline.test.ts`](../tests/framing/beckstead-m6-frozen-pipeline.test.ts)

---

## 1. Stage 14 wiring

### What Stage 14 receives (M.4 pipeline)

Stage 14 `run()` loads from pipeline context:

| Input | Stage source | Passed to coordinator? |
|---|---|---|
| `wallFraming` | Stage 7 | Yes |
| `openings` | Stage 8 | Yes (also passed into wall + opening calculators) |
| `structuralMembers` | Stage 9 | Yes |
| `sheathing` | Stage 10 | Yes |
| `floorFraming` | Stage 11 | Yes |
| `roofFraming` | Stage 12 | Yes |
| `validation` | Stage 13 | Yes |
| `connectorsHardware` | *(no stage in M.4)* | **No** |
| `blocking` | *(no stage in M.4)* | **No** |
| `assumptions` artifact | *(not a stage payload)* | **No** |
| Stage 6 Evidence | — | **No** (only resolved domain objects) |

Opening calculator **requires both** `openings` and `wallFraming`; coordinator skips opening calc if either is absent.

### What Stage 14 emits

`FramingCalculationsPayload` (`framingCalculationsPayloadSchema`):

| Field | Content |
|---|---|
| `materials[]` | `FramingMaterialLineItem` — id, quantityKey, category, description, canonicalClassification, quantity, unit, sourceObjectIds, assumptionIds, reviewItemIds, optional claimStatus |
| `assumptions[]` | `Assumption` objects created during opening calculations only |
| `pendingClaims[]` | `PendingMaterialClaim` — blocked/unwired quantity keys without material lines |

Post-processing in coordinator:

1. Concatenate domain calculator outputs (no merge/dedupe).
2. `collectPendingClaims` — validation-blocked keys + calculator-explicit pending (jack studs) + unwired capability markers.
3. `deriveMaterialClaimStatus` — attach claimStatus to materials lacking one, from related assumptions.

### Downstream consumers

| Stage | Consumes |
|---|---|
| Stage 15 `confidence` | calculations + validation |
| Stage 16 `report` | `calculations.materials`, `pendingClaims` |

### Exact flow

```
Resolved domain payloads (Stages 7–12)
        ↓
coordinateFramingCalculations
        ├─ calculateWallFraming(wall, validation, openings)
        ├─ calculateOpeningFraming(openings, wall, validation) → materials + assumptions + pendingClaims
        ├─ calculateStructuralMembers(members, validation)
        ├─ calculateFloorFraming(floor, validation)
        ├─ calculateRoofFraming(roof, validation)
        ├─ calculateSheathing(sheathing, validation)
        └─ calculateFasteners(connectorsHardware, validation)  [only if payload supplied]
        ↓
collectPendingClaims(validation, materials, explicitPendingClaims, candidacyContext)
        ↓
deriveMaterialClaimStatus on each material line
        ↓
14-calculations.json artifact
```

**Coordinator order:** Wall → Opening → Structural → Floor → Roof → Sheathing → Fasteners.

---

## 2. Complete calculator inventory

**Implemented calculator modules:** 7. **Wired in M.4 Stage 14:** 6 (all except fasteners). **No `calculateBlocking` module exists** — blocking has validator + quantity keys only.

### Walls — `calculateWallFraming`

| Quantity key | Description | Construction inputs | Formula | Eligibility | Skip if | Validation | Assumption | Unit |
|---|---|---|---|---|---|---|---|---|
| `wall.studs` | Regularly spaced studs | `segment.lengthFeet`; `wall.assembly.studSpacingInches`; `wall.assembly.studSize` | `baseline = ceil(L×12/spacing)+1`; optional net deduction from openings | Segment has parent wall in map | Any input null/unresolved trace; validation block; overlap blocks deduction only | `isQuantityBlocked` on wall+segment | None | each |
| `wall.plates` | Wall plate LF | `segment.lengthFeet`; `wall.assembly.plateCount` | `L × plateCount` | Same segment loop | Missing length or plateCount | Same | None | linear-foot |

### Openings — `calculateOpeningFraming`

| Quantity key | Description | Construction inputs | Formula | Eligibility | Skip if | Validation | Assumption | Unit |
|---|---|---|---|---|---|---|---|---|
| `opening.king-studs` | King studs | `opening.quantity`; king count (explicit or default 2); `wall.assembly.studSize` | `count × quantity` | door/window/cased; wood stud wall; parent segment | Category ineligible; no parent segment; quantity unresolved; registry consult fails | Block on opening.framing or king-studs | **Governed:** default `kingStudCount=2` via registry | each |
| `opening.jack-studs` | Jack studs | `jackStudCount`; `quantity`; stud size | `jackStudCount × quantity` | Same eligibility | **No registry entry** — explicit count required | Block | None — **pending claim** if missing | each |
| `opening.rough-sill` | Rough sill LF | `roughWidthFeet`; `quantity`; stud size for identity | `roughWidth × quantity` | **window** only | Non-window; missing rough width | Block | **Governed:** sill size = wall stud size via registry | linear-foot |
| `opening.cripples-above` | Cripples above header | `roughWidthFeet`; wall spacing; `quantity` | `max(0, ceil(roughW×12/spacing)-1) × quantity` | window; or cased+header+rough height | Preconditions fail | Block | **Governed:** layout-continuation assumption after count computed | each |
| `opening.cripples-below` | Cripples below sill | Same as above | Same | **window** only | Same | Block | Same registry path | each |
| `opening.framing` | Aggregate gate | — | **No emitter** | — | — | Used as block target | — | — |
| `opening.header` | Header material | — | **No emitter** (`unsupported_capability` in claimContracts) | — | — | Validated only | — | — |

### Structural members — `calculateStructuralMembers`

| Quantity key | Description | Construction inputs | Formula | Eligibility | Skip if | Validation | Assumption | Unit |
|---|---|---|---|---|---|---|---|---|
| `member.material` | Member lumber/engineered LF | `category`; `materialType`; `size`; `lengthFeet`; `quantity`; `plyCount` if built-up | `length × quantity` or `length × quantity × ply` | category ≠ unknown; materialType ≠ unknown | Any required field null/unresolved; validation blocks material OR length keys | Dual-key block check | None | linear-foot |
| `member.length` | Companion validation key | — | **No separate emitter** | — | — | Blocks material when set false | — | — |

### Sheathing — `calculateSheathing`

| Quantity key | Description | Construction inputs | Formula | Eligibility | Skip if | Validation | Assumption | Unit |
|---|---|---|---|---|---|---|---|---|
| `sheathing.area` | Panel sheathing SF | `area.areaSquareFeet`; `system.application`; `panelType`; `thickness` | `quantity = areaSquareFeet` (no pitch/waste/sheet math) | Area linked to system | application unknown; any identity field unresolved; validation block | Blocks area or material keys | None | square-foot |
| `sheathing.material` | Companion validation key | Same identity fields | **Same line item** — one emitter uses `sheathing.area` key | — | — | Either key blocks emission | — | — |

### Floor framing — `calculateFloorFraming`

| Quantity key | Description | Construction inputs | Formula | Eligibility | Skip if | Validation | Assumption | Unit |
|---|---|---|---|---|---|---|---|---|
| `floor.joists` | Floor joist count | `joistLayoutLengthFeet`; `assembly.joistSpacingInches`; `joistSize`; `joistType`; layout-axis authority | `ceil(L×12/spacing)+1` | Non-slab area; area↔system linked | Missing inputs; slab trace; parent mismatch | Block | None | each |
| `floor.joist-linear-feet` | Joist material LF | Above count + `joistMemberLengthFeet` | `joistCount × memberLength` | `isSimpleAreaJoistLinearFeetTypeSupported(joistType)` | Truss/metal type; missing member length | Independent LF block | None | linear-foot |

### Roof framing — `calculateRoofFraming`

| Quantity key | Description | Construction inputs | Formula | Eligibility | Skip if | Validation | Assumption | Unit |
|---|---|---|---|---|---|---|---|---|
| `roof.common-rafters` | Common rafter count | `rafterLayoutLengthFeet`; `spanDirection`; `memberSpacingInches`; `memberSize`; `framingType` | `ceil(L×12/spacing)+1` | Stick/rafter framingType only | Truss/prefab type; missing inputs; plane↔system link fail | Block | None | each |

### Fasteners — `calculateFasteners` (not wired in M.4)

| Quantity key | Description | Construction inputs | Formula | Eligibility | Skip if | Validation | Assumption | Unit |
|---|---|---|---|---|---|---|---|---|
| `fastener.material` | Specified fastener count | `fastenerType`; `quantity` | `quantity` (pre-resolved on object) | type ≠ unknown | Missing type/qty | Block | None | each |

### Not implemented (quantity keys exist elsewhere)

| Quantity key | Domain | Status |
|---|---|---|
| `blocking.quantity`, `blocking.material` | Blocking | Validator only; no calculator |
| `connector.material`, `hardware.material` | Connectors/hardware | Validator only; no calculator |
| `wall.sheathing` | Walls | Validation key only; sheathing owned by Stage 10 |
| `opening.header` | Openings | Explicitly `unsupported_capability` |

---

## 3. Formula-by-formula trace

### Wall studs

| Step | Classification |
|---|---|
| Plan: wall run length | **FACT** → `segment.lengthFeet` |
| Plan: stud spacing, size | **FACT** → `wall.assembly.studSpacingInches`, `studSize` |
| `ceil(length×12/spacing)+1` | **DERIVATION** (`countRegularlySpacedStuds`) |
| Opening position + rough width on segment | **FACT** (when present) |
| Displaced stud positions inside RO zone | **DERIVATION** (`computeNetStudDeduction`) |
| `segment.parentWallId` → wall lookup | **SOFTWARE PREREQUISITE** (construction: wall owns segment) |
| `opening.parentObjectId === segment.id` | **SOFTWARE PREREQUISITE** (for deduction only) |

### Wall plates

| Step | Classification |
|---|---|
| Length, plate count | **FACT** |
| `length × plateCount` | **DERIVATION** |
| Height, location, bearing | **Not used** |

### Opening king studs

| Step | Classification |
|---|---|
| Explicit `kingStudCount` | **FACT** |
| Absent count → registry default 2 | **GOVERNED ASSUMPTION** |
| `× opening.quantity` | **DERIVATION** |
| Wood stud wall check | **SOFTWARE ELIGIBILITY** (material/type gate) |

### Opening jack studs

| Step | Classification |
|---|---|
| `jackStudCount` | **FACT** (required — no assumption) |
| Missing → pending claim | **UNRESOLVED** |

### Opening rough sill

| Step | Classification |
|---|---|
| `roughWidthFeet` | **FACT** |
| Sill member size = wall stud size | **GOVERNED ASSUMPTION** (registry) |
| `roughWidth × quantity` | **DERIVATION** |

### Opening cripples

| Step | Classification |
|---|---|
| `ceil(roughW×12/spacing)-1` per occurrence | **DERIVATION** |
| Layout continuation assumption | **GOVERNED ASSUMPTION** (emitted after count) |

### Structural member LF

| Step | Classification |
|---|---|
| length, quantity, ply | **FACT** |
| `length × qty × ply` | **DERIVATION** |
| supported/supporting object IDs | **Not used in formula** |

### Sheathing SF

| Step | Classification |
|---|---|
| `areaSquareFeet` | **FACT** (must be on area object — not derived from geometry in calc) |
| Panel identity fields | **FACT** |
| Output = input SF | **DERIVATION** (identity mapping only) |

### Floor joists

| Step | Classification |
|---|---|
| `joistLayoutLengthFeet` (e.g. 40 ft bay along spacing axis) | **FACT** |
| Spacing, type, size on system | **FACT** |
| `ceil(40×12/16)+1 = 31` | **DERIVATION** (verified in code/tests) |
| `31 × 17 = 527` LF | **DERIVATION** when member length present |
| `hasJoistCountLayoutAxisAuthority` | **SOFTWARE PREREQUISITE** |
| `parentSystemId` + `system.areaIds` backlink | **SOFTWARE PREREQUISITE** |

### Roof common rafters

| Step | Classification |
|---|---|
| Layout length, spacing, size, spanDirection, framingType | **FACT** (when resolved) |
| `ceil(L×12/spacing)+1` | **DERIVATION** |
| `pitch`, `areaSquareFeet` | **Not used** |
| Stick vs truss gate | **SOFTWARE ELIGIBILITY** |

---

## 4. Wall calculations

### Stud count

- **Formula:** `countRegularlySpacedStuds(lengthFeet, spacingInches) = ceil((L×12)/spacing) + 1`
- **Per segment:** one stud line per `WallSegment` with resolvable parent wall.
- **Net deduction:** When openings on segment have `positionOffsetFeetFromSegmentStart` + `roughWidthFeet`, `computeNetStudDeduction` counts layout positions strictly inside the rough opening zone and subtracts from baseline. Overlapping RO zones on same segment → deduction blocked, baseline count kept.
- **Not used:** wall height, location, bearing, wallType (except indirect via stud fields), waste.

### Plate LF

- **Formula:** `lengthFeet × plateCount`
- **Stud size** optional in description/classification only.

### Eligibility / skip

- Segment without parent wall in `wallsById` → **silent skip** (no line, no pending).
- Null/unresolved `lengthFeet`, `studSpacingInches`, `studSize`, or `plateCount` → **silent skip**.
- `isQuantityBlocked` for studs/plates → skip that quantity only.

### Beckstead M.4

- 42 segments; **26 emit** stud+plate pairs; 16 skip (null `lengthFeet`).
- **284 studs total** (sum of 26 each-lines); **~986 LF plates** total.

---

## 5. Opening calculations

### Implemented emitters (5 quantity keys)

1. **King studs** — default 2 via assumption registry when count not explicit.
2. **Jack studs** — explicit `jackStudCount` only; else `createBlockedMissingInputPendingClaim`.
3. **Rough sill** — windows only; LF = rough width × quantity; sill size assumed = wall stud size.
4. **Cripples above** — windows + cased-with-header; count formula then cripple-layout assumption attached.
5. **Cripples below** — windows only.

### Category eligibility

`door`, `window`, `cased` on **wood stud walls** with resolved stud size. `garage-door` explicitly excluded. Parent must be `wall-segment` with matching `parentWallId`.

### Header behavior

`headerMemberId` used only for cripple-above eligibility on cased openings. **No header material line** — `opening.header` is `unsupported_capability`; header LF owned by structural-member path when member has length+quantity.

### Nominal vs rough

- Cripple/sill math uses **rough** width.
- King/jack use counts, not dimensions.
- Wall height explicitly **not gated** for opening counts (comment in code).

### Beckstead M.4

- 57 openings; 34 with parent segment; 22 with resolved category.
- **0 opening material lines** — failures: missing quantity/dimensions/category, ineligible walls, no parent segment resolution.
- **120 pending claims** include 19 king-stud, 12 rough-sill, 12+12 cripple keys — from validation blocks on objects that also lack calculator inputs (pending ≠ emitted).

### Represented but not emitted (repository-supported)

- `opening.header` — claimContracts `unsupported_capability`
- `opening.framing` — aggregate validation gate only

---

## 6. Structural-member calculations

### Formula

`netMaterialLinearFeet = lengthFeet × quantity` (× `plyCount` for `built-up-member` only).

### Single emitter

`member.material` in LF. Category drives `framingMaterialCategory` (lumber, engineered-wood, truss, structural-steel).

### Relationships **not** in math

`associatedObjectIds`, `supportedObjectIds`, `supportingObjectIds`, `connectorIds` — **not read** by calculator. Validation may block on dangling supported/supporting refs (Stage 13 finding).

### Beckstead M.4

- 11 members; **1** has `lengthFeet=23.5` (SM-WB2-11.88LVL); **all** have `quantity=null`.
- **0 structural material lines** on frozen M.4.
- **M.6 fixture test** proves SM-WB2-11.88LVL emits **23.5 LF** when quantity resolved in replay fixture.

---

## 7. Sheathing calculations

### Implemented (A)

- **One formula:** `quantity = area.areaSquareFeet`
- **Identity on line:** application + panelType + thickness (+ optional grade, spanRating, exposure, edgeTreatment in description)
- **Requires:** area linked to parent system; application ≠ `unknown`; resolved traces on identity + area fields
- **Does not:** deduct openings, convert to sheets, apply waste, derive SF from wall/floor/roof geometry, adjust for pitch

### Missing capability (B — documented only, not designed)

Per `calculateSheathing` header and `knowledge/framing/04-building-assemblies.md`: sheet count, waste, opening deductions, geometry-derived area.

### Beckstead M.4

- 6 sheathing **systems**, **0 areas** in resolved payload.
- All systems `application: unknown`.
- **0 sheathing lines**.

---

## 8. Floor-framing calculations

### Joist count

```typescript
countRegularlySpacedJoists(L, spacing) = Math.ceil((L * 12) / spacing) + 1
```

**Verified:** `countRegularlySpacedJoists(40, 16) === 31` (node one-liner on dist build).  
**Not 40 joists** — 40 is the **spacing-axis bay length in feet** (`joistLayoutLengthFeet`).

### Joist LF

`joistCount × joistMemberLengthFeet` when member length resolved and joist type passes simple-area allowlist (dimensional lumber, I-joist; excludes truss/metal).

### Fixture proof (working path)

[`beckstead-m6-frozen-pipeline.test.ts`](../tests/framing/beckstead-m6-frozen-pipeline.test.ts) on replay fixture with linked crawl area:

- **31 each** floor joists (`FFA-FLOOR-AREA-CRAWL-SPACE`)
- **527 LF** (`31 × 17`)

[`floor-framing.calculator.test.ts`](../tests/core/floor-framing.calculator.test.ts) default fixture: 20 ft @ 16" → **16 each**, **192 LF** (16×12).

### Additional gates

- `isNonWoodFloorTakeoffAreaFromTraces` → skip slab areas
- `hasJoistCountLayoutAxisAuthority` → span direction / spacing-axis authority required
- `system.areaIds.includes(area.id)` + valid `parentSystemId`

### Not emitted

Rim board (`assembly.rimBoard` stored only), blocking, bridging, subfloor, opening deductions, floor truss packages.

### Beckstead frozen M.4

- 8 floor areas; **1** has `joistLayoutLengthFeet=40` (`FFA-FLOOR-AREA-CRAWL-SPACE`); **all** `parentSystemId=FFS-UNRESOLVED`; **0** `joistMemberLengthFeet`.
- **0 floor material lines** on frozen M.4 artifact.
- Failure: **representation** (parent link) + **missing member length** for LF — not wrong joist count formula.

---

## 9. Roof-framing calculations

### Implemented

**Only** `roof.common-rafters` (each): same count formula as floor joists on `rafterLayoutLengthFeet` + spacing.

### Required but non-arithmetic

- `spanDirection` — must be resolved; **not used in count formula**
- `isStickCommonRafterFramingType` — rejects tokens containing truss/metal/steel

### Not used in calc

`pitch`, `areaSquareFeet`, bounding walls, openings, structural members.

### Not implemented (known future gaps)

Rafter LF, truss count/package, ridge/hip/valley, pitch-adjusted length/area, roof sheathing (Stage 10 separate).

### Beckstead M.4

- Prefab/scissor truss construction; no layout length or span on planes; planes `RFS-UNRESOLVED`.
- **0 roof lines** — **missing calculator path** (truss) + **missing stick-rafter inputs** + parent links.

---

## 10. Blocking / connectors / hardware / fasteners

| Module | Exists? | Wired M.4? | Emits | Prevents full takeoff because |
|---|---|---|---|---|
| `calculateBlocking` | **No** | — | — | No calculator file |
| `calculateFasteners` | **Yes** | **No** | `fastener.material` each | No connectorsHardware stage payload in pipeline |
| Connector/hardware calc | **No** | — | — | Validator + quantity keys only |
| `collectPendingClaims` | — | — | Pending rows for unwired keys | Marks `blocking.*`, `connector.material`, `hardware.material` as unsupported |

`calculateFasteners` emits pre-resolved `fastener.quantity` — does not scale by nailing schedules or associated objects.

---

## 11. Assumptions inside calculation

### Assumption registry entries (openings only)

| Property | Quantity key | Default / rule | Classification |
|---|---|---|---|
| `kingStudCount` | `opening.king-studs` | 2 | **GOVERNED ASSUMPTION** |
| `roughSillSize` | `opening.rough-sill` | = wall stud size | **GOVERNED ASSUMPTION** |
| `crippleStudLayout` | `opening.cripples-above/below` | layout-continuation-from-rough-width | **GOVERNED ASSUMPTION** (after count derived) |

### No registry entries for

Wall spacing, floor/roof layout length, joist/rafter spacing, jack studs, structural sizes, sheathing area, truss design.

### Pending claims (ungoverned missing input)

`createBlockedMissingInputPendingClaim` for jack studs when `jackStudCount` unresolved.

### Consult order (openings)

King studs: try explicit → registry assume → skip.  
Jack studs: explicit only → pending.  
Cripples: compute count → registry must approve layout assumption → else discard lines.

### FACT → DERIVE → ASSUME → NOT DETERMINABLE

| Domain | Pattern |
|---|---|
| Walls | FACT → DERIVE; no assume |
| Openings | FACT → DERIVE → ASSUME (king/sill/cripple); jack → NOT DETERMINABLE (pending) |
| Floor/roof count | FACT → DERIVE; no assume |
| Floor LF | FACT → DERIVE; no assume |
| Structural | FACT → DERIVE; no assume |
| Sheathing | FACT → identity map; no assume |

---

## 12. Derivations inside calculation

| Derivation | Inputs | Formula | Output | Consumer |
|---|---|---|---|---|
| Regularly spaced count | layout length, spacing | `ceil(L×12/s)+1` | integer count | wall studs, floor joists, roof rafters |
| Plate LF | length, plate count | `L × count` | LF | wall plates |
| Net stud deduction | length, spacing, RO position, RO width | displaced layout positions inside zone | reduced stud count | wall studs |
| Cripple count | rough width, spacing | `max(0, ceil(roughW×12/s)-1)` | per-occurrence count | opening cripples |
| Opening quantity multiply | per-occurrence count, opening.quantity | `× quantity` | total each/LF | king, jack, cripples, sill |
| Joist/rafter LF | count, member length | `count × memberLength` | LF | floor joists |
| Member LF | length, qty, ply | `L × q × ply?` | LF | structural members |
| Sheathing SF | areaSquareFeet | identity | SF | sheathing |
| Fastener each | quantity on object | identity | each | fasteners |

**No geometry arithmetic** in Stage 14 (no polygon area, no pitch multiplier, no sheet layout).

---

## 13. Calculator dependence on old architecture

| Dependency | Math required? | Representation required? | If representation absent but facts present |
|---|---|---|---|
| `segment.parentWallId` → wall | Yes (wall assembly fields) | Yes — segment loop | Skip segment |
| `opening.parentObjectId` → segment | Yes (stud size/spacing) | Yes | Skip opening calcs |
| `area/plane.parentSystemId` + `system.areaIds/planeIds` | Yes (system assembly) | Yes — bidirectional | Skip area/plane |
| `resolutionTraces` + `isQuantityInputResolved` | Value must exist; trace `unresolved` blocks | Yes — lifecycle metadata | Skip even if scalar present with bad trace |
| `isQuantityBlocked(validation, …)` | No | Yes — Stage 13 artifact | Skip (Beckstead: no effect on emitted 52 lines) |
| `quantityKey` on material line | No — labeling/provenance | Yes — contract | N/A |
| `claimStatus` / `pendingClaims` | No | Yes — output envelope | Missing lines surface as pending |
| `hasJoistCountLayoutAxisAuthority` | Layout direction fact | Yes — authority helper | Skip joist count |
| `isStickCommonRafterFramingType` | Framing family fact | Token rules on resolved string | Skip truss roofs |
| `isNonWoodFloorTakeoffAreaFromTraces` | Slab vs wood | Trace inspection | Skip slab areas |
| Canonical ObjectIds in `createMaterialLineItemId` | No | Yes — line identity | N/A |
| Evidence IDs | No | Copied to provenance only | N/A |
| completion/confidence on objects | No | Not read by calculators | N/A |

**D14 lens:** Floor crawl space has `joistLayoutLengthFeet=40` on Beckstead but `FFS-UNRESOLVED` parent — construction bay length is known; software parent link prevents calc on frozen M.4.

---

## 14. Failure behavior

| Calculator | Missing input | Behavior |
|---|---|---|
| Wall | null length/spacing/size/plate | **Silent skip** (null) |
| Wall | validation block | **Silent skip** |
| Wall | overlapping RO zones | **Partial** — emit baseline without deduction |
| Opening | ineligible / no segment | **Silent skip** |
| Opening | missing jack count | **Pending claim** |
| Opening | king/sill/cripple registry fail | **Silent skip** (cripples after computing count) |
| Structural | any required null | **Silent skip** |
| Sheathing | unknown application / null SF | **Silent skip** |
| Floor | null inputs / slab / no parent | **Silent skip** |
| Floor | count ok, LF inputs missing | **Partial** — count only if unblocked |
| Roof | truss type / null inputs / no link | **Silent skip** |
| Fasteners | unknown type / null qty | **Silent skip** |
| Coordinator | unwired quantity keys | **Pending claim** markers in output |

**No calculator throws** on missing inputs. **No governed assumption** outside openings. Order is generally **FACT → DERIVE → (opening ASSUME only) → skip/pending** — not a universal assume-before-skip pipeline.

---

## 15. Beckstead material trace (M.4 frozen)

| Domain | Objects entering Stage 14 | Emitted | Totals | Primary absence cause |
|---|---|---|---|---|
| **WALLS** | 42 walls, 42 segments, 57 openings (for deduction) | **52 lines** (26 stud + 26 plate) | 284 studs; ~986 plate LF | 16 segments: null length (reader/resolver). Validation does not change output. |
| **OPENINGS** | 57 openings | **0** | — | Missing parent segment, quantity, dimensions, category; eligibility gates |
| **STRUCTURAL** | 11 members | **0** | — | `quantity=null` on all; length only on one member |
| **SHEATHING** | 6 systems, 0 areas | **0** | — | No areas; application unknown |
| **FLOOR** | 3 systems, 8 areas (1 with layout 40 ft) | **0** | — | All areas `FFS-UNRESOLVED`; no member length. **Not** wrong joist formula. |
| **ROOF** | 5 systems, 2 planes | **0** | — | Truss construction + missing stick inputs + unresolved parents |
| **FASTENERS** | Not passed to Stage 14 | **0** | — | Not wired |

**Pending claims:** 120 rows (validation-blocked + unwired keys), including floor/roof/opening keys for objects that did not emit.

**Working fixture path (not frozen M.4):** M.6 replay — **31 joists + 527 LF** for crawl area when parent linked and member length present; plus LVL **23.5 LF** structural line.

---

## 16. Calculator coverage vs takeoff completeness

Repository-supported quantity keys from `rule-ids.ts` + `claimContracts.ts`:

| Quantity key | Status |
|---|---|
| `wall.studs`, `wall.plates` | **IMPLEMENTED CALCULATOR** |
| `opening.king-studs`, `opening.jack-studs`, `opening.rough-sill`, `opening.cripples-above`, `opening.cripples-below` | **IMPLEMENTED CALCULATOR** |
| `member.material` | **IMPLEMENTED CALCULATOR** |
| `sheathing.area` (+ material companion) | **IMPLEMENTED CALCULATOR** |
| `floor.joists`, `floor.joist-linear-feet` | **IMPLEMENTED CALCULATOR** |
| `roof.common-rafters` | **IMPLEMENTED CALCULATOR** |
| `fastener.material` | **IMPLEMENTED** (not pipeline-wired in M.4) |
| `opening.framing` | **REPRESENTED** — aggregate gate only |
| `opening.header` | **REPRESENTED** — unsupported_capability |
| `member.length` | **REPRESENTED** — validation companion |
| `wall.sheathing` | **REPRESENTED** — wrong domain (Stage 10) |
| `sheathing.material` | **REPRESENTED** — companion to area emitter |
| `blocking.quantity`, `blocking.material` | **NO CALCULATOR CONTRACT** |
| `connector.material`, `hardware.material` | **NO CALCULATOR CONTRACT** |

Brain docs reference additional families (rim board, floor truss packages, ridge/hip/valley, sheet conversion, waste) — **no Stage 14 emitter** in code.

**Breadth:** Stage 14 implements **~12 distinct emit-capable quantity keys** across 6 wired domains. Schemas/specs represent a wider framing scope than calculators emit.

---

## 17. Minimum existing calculation capability

| Domain | Existing emitter | Actual construction inputs | Deterministic logic worth carrying | Assumptions used | Non-math software prerequisites | Beckstead M.4 output |
|---|---|---|---|---|---|---|
| **Walls** | studs, plates | length, spacing, size, plate count | `ceil(L×12/s)+1`; net RO stud deduction; `L×plates` | None | parent wall; segment link; trace resolution | 284 studs; ~986 plate LF |
| **Openings** | king, jack, sill, cripples | qty, rough dims, counts, wall stud size/spacing | count formulas; qty multiply | King=2; sill size; cripple layout | wood wall; category; parent segment | 0 lines |
| **Structural** | member LF | length, qty, size, type, category, ply | `L×q×ply` | None | trace resolution | 0 lines |
| **Sheathing** | SF panel line | area SF, application, panel type, thickness | identity SF | None | area↔system link | 0 lines |
| **Floor** | joists, joist LF | layout length, spacing, type, size, member length | `ceil(L×12/s)+1`; `count×memberLen` | None | layout authority; parent link; slab skip; LF type gate | 0 lines (31+527 in M.6 fixture) |
| **Roof** | common rafters | layout length, spacing, size, framing type, span dir | `ceil(L×12/s)+1` | None | stick-type gate; plane↔system link | 0 lines |
| **Fasteners** | fastener each | type, quantity | identity | None | not wired in M.4 | 0 lines |

---

## Bottom line (factual)

### 1. What genuine takeoff intelligence already exists in Stage 14?

Deterministic **regularly-spaced member counting** (`ceil(L×12/spacing)+1`) for walls, floors, and stick roofs; **plate LF**; **opening-specific framing** (king/jack/sill/cripples) with three **governed opening assumptions**; **net wall stud deduction** from positioned openings; **structural member LF** with ply; **sheathing SF passthrough** with panel identity; optional **fastener count passthrough**. These are real construction math patterns, narrow in scope but implemented and tested.

### 2. Which calculations are deterministic and construction-correct when inputs are known?

Wall stud/plate formulas, floor/roof count formula (verified 40 ft @ 16" → **31**, not 40), floor LF `count×memberLength` (31×17=**527**), opening cripple count from rough width and spacing, structural LF, sheathing SF identity — **when required FACT inputs and software links are satisfied**.

### 3. Which useful calculations are entangled with old-pipeline representation?

**Parent system/plane links** (floor, roof, sheathing), **segment↔wall and opening↔segment links**, **resolution trace `unresolved` gate**, **layout-axis authority** (floor), **stick-vs-truss token gates** (roof), **wood-wall eligibility** (openings). Several do not affect the arithmetic directly but block emission.

### 4. Which calculators operate safely from construction inputs?

Wall calculator is the most self-contained (needs segment length + wall assembly). Structural and sheathing need fewer cross-links. Opening calculator needs wall context but implements assume paths. Floor/roof need **system↔area/plane** pairing beyond raw layout numbers.

### 5. How much framing takeoff is implemented vs represented?

**Implemented:** ~12 emit quantity keys, **6 domains wired** in M.4. **Represented but not calculated:** headers, blocking, connectors/hardware, wall sheathing key, floor rim/truss packages, roof truss/ridge/hip, sheet/waste math. Large schema/validation surface; **narrow calculator surface**.

### 6. Where does calculation give up before derivation or assumption?

**Walls/floor/roof/structural/sheathing:** skip on null — **no assume**. **Openings:** king/sill/cripple use registry; **jack studs stop at pending**. **Floor/roof:** no assume for layout length or spacing. **Sheathing:** no assume for SF or panel identity.

### 7. Which Beckstead deficiencies are genuine missing capability vs reset-architecture?

**Genuine missing capability:** truss roof packages, floor truss path, opening header emitter, blocking/connectors, sheet count/waste, rim board, ridge/hip/valley. **Reset-architecture / input problems on Beckstead:** floor parent links (40 ft layout present but unresolved), opening parent/dimension gaps, structural `quantity` null, sheathing zero areas, roof truss vs stick-rafter gate.

### 8. If only proven existing capability were preserved (no new domain intelligence)

**Carry:** wall stud count + plate LF (+ net RO deduction); opening king/jack/sill/cripple calculators with existing assumption registry; structural member LF; sheathing SF line; floor joist count + simple-area LF; roof stick common-rafter count; fastener passthrough; pending-claim collection pattern. **Do not expect** Beckstead-full takeoff until reader/resolver supplies links and inputs — frozen M.4 proves **walls only** today; floor success requires fixture-grade parent linking and member length, not formula changes.
