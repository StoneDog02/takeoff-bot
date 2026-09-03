# Stage 12 Roof Framing — Factual Finding

**Scope:** Current Stage 12 `roofFraming` / `resolveRoofFraming`, involved helpers/schemas, and Stage 14 `calculateRoofFraming`.  
**Question:** After READ THE PLANS has understood roof construction, geometry, planes, pitch, framing direction, systems, specifications, structural members, schedules, notes, and natural relationships, what does Stage 12 actually add before roof-framing material calculation?  
**Secondary question:** Why does Beckstead produce zero roof-framing material, and where is the failure boundary?  
**Authority:** Code, tests, and frozen Beckstead artifacts only. No KEEP/REMOVE recommendations. No replacement design.

**Primary files:**
- Stage wiring: [`createFramingStages.ts`](../src/scopes/framing/stages/createFramingStages.ts) (order 12)
- Resolver: [`resolveRoofFraming.ts`](../src/scopes/framing/resolvers/resolveRoofFraming.ts)
- Parent-system link: [`resolveRoofPlaneParentSystem.ts`](../src/scopes/framing/resolvers/resolveRoofPlaneParentSystem.ts), [`resolveEvidenceBackedParentSystemLink.ts`](../src/scopes/framing/resolvers/resolveEvidenceBackedParentSystemLink.ts)
- Property paths: [`roofFramingPropertyPaths.ts`](../src/scopes/framing/resolvers/roofFramingPropertyPaths.ts)
- Schema: [`roof-framing.schema.ts`](../src/scopes/framing/schemas/roof-framing.schema.ts)
- Stage 6 relationship bridge (not Stage 12): [`buildAreaSystemRelationshipEvidence.ts`](../src/scopes/framing/geometry/buildAreaSystemRelationshipEvidence.ts)
- Calculator: [`calculateRoofFraming.ts`](../src/scopes/framing/calculators/calculateRoofFraming.ts)
- Validation: [`roof-framing.validator.ts`](../src/scopes/framing/validators/roof-framing.validator.ts)
- Fixture: [`roofFramingCommonRafterEvidence.ts`](../src/scopes/framing/demo/roofFramingCommonRafterEvidence.ts)
- Beckstead tests: [`beckstead-wave5-structural-milestone.test.ts`](../tests/scopes/framing/beckstead-wave5-structural-milestone.test.ts)

---

## 1. Stage 12 input

### What Stage 12 receives (actual wiring)

Stage 12 reads **only**:

1. Stage 6 `extractedEvidence.evidence` (`Evidence[]`)
2. Optional `userDecisionRunInput` (user decisions + review items for scalar overrides)

Stage 12 does **not** read wall framing, compiled pages, `projectDictionary`, geometry artifacts, structural members, or sheathing directly — despite [`roof-framing.spec.md`](../src/scopes/framing/specs/roof-framing.spec.md) listing those as consumed artifacts.

Stage 6 may append relationship Evidence (`buildAreaSystemRelationshipEvidence` for roof domain, `buildConstructionSemanticRelationshipEvidence` for floor only) before Stage 12 runs; Stage 12 only sees merged `Evidence[]`.

### Major properties — earliest source vs Stage 12 repackaging

| Property on `RoofFramingSystem` / `RoofPlane` | Typical plan/reader origin | How it reaches Stage 12 |
|---|---|---|
| System / plane subject keys | Roof plan labels, truss area names, layout regions | `subjectKind:"roof-framing-system"` / `"roof-plane"` Evidence |
| `assembly.framingType` | Truss vs stick framing notes, schedules | Evidence on roof-framing-system |
| `assembly.memberSize` | Rafter/truss size callouts | Evidence on system |
| `assembly.memberSpacingInches` | Truss/rafter spacing (e.g. 24" O.C.) | Evidence on system |
| `rafterLayoutLengthFeet` | Explicit gable/ridge-axis bay length along spacing axis | Evidence on roof-plane — **not derived from area SF or pitch** |
| `spanDirection` | Cardinal span wording | Evidence on roof-plane — **required for calculator** |
| `pitch` | Slope callouts (e.g. 2.5/12) or note text | Evidence on roof-plane — **stored; not used in count formula** |
| `areaSquareFeet` | Roof area callouts | Evidence on plane — **not used by calculator** |
| `parentSystemTag` → `parentSystemId` | Explicit plane→system ownership | Evidence tag → `RFS-{tag}` ObjectId |
| `boundingWallTag`, `openingTag`, `structuralMemberTag` | Explicit associations | Tag → ObjectId arrays — **not used in rafter math** |
| `system.planeIds` | Derived from plane parent links | Stage 12 `linkSystemPlaneIds` |

**Information on Evidence paths that Stage 12 does not consume (Beckstead example):**

| Reader fact on Evidence | Property path | Stage 12 |
|---|---|---|
| Ice/water shield note | `note.iceAndWaterShield` on ROOF LAYOUT system | **Ignored** — not in `ROOF_SYSTEM_PROPERTY_PATHS` |
| Attic ventilation note | `note.atticVentilation` | **Ignored** |
| Sheet index refs | `context.sheetIndexReference` | **Ignored** |
| Drag strut load note | `note.dragStrutLoad` | **Ignored** |

---

## 2. Roof framing system / plane creation

### What creates a `RoofFramingSystem`

`resolveRoofFraming`:

1. Filter Evidence with `subjectKind === "roof-framing-system"`.
2. Group by `subjectKey`; converge to `RFS-{sanitizedKey}`.
3. `resolveOneSystem` — scalars from `ROOF_SYSTEM_PROPERTY_PATHS` only.
4. `linkSystemPlaneIds` — populate `planeIds` from linked planes.

### What creates a `RoofPlane`

Same pattern with `subjectKind === "roof-plane"` → `RFP-{sanitizedKey}`:

- Scalars from `ROOF_PLANE_PROPERTY_PATHS`
- Relationships: parentSystemTag, boundingWallTag, openingTag, structuralMemberTag
- Default missing parent: `RFS-UNRESOLVED`
- `applyExplicitParentSystemLink` — **explicit `parentSystemTag` only** (same Tier-A contract as floor/sheathing)

### Discover vs convert vs infer

| Behavior | Present? |
|---|---|
| Discover roof planes from PDF geometry | **No** |
| Derive `rafterLayoutLengthFeet` from area SF, pitch, or diagrams | **No** (extraction rules forbid) |
| Convert roof-framing Evidence into domain objects | **Yes** — primary function |
| Derive common-rafter count | **No in Stage 12** — Stage 14 formula |
| Infer plane→system without explicit tag | **No** |
| Adjust area for pitch (sloped SF) | **No** |

### Existence / eligibility (calculator)

- System + plane Evidence subjects.
- Plane `parentSystemId` must match existing system.
- System `planeIds` must include plane.
- `assembly.framingType` must pass `isStickCommonRafterFramingType` (excludes truss/prefab/metal).

---

## 3. Resolution operations

| Step | Input | Output / change | New construction understanding? |
|---|---|---|---|
| Group / converge | Evidence | RFS-* / RFP-* clusters | Identity normalize |
| Scalar resolve (system) | framingType, memberSize, spacing, name, level, phase | system fields | Select/normalize Evidence |
| Scalar resolve (plane) | layout, framingDirection, spanDirection, rafterLayoutLengthFeet, pitch, areaSquareFeet | plane fields | Select Evidence |
| Parent link | parentSystemTag | parentSystemId | **Translation** |
| linkSystemPlaneIds | plane.parentSystemId | system.planeIds | Bookkeeping |

**Not performed:** ridge/hip/valley length derivation, rafter installed-length LF, truss count, pitch-adjusted area, geometry from compiled pages, consumption of `note.*` / `context.*` Evidence paths.

---

## 4. What READ THE PLANS already knows (before Stage 12)

| Reader path | Beckstead example | Stage 12 consumes? |
|---|---|---|
| Roof layout / framing notes | `ROOF LAYOUT` system: prefab wood trusses, ice/water shield, attic vent notes | **Partial** — only `assembly.framingType` on mapped paths; notes on `note.*` paths **stranded** |
| Prefab / scissor truss areas | `PREFAB TRUSSES - GARAGE`, `SCISSOR TRUSSES - MST BEDROOM` with spacing 24 | **Partial** — spacing stored; framingType often null on area-named systems |
| Truss drag strut callouts | `GARAGE WALL TRUSS DRAG STRUT`, `GIRDER TRUSS DRAG STRUT` as roof-framing-system subjects | Minted as systems; **not stick-rafter eligible**; memberSize null |
| Roof plane pitch | `SCISSOR TRUSSES - MST BEDROOM` pitch `2.5/12`; ROOF LAYOUT pitch as note text | **Partial** — pitch string stored; **not used in count** |
| Rafter layout length / span direction | **Not extracted** on Beckstead planes | **Missing** — required for calculator |
| Plane→system ownership | **0 parentSystemTag** in M.4/wave5 roof Evidence | **Fails** — all planes `RFS-UNRESOLVED` |
| Area-system bridge (Stage 6) | Supported for roof domain in code | **0 bridge emissions** in Beckstead frozen artifacts |
| Working fixture | `buildRoofFramingCommonRafterEvidence` — stick rafter RFS-001 + RFP-001 | **Full path** → 16 common rafters |

**Property-path / representation gaps:**

- Claude emits rich notes on non-resolver paths (`note.*`, `context.*`).
- Beckstead roof is **prefab truss–dominated**; calculator accepts **stick common rafters only**.
- Plane subjects named like truss areas (`SCISSOR TRUSSES - MST BEDROOM`) are not the same as a resolved stick-rafter plane with layout length + span.

---

## 5. Beckstead zero-roof trace

Frozen M.4 (`artifacts/b2.2m.4/runs/beckstead-audit-b/framing/`): **5 systems, 2 planes, 0 roof material lines** in `14-calculations.json`. Wave5 re-resolve: **10 systems, 3 planes, 0 materials**. `beckstead-wave5-structural-milestone.test.ts` asserts `roofMaterials.length === 0`.

### Fact-by-fact trace

#### A. Prefab wood trusses (ROOF LAYOUT / MAIN ROOF FRAMING)

| Stage | State |
|---|---|
| **Plan / reader** | Roof framing plan notes: pre-fabricated wood trusses |
| **Stage 6 Evidence** | `roof-framing-system ROOF LAYOUT` → `assembly.framingType="pre-fabricated wood trusses"`; also `note.*`, `context.*` paths |
| **Stage 12** | `RFS-ROOF-LAYOUT`: framingType resolved; memberSize **null**; memberSpacing **null** |
| **Stage 14** | `isStickCommonRafterFramingType("pre-fabricated wood trusses")` → **false** (contains "truss") → **skip** even if plane inputs existed |
| **Failure boundary** | **Calculator path** — truss/prefab explicitly excluded from common-rafter count; **no truss calculator** |

#### B. Prefab / scissor truss areas (spacing only)

| Stage | State |
|---|---|
| **Plan / reader** | PREFAB TRUSSES - GARAGE, SCISSOR TRUSSES - FAMILY ROOM, etc. @ 24" O.C. |
| **Stage 6** | `assembly.memberSpacingInches=24`; framingType **null** on area-named systems |
| **Stage 12** | Systems minted with spacing; no framingType; **no linked planes** (planeIds empty) |
| **Stage 14** | Never reaches formula — no eligible plane+system pair |
| **Failure boundary** | Missing framingType/memberSize/plane link + wrong framing family |

#### C. Roof planes (ROOF LAYOUT, SCISSOR TRUSSES - MST BEDROOM)

| Stage | State |
|---|---|
| **Plan / reader** | Pitch notes (2.5/12 on scissor area; ice/water note text on ROOF LAYOUT plane) |
| **Stage 6** | `roof-plane` subjects with `pitch` only — **no** `rafterLayoutLengthFeet`, **no** `spanDirection`, **no** `parentSystemTag` |
| **Stage 12** | `RFP-*`: parent `RFS-UNRESOLVED`; layout null; span null |
| **Stage 14** | Calculator skips — no system match, no layout, no span |
| **Failure boundary** | **Missing plane inputs** + **missing parentSystemTag** |

#### D. Truss drag strut systems

| Stage | State |
|---|---|
| **Plan / reader** | Drag strut in line with garage wall; girder truss drag strut |
| **Stage 6** | `assembly.framingType="truss drag strut in line with garage wall"` etc. |
| **Stage 12** | Systems minted; not stick-rafter type; no planes |
| **Stage 14** | **No emitter** for drag struts |
| **Failure boundary** | **No implemented calculator path** |

#### E. Roof sheathing (related, Stage 10)

| Stage | State |
|---|---|
| **Plan / reader** | ROOF SHEATHING system on sheathing domain (separate finding) |
| **Stage 12/14** | **Not consumed** by roof framing calculator |
| **Failure boundary** | Separate domain; roof plane `areaSquareFeet` not used |

### Beckstead summary failure boundaries (combination)

1. **Framing-family mismatch** — Beckstead roof is prefab/scissor **truss** construction; Stage 14 only emits **stick common-rafter count**.
2. **Missing calculator inputs** — no `rafterLayoutLengthFeet` or `spanDirection` on any Beckstead plane.
3. **Missing memberSize** (and often framingType) on truss-named systems.
4. **Missing plane→system links** — 0 `parentSystemTag` in frozen Evidence; all planes `RFS-UNRESOLVED`.
5. **Stranded reader notes** — ice/water, ventilation, drag load on non-resolver Evidence paths.
6. **No truss/ridge/hip/LF emitters** — even complete truss Evidence would not produce current roof quantity keys.

---

## 6. Fact vs derivation vs assumption

| Input / behavior | Classification |
|---|---|
| assembly.framingType, memberSize, memberSpacingInches | **FACT** (Evidence on system) |
| rafterLayoutLengthFeet | **FACT** — explicit only; not from SF/pitch |
| spanDirection | **FACT** — required for calculator |
| pitch, areaSquareFeet | **FACT** on plane — **UNRESOLVED for count** (not consumed) |
| parentSystemTag → parentSystemId | **Translation** of FACT tag |
| Common-rafter count `ceil(L×12/spacing)+1` | **DERIVATION** (Stage 14) |
| Pitch-adjusted length or sloped area | **UNRESOLVED** |
| Rafter/truss LF, ridge/hip/valley LF | **UNRESOLVED** — no emitter |
| Truss count / package | **UNRESOLVED** |
| Stick vs truss eligibility | **DERIVATION** — token rules on framingType |
| Governed defaults | **ASSUMPTION: none** — `assumptionRegistry.ts` has zero roof entries |

---

## 7. Geometry / quantity derivation

### Rafters / trusses (Stage 14 only)

| Question | Current behavior |
|---|---|
| Count controlling dimension | `rafterLayoutLengthFeet` along spacing axis |
| Spacing | `assembly.memberSpacingInches` in `ceil(L×12/spacing)+1` |
| End member | **+1** after ceil |
| Member length / span in count | **Not used** for count; **no rafter LF emitted** |
| Pitch effect on count or length | **None** |
| Multiple planes | One count line per eligible plane |
| Truss systems | **Excluded** by framingType gate |

### Roof area

| Question | Current behavior |
|---|---|
| Read directly? | `areaSquareFeet` on plane if Evidence exists — **not used by calculator** |
| Derived from plan geometry in Stage 12? | **No** |
| Pitch adjustment? | **No** |

### Ridges / hips / valleys

**Not represented** in schema properties beyond generic plane layout strings. **No length fields, no derivation, no material emitters.**

### Roof sheathing

Owned by **Stage 10** (`sheathing-system` / `sheathing-area`). Roof plane geometry in Stage 12 **does not feed** sheathing calculator. Beckstead roof sheathing blocked separately (see Stage 10 finding).

---

## 8. Roof system / plane relationships

| Relationship | First known | Representation | Consumer | Required for count? | If link fails |
|---|---|---|---|---|---|
| Plane → system | Explicit ownership note / bridge | parentSystemTag → parentSystemId | Stage 12, Stage 14 | **Yes** | Skip plane |
| System → planes | Derived | planeIds | Calculator membership check | **Yes** | Skip |
| Plane → walls | boundingWallTag | boundingWallIds | Validation warning | **No** | |
| Plane → openings / members | tags | openingIds, structuralMemberIds | Validation warning | **No** | |
| Roof framing → sheathing | Separate sheathing subjects | Stage 10 | Stage 10 | **No** for rafter count | |
| Truss area name ↔ plane subject | Plan labeling | Separate Evidence subjects | **Not auto-linked** | | |

**D14 lens:** Beckstead knows truss areas and roof notes on Evidence before Stage 12; failure is not missing all roof information — it is **wrong framing family for the only calculator**, **missing stick-rafter plane inputs**, and **missing parentSystemTag translation**.

---

## 9. Specification flow (Beckstead examples)

### A. Prefab truss (flows to Stage 12, fails at calculator)

```
Plan: "pre-fabricated wood trusses" on roof layout
→ Evidence: roof-framing-system ROOF LAYOUT, assembly.framingType
→ Stage 12: RFS-ROOF-LAYOUT.assembly.framingType = "pre-fabricated wood trusses"
→ Stage 14: isStickCommonRafterFramingType → false → no output
```

### B. Scissor truss spacing (partial, no output)

```
Plan: SCISSOR TRUSSES - MST BEDROOM @ 24" O.C.
→ Evidence: roof-framing-system, assembly.memberSpacingInches=24
→ Stage 12: RFS-SCISSOR-TRUSSES---MST-BEDROOM spacing=24; framingType null
→ Stage 14: no linked plane with layout+span → no output
```

### C. Working stick-rafter fixture (proves calculator contract)

```
Plan text (fixture): stick rafters 2x8 @ 16", 20 ft layout, north-south span
→ Evidence: RFS-001 + RFP-001 with parentSystemTag, rafterLayoutLengthFeet=20, spanDirection
→ Stage 12: linked system+plane
→ Stage 14: 16 each common rafters (ceil(20×12/16)+1)
```

**Translation boundaries:** subjectKind, resolver property paths vs `note.*`, truss vs stick framingType gate, parentSystemTag requirement, plane layout/span requirements.

---

## 10. What Stage 14 actually calculates

**Stage 14 emits exactly one roof material family today:**

| Material | Construction inputs | Formula | Software prerequisites | Skip / null |
|---|---|---|---|---|
| **Common rafters (each)** `roof.common-rafters` | `rafterLayoutLengthFeet`; `assembly.memberSpacingInches`; `assembly.memberSize`; `assembly.framingType`; `spanDirection` | `ceil(L×12/spacing)+1` | Linked plane+system; stick framingType; resolved traces; not validation-blocked | Missing any input; non-stick framingType; parent/system link fail; blocked validation |

**Explicitly does NOT emit:** rafter LF, ridge/hip/valley lumber, jack rafters, truss count/package, blocking, fascia, roof sheathing, pitch-adjusted quantities.

**Quantity keys / contracts that exist but have no emitter:** only `ROOF_QUANTITY_KEYS.commonRafters` is defined and implemented. No separate truss, ridge, or LF keys in calculator.

**Schema fields with no calc role:** `pitch`, `areaSquareFeet`, `boundingWallIds`, `openingIds`, `structuralMemberIds`, `layout`, `framingDirection` (stored; pitch/SF review-only per claim contracts).

---

## 11. Assumption registry

**No governed assumptions exist for roof framing.** [`assumptionRegistry.ts`](../src/scopes/framing/claims/assumptionRegistry.ts) explicitly excludes rafter spacing, truss design, and SF→framing quantity.

Missing inputs that stay unresolved/blocked:

- rafterLayoutLengthFeet
- spanDirection
- assembly.memberSize
- stick-eligible assembly.framingType
- parentSystemTag / valid parent system

User decisions may override scalars when supplied — reviewer input, not assumption registry.

---

## 12. Validation / authority dependencies

Stage 14 uses `isQuantityBlocked(validation, [system.id, plane.id], ROOF_QUANTITY_KEYS.commonRafters)`.

| Rule | Trigger | Blocks common rafters? | Construction vs representation |
|---|---|---|---|
| planeParentSystemResolved | missing parent system | **Yes** | Representation |
| framingTypeResolved | null framingType | **Yes** | Construction input |
| framingTypeCommonRafterEligible | truss/prefab type | **Yes** (warning severity) | **Framing-family gate** |
| memberSizeResolved | null size | **Yes** | Construction input |
| memberSpacingResolved | null spacing | **Yes** | Construction input |
| spanDirectionResolved | null span | **Yes** | Construction input |
| rafterLayoutLengthResolved | null layout length | **Yes** | Construction input |
| pitchResolved | null pitch | **No** (warning; allows calc) | Review-only |
| areaSquareFeetResolved | null SF | **No** (warning) | Review-only |
| boundingWalls/openings/members | dangling refs | **No** (warning) | Representation |

Calculator also requires: `isStickCommonRafterFramingType`, `isQuantityInputResolved` on all five input traces, `system.planeIds.includes(plane.id)`.

---

## 13. Minimum current calculator contract

| Roof-framing material | Actual construction inputs used | Deterministic derivations | Other software prerequisites | Formula / behavior |
|---|---|---|---|---|
| **Common rafters (each)** | rafterLayoutLengthFeet; memberSpacingInches; memberSize; framingType (stick); spanDirection | Count = ceil(L×12/spacing)+1; stick/truss token gate | RFS/RFP objects linked; planeIds membership; resolved traces | One line per eligible plane; **truss/prefab excluded** |

---

## Bottom line (factual)

### What work does Stage 12 perform?

Stage 12 converts **`roof-framing-system` and `roof-plane` Evidence** into domain objects with `RFS-*` / `RFP-*` ObjectIds, resolves assembly and plane scalars from **fixed property paths only**, **translates** relationship tags to ObjectIds, links planes to systems when **explicit `parentSystemTag`** exists, and preserves partial objects when inputs are missing. It does **not** derive layout length from geometry or pitch, consume rich note/context Evidence paths, or compute rafter/truss quantities.

### Why does Beckstead produce zero roof-framing material?

**Combination**, dominated by **calculator scope + incomplete stick-rafter inputs + truss construction**:

1. **Framing-family mismatch (primary)** — Beckstead Evidence describes **prefab/scissor truss** roof construction; Stage 14 only emits **stick common-rafter count** and rejects framingType tokens containing "truss".
2. **Missing plane calculator inputs** — no Beckstead plane has both `rafterLayoutLengthFeet` and `spanDirection`.
3. **Missing system inputs** — memberSize null on all systems; framingType null on truss-area-named systems.
4. **Missing plane→system links** — 0 `parentSystemTag` in frozen Evidence; planes stay `RFS-UNRESOLVED`.
5. **No alternate emitters** — no truss package, ridge, hip, or rafter LF calculator paths exist.
6. **Stranded notes** — ventilation, ice/water, drag load on `note.*` paths Stage 12 never reads.

### What useful roof information does not become material?

- Prefab/scissor truss designation and 24" spacing on multiple systems
- Roof layout notes (ice/water shield, attic ventilation, drag strut load)
- Pitch strings on planes (2.5/12; note text)
- Truss drag strut system subjects
- Roof sheathing specs (Stage 10 domain; separate zero-output path on Beckstead)

### Limiting factors

| Factor | Applies |
|---|---|
| Reader capability | **Partial** — truss types, spacing, pitch notes recovered; stick-rafter layout/span not |
| Calculator capability | **Primary** — only stick common-rafter count; truss roof out of scope |
| Representation / translation | **Secondary** — no parentSystemTag; note.* paths ignored |
| Validation blocking | **Tertiary** — would block partial objects if they reached validator without inputs |
| Assumptions | **None** |

**Not primarily reader failure** for truss identification — reader correctly captures prefab truss framing. **Primarily calculator scope (stick rafters only) and missing stick-rafter plane inputs / links** for the one implemented quantity path.
