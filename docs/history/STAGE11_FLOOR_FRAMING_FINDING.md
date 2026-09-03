# Stage 11 Floor Framing — Factual Finding

**Scope:** Current Stage 11 `floorFraming` / `resolveFloorFraming`, involved helpers/schemas, and Stage 14 `calculateFloorFraming`.  
**Question:** After READ THE PLANS has understood floor construction, geometry, dimensions, framing system, joist direction/spacing/span, schedules, notes, structural members, openings, and natural relationships, what does Stage 11 actually add before floor-framing material calculation?  
**Secondary question:** Why did Beckstead produce crawl-space floor joist material, and what does that success prove?  
**Authority:** Code, tests, and frozen Beckstead artifacts only. No KEEP/REMOVE recommendations. No replacement design.

**Primary files:**
- Stage wiring: [`createFramingStages.ts`](../src/framing/stages/createFramingStages.ts) (order 11)
- Resolver: [`resolveFloorFraming.ts`](../src/framing/resolve/resolveFloorFraming.ts)
- Layout authority: [`floorLayoutAuthority.ts`](../src/framing/resolve/floorLayoutAuthority.ts)
- Fragment/consolidation: [`floorFragmentConsolidation.ts`](../src/framing/resolve/floorFragmentConsolidation.ts)
- Slab compatibility: [`floorAreaMaterialCompatibility.ts`](../src/framing/resolve/floorAreaMaterialCompatibility.ts)
- Parent-system link: [`resolveFloorAreaParentSystem.ts`](../src/framing/resolve/resolveFloorAreaParentSystem.ts)
- Property paths: [`floorFramingPropertyPaths.ts`](../src/framing/resolve/floorFramingPropertyPaths.ts)
- Schema: [`floor-framing.schema.ts`](../src/framing/schemas/floor-framing.schema.ts)
- Stage 6 relationship emitters (not Stage 11): [`buildAreaSystemRelationshipEvidence.ts`](../src/framing/geometry/buildAreaSystemRelationshipEvidence.ts), [`buildConstructionSemanticRelationshipEvidence.ts`](../src/framing/geometry/buildConstructionSemanticRelationshipEvidence.ts)
- Calculator: [`calculateFloorFraming.ts`](../src/framing/calculate/calculateFloorFraming.ts)
- Validation: [`floor-framing.validator.ts`](../src/framing/validators/floor-framing.validator.ts)
- Beckstead fixtures/tests: [`becksteadM5FloorLayoutEvidence.ts`](../tests/fixtures/becksteadM5FloorLayoutEvidence.ts), [`beckstead-floor-layout-authority.test.ts`](../tests/framing/beckstead-floor-layout-authority.test.ts), [`beckstead-m5-frozen-pipeline.test.ts`](../tests/framing/beckstead-m5-frozen-pipeline.test.ts)

---

## 1. Stage 11 input

### What Stage 11 receives (actual wiring)

Stage 11 reads **only**:

1. Stage 6 `extractedEvidence.evidence` (`Evidence[]`)
2. Optional `userDecisionRunInput` (user decisions + review items for scalar overrides)

Stage 11 does **not** read wall framing, openings, compiled pages, `projectDictionary`, geometry artifacts, or structural members directly — despite [`floor-framing.spec.md`](../src/framing/specs/floor-framing.spec.md) listing those as consumed artifacts.

**Note:** Stage 6 may append relationship Evidence (`buildAreaSystemRelationshipEvidence`, `buildConstructionSemanticRelationshipEvidence`) **before** Stage 11 runs, but Stage 11 only sees the merged `Evidence[]` — not the upstream artifacts that produced it.

### Major properties — earliest source vs Stage 11 repackaging

| Property on `FloorFramingSystem` / `FloorFramingArea` | Typical plan/reader origin | How it reaches Stage 11 |
|---|---|---|
| System / area subject keys | Floor plan labels, crawl/basement regions, schedule tags | `subjectKind:"floor-framing-system"` / `"floor-framing-area"` Evidence |
| `assembly.joistType`, `assembly.joistSize`, `assembly.joistSpacingInches` | Joist callouts, performance notes, schedules (e.g. TJI 210 @ 16" O.C.) | Evidence on floor-framing-system subject |
| `assembly.rimBoard` | Rim/band notes on floor system | Evidence on system — **stored only** |
| `joistLayoutLengthFeet` | Explicit bay dimension along spacing axis (e.g. 40'-0") | Evidence on floor-framing-area — **not derived from area SF or polygons** |
| `joistMemberLengthFeet` | MAX SPAN / member-length callouts (e.g. 17'-0") | Evidence on area, or **derived** from mis-assigned `spanDirection` Evidence |
| `spanDirection` | Cardinal span wording on plans | Evidence on area — used for layout-axis authority gate |
| `areaSquareFeet` | Room/region SF callouts | Evidence on area — **not used by joist count/LF calculator** |
| `parentSystemTag` → `parentSystemId` | Explicit area→system ownership; Stage 6 CS/bridge passes | Evidence `parentSystemTag` → `FFS-{tag}` ObjectId |
| `boundingWallTag`, `openingTag`, `structuralMemberTag` | Explicit associations | Tag → ObjectId arrays — **not used in joist math** |
| `system.areaIds` | Derived from linked areas | Stage 11 `linkSystemAreaIds` |

**Information on other subjects that Stage 11 does not consume:**

| Reader fact | Where it lands | Stage 11 consumption |
|---|---|---|
| Floor sheathing / subfloor spec | Stage 10 `sheathing-system` or wall/floor notes | **Not read** — floor calculator does not emit subfloor |
| Garage/double-garage SF | `sheathing-area` or `floor-framing-area` on different subjects | Only if same subjectKind/property paths on floor-framing-area |
| Wall segment lengths | Stage 7 walls | **Not used** for joist layout length |
| Beam/girder marks | `structural-member` Evidence | Referenced on area only as optional ObjectId tags |

---

## 2. Floor framing system / area creation

### What creates a `FloorFramingSystem`

`resolveFloorFraming`:

1. Filter Evidence with `subjectKind === "floor-framing-system"`.
2. Group by `subjectKey`; converge to `FFS-{sanitizedKey}` via `createFloorFramingSystemObjectId`.
3. `resolveOneSystem` — scalars from `FLOOR_SYSTEM_PROPERTY_PATHS`.
4. Post-passes: `applyJoistSizeInference`, `applyCombinedJoistTypeSplit`, `applySiblingFloorSystemAssemblyMerge`.

### What creates a `FloorFramingArea`

Same pattern with `subjectKind === "floor-framing-area"` → `FFA-{sanitizedKey}`:

- Scalars: layout, framingDirection, spanDirection, joistLayoutLengthFeet, joistMemberLengthFeet, areaSquareFeet
- Relationships: parentSystemTag, boundingWallTag, openingTag, structuralMemberTag → ObjectIds
- Default missing parent: `FFS-UNRESOLVED`
- Post-passes per area:
  - `applyMemberLengthFromMisassignedSpan` — MAX SPAN in spanDirection → joistMemberLengthFeet
  - `applyInferredParentSystemLink` — **explicit `parentSystemTag` only** (via `resolveEvidenceBackedParentSystemLink`)
  - `rejectSlabAreaWoodFloorParentLink` — slab areas cannot keep wood-joist parent
  - `applySpacingAxisLayoutAuthority` — marks spacing-axis trace when corroborated
- `mergeBayFragmentEvidenceOntoLinkedAreas` — merges directional bay fragments onto linked parent area

### Discover vs convert vs infer

| Behavior | Present? |
|---|---|
| Discover floor framing from PDF geometry alone | **No** |
| Derive joistLayoutLengthFeet from areaSquareFeet or room polygons | **No** (extraction rules forbid) |
| Convert floor-framing Evidence into domain objects | **Yes** — primary function |
| Derive joist count | **No in Stage 11** — Stage 14 formula |
| Infer joist size from combined type string | **Yes** — `applyCombinedJoistTypeSplit`, `inferJoistSizeFromJoistType` |
| Infer member length from MAX SPAN mis-assigned to spanDirection | **Yes** — `applyMemberLengthFromMisassignedSpan` |
| Infer area→system without explicit parentSystemTag | **No** — fails closed to `FFS-UNRESOLVED` |
| Reject slab area → wood floor parent | **Yes** — compatibility gate |

### Existence / eligibility (calculator)

- System + area Evidence subjects must exist.
- Area `parentSystemId` must match an existing system in payload.
- System `areaIds` must include the area (bidirectional link check in calculator).
- Non-wood/slab areas skipped via `isNonWoodFloorTakeoffAreaFromTraces`.

---

## 3. Resolution operations

| Step | Input | Output / change | New construction understanding? |
|---|---|---|---|
| Group / converge | Evidence | FFS-* / FFA-* clusters | Identity normalize |
| Scalar resolve (system) | joistType, joistSize, spacing, rimBoard, name, level, phase | FloorFramingSystem fields | Select/normalize Evidence |
| Combined joist type split | single string "11 7/8\" TJI 210" | separate type + size | **Derivation** — parse combined string |
| Sibling assembly merge | missing size/spacing on one system | copied from sibling same family | **Derivation** — merge within family |
| Scalar resolve (area) | layout, spanDirection, layout/member lengths, SF | area fields | Select Evidence; scalar feet normalization |
| Member length recovery | spanDirection = MAX SPAN callout | joistMemberLengthFeet = 17 | **Derivation** — reclassify mis-assigned span |
| Parent link | parentSystemTag Evidence | parentSystemId | **Translation** |
| Spacing-axis authority | layout length + joist callout corroboration | trace marker on joistLayoutLengthFeet | **Authority marking** — enables count gate |
| Slab parent rejection | slab subjectKey + wood parent | parent → UNRESOLVED | **Compatibility rule** |
| Bay fragment merge | N/S directional fragments + linked bay | merged Evidence on parent area | **Consolidation** — not new plan facts |
| linkSystemAreaIds | area.parentSystemId | system.areaIds | Bookkeeping |

---

## 4. What READ THE PLANS already knows (before Stage 11)

| Reader path | Example (Beckstead) | Stage 11 consumes? |
|---|---|---|
| Crawl space joist callout | `11.7/8" TJI 210 … @ 16" O.C. (MAX. SPAN = 17'-0")` on page 3 | **Partial** — system joistType/spacing on `FLOOR SYS CRAWL SPACE`; member length via spanDirection mis-assignment recovery |
| Crawl bay dimension 40'-0" | `joistLayoutLengthFeet=40` on `FLOOR AREA CRAWL SPACE` (M.4 Evidence) | **Yes** when scalar resolves and spacing-axis authority established |
| Area→system ownership | Explicit parentSystemTag | **M.4 frozen Evidence: 0 parentSystemTag records** — link fails unless Stage 6 CS/bridge adds tags or fixture/user decision supplies them |
| Construction semantic (Stage 6) | PL v1d: CS pass emits parentSystemTag for crawl bays | **Consumed as Evidence** — not computed inside Stage 11 |
| Main floor 1621 SF | `MAIN FLOOR AREA areaSquareFeet` + parentSystemTag (wave5) | SF stored; **joist calc blocked** without joistLayoutLengthFeet + layout-axis authority |
| Patio slab | `PATIO SLAB AREA` with erroneous parent to crawl system (wave5) | Parent **rejected** for slab → UNRESOLVED; no joist emission |
| Rim board note | `assembly.rimBoard` on `FLOOR SYS CRAWL` (M.4) | Stored on system — **no calculator consumer** |
| Floor sheathing | Stage 10 domain | **Outside Stage 11** |

**Stranded information (factual):**

- M.4 frozen `06-extractedEvidence.json`: crawl joist spec + 40 ft layout + 17 ft span callout exist, but **no `parentSystemTag`**, **no construction-semantic Evidence** in artifact → area stays `FFS-UNRESOLVED`.
- Wave5: `CRAWL SPACE FLOOR AREA - NORTH` has **conflicting** layout string `"40'-0\" / 50'-8\""` → joistLayoutLengthFeet unresolved; S area has parentSystemTag but **no resolved layout length** in default resolve path.
- `areaSquareFeet` on main floor does not substitute for `joistLayoutLengthFeet`.

---

## 5. Beckstead joist trace (31 each — not 40)

**Terminology correction (factual):** Beckstead crawl-space success uses **`joistLayoutLengthFeet = 40` (feet)** as the spacing-axis bay dimension. The emitted joist **count** is **`31 each`**, from:

```text
countRegularlySpacedJoists(40, 16) = ceil(40 × 12 / 16) + 1 = ceil(30) + 1 = 31
```

There is **no** Beckstead artifact path that emits **40 joists**. The number 40 is the layout-length input, not the quantity output.

### A. Frozen M.4 pipeline (`artifacts/b2.2m.4/runs/beckstead-audit-b/framing/`)

| Stage | State |
|---|---|
| **Plan / reader** | Page 3 crawl plan: TJI 210 @ 16" O.C., MAX SPAN 17'-0", 40'-0" bay |
| **Stage 6 Evidence** | Systems: `FLOOR SYS CRAWL SPACE` (type, size, spacing), `FLOOR SYS CRAWL` (combined type, spacing, rimBoard note); Area: `FLOOR AREA CRAWL SPACE` — layoutLength=40, spanDirection=`MAX. SPAN = 17'-0"`; **0 parentSystemTag** |
| **Stage 11** | `FFA-FLOOR-AREA-CRAWL-SPACE`: layout=40, member=17 (from span recovery on re-resolve); **parent=FFS-UNRESOLVED** |
| **Stage 14** | **0 floor material lines** in `14-calculations.json` |
| **M.5 frozen test** | `beckstead-m5-frozen-pipeline.test.ts` **currently fails** — expects `FFS-FLOOR-SYS-CRAWL-SPACE` parent but gets `FFS-UNRESOLVED` |

**Failure boundary (raw M.4):** missing area→system link (no parentSystemTag / CS Evidence in frozen artifact), so calculator never pairs area with system despite having layout length and joist spec.

### B. Governed success path (M.5 fixture — proves calculator contract)

Documented in [`beckstead-floor-layout-authority.test.ts`](../tests/framing/beckstead-floor-layout-authority.test.ts) using [`buildBecksteadM5CrawlSpaceFloorEvidence()`](../tests/fixtures/becksteadM5FloorLayoutEvidence.ts) — applies **M.5 governance corrections** to M.4-shaped facts:

| Step | Detail |
|---|---|
| **Plan facts represented** | Same crawl callout, 40 ft bay, MAX SPAN 17 ft, TJI 210 @ 16" |
| **Added vs raw M.4** | Explicit `parentSystemTag: FLOOR-SYS-CRAWL-SPACE` on crawl area Evidence |
| **Stage 11** | `FFA-FLOOR-AREA-CRAWL-SPACE` → parent `FFS-FLOOR-SYS-CRAWL-SPACE`; layout=40; member=17; spacing-axis authority trace |
| **Stage 14** | **31 each** `floor.joists` + **527 LF** `floor.joist-linear-feet` (31 × 17) |
| **Formula** | Count: `ceil(40×12/16)+1=31`; LF: `31×17=527` |
| **Rounding** | `Math.ceil` on bay inches + **+1 end joist** (explicit in `countRegularlySpacedJoists`) |
| **Span effect** | 17 ft affects **LF only**, not count |
| **Relationships required** | Valid parentSystemId; system.areaIds includes area |
| **Validation** | Passes layout-axis authority, layout length, member length, joist type/size/spacing |

### C. PL v1d replay (construction semantic parent links)

[`beckstead-pl-v1d-floor-wb-replay.test.ts`](../tests/framing/beckstead-pl-v1d-floor-wb-replay.test.ts): re-runs `buildConstructionSemanticRelationshipEvidence` on PL evidence → emits `parentSystemTag` for crawl bays → `resolveFloorFraming` links ≥2 crawl bays → floor joist lines emit (when artifact dir present).

### Exact inputs for 31 joists (success path)

| Input | Value | Origin | Classification |
|---|---|---|---|
| Physical area | `FFA-FLOOR-AREA-CRAWL-SPACE` (crawl space south bay) | Plan region label | FACT (subject) |
| `joistLayoutLengthFeet` | 40 | Explicit 40'-0" on crawl plan | FACT |
| `assembly.joistSpacingInches` | 16 | Joist callout @ 16" O.C. | FACT |
| `assembly.joistType` / `joistSize` | TJI 210 I-joist / 11 7/8" | Joist callout | FACT (may split/merge across sibling systems) |
| `joistMemberLengthFeet` | 17 | MAX SPAN = 17'-0" (mis-assigned to spanDirection in M.4) | FACT on plan → **DERIVATION** into member-length field |
| `parentSystemId` | `FFS-FLOOR-SYS-CRAWL-SPACE` | Requires explicit parentSystemTag or CS Evidence | FACT when tag present; **missing in raw M.4 frozen** |
| Joist count 31 | — | `countRegularlySpacedJoists` | **DERIVATION** |
| LF 527 | — | 31 × 17 | **DERIVATION** |

---

## 6. Fact vs derivation vs assumption

| Input / behavior | Classification |
|---|---|
| joistType, joistSize, joistSpacingInches | **FACT** (Evidence on system) |
| joistLayoutLengthFeet | **FACT** — must be explicit; not from SF/geometry |
| joistMemberLengthFeet (direct Evidence) | **FACT** |
| joistMemberLengthFeet from MAX SPAN in spanDirection | **DERIVATION** |
| Combined type string → split type + size | **DERIVATION** |
| Sibling system assembly merge | **DERIVATION** |
| Joist size inferred from type string | **DERIVATION** |
| parentSystemTag → parentSystemId | **Translation** of FACT tag |
| Spacing-axis authority trace | **DERIVATION** (corroboration marking) |
| Joist count `ceil(L×12/spacing)+1` | **DERIVATION** |
| Joist LF `count × memberLength` | **DERIVATION** |
| areaSquareFeet for joist count | **UNRESOLVED** — not consumed |
| Layout length from wall geometry | **UNRESOLVED** — not implemented |
| Opening/stair deductions | **UNRESOLVED** — not in calculator |
| Rim board LF / each | **UNRESOLVED** — spec stored, no emitter |
| Blocking / bridging | **UNRESOLVED** |
| Subfloor / floor sheathing | **UNRESOLVED in floor calc** — Stage 10 domain |
| Governed defaults for missing layout/spacing | **ASSUMPTION: none** — `assumptionRegistry.ts` has zero floor entries |

---

## 7. Geometry / quantity derivation

### Joists (count)

| Question | Current behavior |
|---|---|
| Controlling dimension | `joistLayoutLengthFeet` — length **perpendicular to span** along spacing axis |
| Spacing use | `assembly.joistSpacingInches` in `ceil(layout×12/spacing)+1` |
| End joist | **+1** after ceil (regularly spaced formula) |
| Irregular areas | Not modeled — one count per linked floor-framing-area |
| Openings/stairs | **Not deducted** — openingIds stored, unused in calc |
| Geometry source | **Explicit Evidence fields only** — not from compiled polygons in Stage 11 |
| Layout-axis gate | Requires valid `spanDirection` **or** spacing-axis authority trace on layout length |

### Joists (length / LF)

| Question | Current behavior |
|---|---|
| Span / member length | `joistMemberLengthFeet` — installed member length, not layout length |
| Emitted units | **Both** `each` (count) and `linear-foot` (count × member length) when type supported |
| I-joist / dimensional lumber | LF emitted; truss/metal/steel types blocked for LF |
| Bearing geometry | **Not used** |

### Rim / band / rim board

| Question | Current behavior |
|---|---|
| Specification | `assembly.rimBoard` on system — e.g. Beckstead blocking note on `FLOOR SYS CRAWL` |
| LF derived | **No** |
| Material emitted | **No** — `calculateFloorFraming` comment: "Does not emit rim, opening specials, blocking, or sheathing" |

### Blocking / bridging

**Not derived or emitted** by floor calculator.

### Subfloor / sheathing

**Intentionally outside** `calculateFloorFraming`. Stage 10 `calculateSheathing` owns floor sheathing SF when sheathing-domain Evidence exists. Floor `areaSquareFeet` is not a sheathing input in Stage 10.

---

## 8. Floor area / system relationships

| Relationship | First known | Representation | Consumer | Required for joist formula? | If link fails |
|---|---|---|---|---|---|
| Area → system | Explicit plan ownership / CS pass | parentSystemTag → parentSystemId | Stage 11, Stage 14 | **Yes** | Calculator skips area; validation blocks both joist keys |
| System → areas | Derived | areaIds | Calculator checks membership | **Yes** | Skip if area not in system.areaIds |
| Area → walls | Explicit boundingWallTag | boundingWallIds | Validation warning only | **No** | Warning; calc unchanged |
| Area → openings | openingTag | openingIds | Validation warning only | **No** | |
| Area → structural members | structuralMemberTag | structuralMemberIds | Validation warning only | **No** | |
| Floor → sheathing | Separate sheathing subjects | Stage 10 | Stage 10 calc | **No** for joists | |
| Slab area → wood system | Plan surface type | rejectSlabAreaWoodFloorParentLink | Stage 11 | N/A — prevents false joist takeoff | Parent cleared to UNRESOLVED |

**D14 lens:** Crawl joist spec and 40 ft bay are **known on Evidence** before Stage 11; the **parentSystemTag → parentSystemId** step is **translation**. Raw M.4 Beckstead fails because that translation input was **never recorded** in the frozen Evidence artifact, not because joist math is unknown.

---

## 9. Specification flow (Beckstead crawl TJI)

### Successful path (M.5 fixture)

```
Plan page 3: "11 7/8\" TJI 210 FLOOR JOISTS @ 16\" O.C. (MAX. SPAN = 17'-0\")" + 40'-0\" bay
→ Evidence: floor-framing-system FLOOR-SYS-CRAWL-SPACE (joistType, joistSize, spacing)
→ Evidence: floor-framing-area FLOOR-AREA-CRAWL-SPACE (joistLayoutLengthFeet=40, parentSystemTag, spanDirection MAX SPAN)
→ Stage 11: FFS-FLOOR-SYS-CRAWL-SPACE + FFA-FLOOR-AREA-CRAWL-SPACE linked; member=17 from span recovery
→ Stage 14: "11 7/8\" TJI 210 I-joist floor joists" — 31 each + 527 LF
```

### Rim board (recovered, not emitted)

```
Plan: "solid blocking per details … at parallel bearing/shear walls" on performance note
→ Evidence: floor-framing-system FLOOR SYS CRAWL assembly.rimBoard
→ Stage 11: stored on FFS-FLOOR-SYS-CRAWL.assembly.rimBoard
→ Stage 14: no material line
```

**Translation boundaries:** subjectKind (floor-framing-* only), parentSystemTag requirement, spanDirection vs joistMemberLengthFeet reclassification, spacing-axis authority gate, sibling system merge for split type strings.

---

## 10. What Stage 14 actually calculates

**Emitter:** `calculateFloorFraming` only.

| Material | Construction inputs | Formula | Software prerequisites | Skip / null |
|---|---|---|---|---|
| **Floor joists (each)** `floor.joists` | joistLayoutLengthFeet; assembly.joistSpacingInches; assembly.joistType; assembly.joistSize | `ceil(layout×12/spacing)+1` | Linked area+system; spacing-axis authority; resolved traces; not slab-skipped; validation not blocking | Missing any input; blocked validation; non-wood area trace |
| **Floor joist LF** `floor.joist-linear-feet` | above + joistMemberLengthFeet | `joistCount × joistMemberLengthFeet` | Same + I-joist/dimensional type supported (`isSimpleAreaJoistLinearFeetTypeSupported`) | Missing member length; truss/metal type; blocked LF key |

**Not emitted (represented in schema/spec/claims but no calculator):** rim board, blocking, bridging, subfloor/sheathing, opening specials, BCI package counts, floor truss packages.

**areaSquareFeet:** claim contract `reviewOnlyPropertyPaths` for joist keys — validator warns if missing but **does not block** joist emission.

---

## 11. Assumption registry

**No governed assumptions exist for floor framing.** `assumptionRegistry.ts` states no entries for layout length, joist spacing, engineered sizes, etc.

Missing inputs that become unresolved/blocked (not assumptions):

- joistLayoutLengthFeet
- layout-axis authority (spanDirection or spacing-axis trace)
- parentSystemTag / valid parent system
- joistMemberLengthFeet (for LF line)
- joist type/size/spacing on system

User decisions **can** supply scalar overrides (e.g. wave5 test unlocks layout length=40 via `userDecisionRunInput`) — that is explicit reviewer input, not assumption registry.

---

## 12. Validation / authority dependencies

Stage 14 uses `isQuantityBlocked(validation, [system.id, area.id], quantityKey)` for `floor.joists` and `floor.joist-linear-feet`.

| Rule | Trigger | Blocks | Construction vs representation |
|---|---|---|---|
| areaParentSystemResolved | parent not in systems map | both joist keys | **Representation** — missing tag/link |
| spanDirectionResolved (layout-axis) | no spanDirection and no spacing-axis authority | both joist keys | **Authority** on layout-length usability |
| joistLayoutLengthResolved | null layout length | both joist keys | **Construction input** |
| joistType/Size/Spacing resolved | missing assembly fields | both joist keys | **Construction input** |
| joistMemberLengthResolved | null member length | **LF only** (count may pass) | **Construction input** for LF |
| joistLinearFeetTypeSupported | truss/metal joist type | LF only | **Type eligibility** |
| areaSquareFeetResolved | missing SF | **Neither** (warning) | Review-only |
| boundingWalls/openings/members resolved | dangling refs | **Neither** (warning) | Representation |
| inferred parent review | supported-inference parent trace | **Neither** (warning, review) | Representation |

Calculator also requires: `hasJoistCountLayoutAxisAuthority`, `isQuantityInputResolved` on traces, `system.areaIds.includes(area.id)`.

---

## 13. Minimum current calculator contract

| Floor-framing material | Actual construction inputs | Deterministic derivations | Other software prerequisites | Formula / behavior |
|---|---|---|---|---|
| **Floor joists (each)** | joistLayoutLengthFeet; joistSpacingInches; joistType; joistSize | Count from layout+spacing; type/size split/merge; member length from MAX SPAN | FFS/FFA objects linked; spacing-axis authority; resolved traces; not slab-excluded | `ceil(L×12/spacing)+1` |
| **Floor joist LF** | member length + count inputs above | LF = count × memberLength | I-joist or dimensional type; member length resolved | `qty = count × joistMemberLengthFeet` |

---

## Bottom line (factual)

### What work does Stage 11 perform?

Stage 11 converts **`floor-framing-system` and `floor-framing-area` Evidence** into domain objects with `FFS-*` / `FFA-*` ObjectIds, resolves joist assembly fields, **translates** relationship tags to ObjectIds, applies deterministic **reconciliation** (combined joist type split, sibling assembly merge, MAX SPAN → member length, spacing-axis authority marking, slab parent rejection, bay fragment merge), and links areas to systems when **explicit `parentSystemTag`** Evidence exists. It does **not** compute joist counts, derive layout length from geometry or SF, or read walls/openings for math.

### Why did Beckstead produce crawl joist material?

**Clarification:** The successful quantity is **31 joists (each)**, driven by **40 ft** `joistLayoutLengthFeet` at **16"** spacing — not 40 joists.

| Run | Floor joist output |
|---|---|
| **Frozen M.4** `14-calculations.json` | **0** floor lines |
| **Raw M.4 Evidence** re-resolve today | **0** — parent `FFS-UNRESOLVED`; M.5 frozen test **fails** |
| **M.5 fixture / floor-layout-authority test** | **31 each + 527 LF** — proves calculator when parentSystemTag + layout + spec present |
| **PL v1d + construction semantic** | Floor lines when CS pass adds parentSystemTag (test conditional on artifacts) |
| **Wave5 full Evidence** re-resolve | **0** — layout conflicts / missing spacing-axis on linked bays |

Success **proves:** when reader supplies **explicit floor-domain Evidence** for joist spec, **40 ft spacing-axis bay length**, **17 ft member span**, and **area→system ownership**, Stage 11 repackages and Stage 14 deterministically emits count+LF. It does **not** prove raw M.4 frozen pipeline currently completes that chain without parentSystemTag or Stage 6 relationship Evidence.

### What useful floor information does not become material?

- **7 of 8** M.4 floor areas: no joistLayoutLengthFeet (main floor, garage, patios, etc.)
- **Rim/board notes** on crawl system
- **Main floor 1621 SF** without layout length
- **All wave5 bays** with unresolved layout or missing authority in default resolve
- **Subfloor/sheathing** (Stage 10; blocked on Beckstead for separate reasons)

### Limiting factors (combination)

| Factor | Applies to Beckstead |
|---|---|
| Reader capability | **Partial** — crawl spec + 40 ft + 17 ft span recovered on M.4 Evidence |
| Representation / translation | **Primary** — no parentSystemTag in frozen M.4; wave5 layout conflicts; CS Evidence absent from frozen artifact |
| Derivation / calculator | **Ready** — formula works in fixture; not reached when parent/link/authority missing |
| Validation blocking | **Secondary** — would block if partial objects reached validator without layout authority |
| Assumptions | **None** — gaps stay unresolved |

**Not primarily reader failure** for the crawl bay: the crawl joist specification and 40 ft dimension are on Evidence. **Primarily representation failure** (area→system link not in frozen Evidence) plus **layout-axis authority** requirements before the existing calculator can run.
