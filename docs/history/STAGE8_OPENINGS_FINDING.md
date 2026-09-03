# Stage 8 Openings — Factual Finding

**Scope:** Current Stage 8 `openings` / `resolveOpenings`, involved helpers/schemas, interaction with Stage 7 walls, Stage 9 header linking where relevant, and Stage 14 `calculateOpeningFraming`.  
**Question:** After READ THE PLANS has established what the plans say and show about openings, what does the current opening implementation do between that information and opening-framing material calculations?  
**Authority:** Code and tests only. No KEEP/REMOVE recommendations. No replacement design.

**Primary files:**
- Stage wiring: [`createFramingStages.ts`](../src/framing/stages/createFramingStages.ts) (orders 8, 9, 13, 14)
- Resolver: [`resolveOpenings.ts`](../src/framing/resolve/resolveOpenings.ts)
- Helpers: [`openingPropertyPaths.ts`](../src/framing/resolve/openingPropertyPaths.ts), [`applyWallOpeningBacklinks.ts`](../src/framing/resolve/applyWallOpeningBacklinks.ts), [`ids.ts`](../src/framing/resolve/ids.ts) (`createOpeningObjectId`)
- Schema: [`opening.schema.ts`](../src/framing/schemas/opening.schema.ts)
- Pre–Stage 8 geometry Evidence: [`buildOpeningEvidenceFromCompiledPages.ts`](../src/framing/geometry/buildOpeningEvidenceFromCompiledPages.ts), adopt/mark ownership
- Stage 9 headers: [`linkOpeningHeaderRelationships.ts`](../src/framing/resolve/linkOpeningHeaderRelationships.ts)
- Calculator: [`calculateOpeningFraming.ts`](../src/framing/calculate/calculateOpeningFraming.ts)
- Assumptions: [`assumptionRegistry.ts`](../src/framing/claims/assumptionRegistry.ts)
- Validation: [`openings.validator.ts`](../src/framing/validators/openings.validator.ts)

---

## 1. Stage 8 input

### What Stage 8 receives

1. Stage 6 `extractedEvidence.evidence` (`Evidence[]`)
2. Stage 7 `wallFraming` payload (`walls` + `segments`) — used only to map parent tags/run keys to wall/segment ObjectIds
3. Optional `userDecisionRunInput` (decisions / governing answers / review items)

Stage 8 does **not** read compiled pages, `projectDictionary`, plan index, or ODL companions directly.

### Major properties — origin vs representation

| Property ultimately on `Opening` / used downstream | Typical plan/reader origin (A) | How it reaches Stage 8 (B) |
|---|---|---|
| Opening subject identity (`opening:p…:gap…` or semantic keys) | Drawing Compiler PBG opening-gap suspects; Claude opening subjects; mark adopt onto geometry | Stage 6 opening-geometry Evidence / Claude / adopt remints as `subjectKind:"opening"` |
| `parentPhysicalRunKey` | Compiler gap↔run ownership (`governOpeningPhysicalRunOwnership`) | Stage 6 geometry Evidence property — **relationship already known on compiled page / governed candidate**; Stage 6 repackages as Evidence |
| `parentWallTag` | Claude explicit wall host tag (when emitted) | Claude Evidence |
| Category | Geometry mark literal / Claude / adopt | Stage 6 Evidence |
| Nominal / rough width & height | Geometry dim ownership; Claude printed dims; adopt of explicit printed dims | Stage 6 Evidence (mark-decoded dims may be filtered in select) |
| `positionOffsetFeetFromSegmentStart` | Geometry gap position along run | Stage 6 geometry Evidence |
| `dimensionOwnershipStatus` | Compiler dimension governance | Stage 6 Evidence |
| `scheduleReference` / `detailReference` / `fireRating` | Claude / adopt | Stage 6 Evidence |
| `quantity` | Claude (or other Evidence) | Stage 6 Evidence — Stage 8 does not invent |
| `kingStudCount` / `jackStudCount` | Explicit Evidence if present | Stage 6 Evidence; else null until Stage 14 assumption (king only) |
| `identity.boundSubjectKey` | Explicit Evidence binding two opening subjects | Stage 6 Evidence — merge machinery in Stage 8 |
| `identityRole` | Explicit Evidence or inferred in Stage 8 from geometry key / parent | Mix: Evidence or Stage 8 classification heuristic |
| Parent wall/segment ObjectIds | Derived from run key/tag + Stage 7 wall mint | Stage 8 **translates** already-known host run/tag into `parentWallId` / `parentObjectId` |
| `headerMemberId` | Header mark on plans | Stage 8 always leaves `null`; Stage 9 links from `headerMemberTag` Evidence |
| Wall assembly (stud size/spacing) for calc | Stage 7 wall object (from earlier reader/Evidence path) | Not Stage 8 input fields — consumed at Stage 14 via parent wall |

**Beckstead note:** Tests emphasize opening **identity** resolution (`beckstead-opening-identity.test.ts`) and frozen `08-openings.json` in pipeline proofs. Product commentary notes Beckstead freeze historically at **0 opening materials** when calc prerequisites (parent + wood-stud wall + dims) are incomplete (`m3-subset-f-opening-material-path.test.ts` comment).

---

## 2. Opening minting / existence

### What creates an Opening domain object

`resolveOpenings`:

1. Filter Evidence with `subjectKind === "opening"`.
2. Group by `subjectKey`.
3. `buildOpeningResolveClusters`: geometry keys (`opening:p…`) become one cluster each; semantic keys cluster via `clusterSemanticOpeningGroups`; then `applyExplicitIdentityBindingMerges` for unique `identity.boundSubjectKey` edges.
4. `assertUniqueOpeningIds` — throw if two clusters mint the same ObjectId.
5. `resolveOneOpening` builds one `Opening` per cluster.

Object id: `createOpeningObjectId(canonicalSubjectKey)`.

### Discover vs convert

Stage 8 **does not discover new physical openings from the PDF**. It converts existing opening Evidence subjects into domain objects. Physical gaps / marks / Claude openings must already exist as Evidence (Stage 6 geometry promotion gate `shouldPromoteOpeningToDomain`, Claude, adopt, etc.).

### What already established the opening before Stage 8

- Compiler: PBG `openingGapSuspects` on physical runs → governed candidates → Evidence subjects `opening:p{page}:{run}:gap{i}` with parent run, dims, category, position when promoted.
- Claude: semantic opening Evidence (category, schedule/detail, dims, tags).
- Adopt: remints Claude props onto geometry subjects when mark ownership is ESTABLISHED.

### Eligibility inside Stage 8

Stage 8 itself has **no** PBG authority re-check. It requires at least one opening Evidence group. Parent mapping requires resolved `parentPhysicalRunKey` or `parentWallTag` **and** a matching Stage 7 wall/segment; otherwise parent fields stay null (object still mints).

---

## 3. Resolution operations (`resolveOpenings`)

| Step | Helper | Input | Output / change | New construction understanding? | Example |
|---|---|---|---|---|---|
| Group | `groupBySubjectKey` | Evidence | Map subjectKey → records | No | Geometry + Claude keys |
| Geometry clusters | `buildOpeningResolveClusters` | Geometry keys | One cluster per `opening:p…` | No | `opening:p4:physical-run:…:gap0` |
| Semantic clusters | `clusterSemanticOpeningGroups` | Non-geometry opening groups | Corroboration-gated semantic clusters | Clustering only — no new plan facts | Dining semantic openings in Beckstead identity tests |
| Identity-binding merge | `applyExplicitIdentityBindingMerges` | Clusters + `identity.boundSubjectKey` Evidence | Merged records / absorbed keys | No — merges already-bound subjects | Explicit bind Evidence only; no proximity merge |
| Unique IDs | `assertUniqueOpeningIds` | Clusters | Throw on ObjectId collision | Guard | — |
| User decisions | `buildUserDecisionContext` | Optional decisions | Override index | No | Run-2 overrides |
| Per cluster | `resolveOneOpening` | Cluster + wallFraming | One `Opening` | Mostly transform | — |
| Scalar properties | `resolveOpeningPropertyAuthority` / `selectCandidate` + `normalizeOpeningCandidate` | Records | category, dims, quantity, refs, fireRating, king/jack counts, identityRole Evidence, geometry props | No — pick/normalize Evidence | `"unknown"` category treated as absence |
| Parent run map | `resolvePhysicalRunRelationship` | Resolved `parentPhysicalRunKey` + walls | `parentWallId`, `parentObjectId` (= segment id) or null with unresolved traces | **Translation** of known run host → domain IDs | Run key → `createWallObjectId` / `createWallSegmentObjectId`; requires wall exists |
| Parent tag map | `resolveWallRelationship` | `parentWallTag` if no run key | Same parent fields | Translation | Explicit wall tag Evidence |
| Identity role | `classifyOpeningIdentityRole` | Geometry key / parent / Evidence | `occurrence` \| `schedule_definition` \| `unresolved_identity` | Classification rule over existing signals | Geometry key ⇒ occurrence |
| Header | hardcoded | — | `headerMemberId: null` | Deferred to Stage 9 | — |
| Traces / status | `createTrace`, completion | Decisions | `resolutionTraces`, `evidenceIds`; review/blocking defaults | Bookkeeping | — |
| Assumptions | — | — | `assumptionIds: []` | None at Stage 8 | — |

**Properties covered:** dimensions (nominal/rough W/H), category, schedule/detail refs, fireRating, quantity, king/jack counts (if Evidence), position offset, dimensionOwnershipStatus, parent wall/segment IDs, identityRole, absorbedSubjectKeys, ObjectId, traces. **Not** set: `headerMemberId`.

---

## 4. Opening ↔ wall relationship

### Trace

```
Compiler gap on physical run (parentPhysicalRunKey on governed candidate)
  → Stage 6 Evidence propertyPath "parentPhysicalRunKey" (or Claude parentWallTag)
  → Stage 8 selectCandidate
  → resolvePhysicalRunRelationship / resolveWallRelationship
       createWallObjectId(runOrTag) → parentWallId
       createWallSegmentObjectId(wallId) → parentObjectId
       lookup wallFraming.walls / .segments — must exist
  → Opening.parentWallId / parentObjectId
  → Stage 14 resolveParentSegment(opening.parentObjectId) → segment → wall
```

| Step | Discover vs translate |
|---|---|
| Gap on run in compiler | **Construction relationship** learned in reader/geometry |
| Evidence `parentPhysicalRunKey` | **Repackage** of that relationship |
| Stage 8 ObjectId mapping | **Translate** run/tag → wall/segment domain IDs |
| Require Stage 7 wall mint | Architecture prerequisite — run must already be a wall subject |

### If canonical parent is absent

- Stage 8: Opening still exists; `parentObjectId` / `parentWallId` null; traces say mapped ids but no matching wall / missing host Evidence.
- Stage 13: For non–`schedule_definition`, failed parent rules set `canCalculate: false` on opening framing / king / sill / cripple quantity keys.
- Stage 14: `resolveParentSegment` → `continue` — **no** king/jack/sill/cripple materials for that opening.
- Stage 14 wall stud netting: openings without `parentObjectId` matching a segment are not linked to that segment (`openingsOnSegment` filters on `parentObjectId`).

---

## 5. Wall backlinks

**Behavior:** `applyWallOpeningBacklinks(wallFraming, openings)` sets each segment’s `openingIds` to include openings whose `parentObjectId === segment.id`. May publish wallFraming artifact override + companion when links change.

**What consumes `segment.openingIds`?**
- Stage change detection / artifact override wiring
- Takeoff/report-style listings and some non-wall domain validators (floor/roof/sheathing have their own `openingIds` fields — separate)
- **Not** `calculateOpeningFraming`
- **Not** `calculateWallFraming` stud netting (uses `opening.parentObjectId === segment.id` directly)

**Does calculation require backlinks?** No. Opening↔wall relationship already exists as `Opening.parentObjectId` / `parentWallId` (and earlier as `parentPhysicalRunKey` Evidence) before backlinks are written. Backlinks are a reverse index on the wall artifact.

---

## 6. Opening ↔ structural member / header

| Layer | What happens |
|---|---|
| Plans / Evidence | `headerMemberTag` on opening Evidence and/or `supportedOpeningTag` on member Evidence (Claude prompts instruct explicit link only) |
| Stage 8 | Does **not** resolve header; `headerMemberId` always `null`. Relationship path `headerMemberTag` is listed but unused in `resolveOneOpening` |
| Stage 9 | `linkOpeningHeaderRelationships`: maps tags ↔ `createStructuralMemberObjectId`, sets `opening.headerMemberId`, member `supportedObjectIds`; may override openings/members artifacts |
| Stage 14 opening calc | Uses `headerMemberId` only for **cased** cripples-above eligibility (`cased` ∧ non-null header ∧ rough height). Does **not** use `headerMemberTag`. Does **not** emit header lumber |

**Separation:**
- **Construction info from plans:** header/opening association marks when explicitly extracted.
- **Identity/linking machinery:** Stage 9 ObjectId linking + backlinks on members.
- **Required by current opening material formulas:** only the cased cripple-above gate needs `headerMemberId`; king/jack/sill/window cripples do not.

---

## 7. What Stage 14 actually needs (`calculateOpeningFraming`)

Entry: `calculateOpeningFraming(openings, wallFraming, validation?)` via `coordinateFramingCalculations`.

Shared software gate before any material: `parentObjectId` → existing wall-segment → wall via `segment.parentWallId`.

Shared construction eligibility (`isOpeningEligibleForWallFraming`): category ∈ {door, window, cased}; wood-stud wall (`assembly.material` wood/lumber **or** `isWoodStudWallType(wallType)`); resolved `wall.assembly.studSize`.

### Per material

#### King studs (`opening.king-studs`)

| | |
|---|---|
| **A. Construction inputs** | Per-occurrence king count (Evidence or assumed **2**); `opening.quantity`; wall `studSize` (label) |
| **Formula** | `kingStudCountPerOccurrence × quantity` (each) |
| **B. Prerequisites** | Parent segment+wall; eligible category/wood stud; validation not blocking king or `opening.framing`; quantity resolved; registry assume if count missing |
| **Skip/null** | No parent/wall; ineligible; blocked; quantity unresolved; registry not `assumed`; quantity ≤0 |

#### Jack studs (`opening.jack-studs`)

| | |
|---|---|
| **A. Construction inputs** | Explicit `jackStudCount`; `opening.quantity`; wall studSize (label) |
| **Formula** | `jackStudCount × quantity` |
| **B. Prerequisites** | Same eligibility/parent/validation; **no** assumption registry |
| **Skip/null** | Missing jack count → **pending claim** (no materials); else same skips |

#### Rough sill (`opening.rough-sill`) — windows only

| | |
|---|---|
| **A. Construction inputs** | `dimensions.roughWidthFeet`; `quantity`; wall studSize as sill size via assumption |
| **Formula** | LF = `roughWidthFeet × quantity`; description uses assumed sill size = wall studSize |
| **B. Prerequisites** | `category === "window"`; eligibility; rough width + quantity resolved; registry `roughSillSize` assumed |
| **Skip/null** | Non-window; blocked; unresolved width/qty; registry fail; studSize null |

#### Cripples above (`opening.cripples-above`)

| | |
|---|---|
| **A. Construction inputs** | Rough width; wall stud spacing; quantity; wall studSize (label) |
| **Formula** | Per occurrence `max(0, ceil((roughWidthFeet×12)/spacingInches) - 1)` × quantity |
| **B. Prerequisites** | Window **or** (cased ∧ `headerMemberId` ∧ rough height); shared eligibility; spacing resolved; registry `crippleStudLayout` must assume or materials cleared |
| **Skip/null** | Not eligible above; preconditions fail; registry ≠ assumed |

#### Cripples below (`opening.cripples-below`)

| | |
|---|---|
| **A. Construction inputs** | Same formula as above |
| **B. Prerequisites** | `category === "window"` only + shared preconditions + layout assumption |
| **Skip/null** | Non-window; same as above |

**Not calculated here:** headers, opening.framing aggregate lumber, garage-door packages, connectors.

**Not consulted:** `bindingAuthorityGrade`, confidence, Evidence status fields, `segment.openingIds`, `identityRole` (calculator does not read it; schedule_definition openings are skipped in practice mainly via missing parent / validation, not an explicit identityRole check in the calculator).

---

## 8. Derivations

### Currently performed

| Where | Derivation |
|---|---|
| Stage 8 | ObjectId from subjectKey; parent wall/segment ids from run key or wall tag; identityRole classification; candidate consensus / conflict→unresolved; identity-binding cluster merge |
| Stage 9 | headerMemberTag → headerMemberId ObjectId |
| Stage 14 | King total; jack total; sill LF; cripple count from rough width + spacing; stud-size copy into sill size assumption |

### Reader info that exists but requires explicit resolved/link form before use (factual)

- Host run on compiled gap candidate must be Evidence `parentPhysicalRunKey` **and** Stage 7 wall mint **and** Stage 8 ObjectId map before Stage 14 uses parent.
- Claude dims on non-geometry subjects need adopt (or same subjectKey) to sit on the geometry opening Stage 8/14 prefer.
- Header mark Evidence unused until Stage 9 sets `headerMemberId` (cased cripples-above).
- Jack count: no derivation from width; must be explicit Evidence or remains pending.
- Wall stud size/spacing must be resolved on the **wall domain object**, not read from compiled notes at calc time.

---

## 9. Assumptions

Registry entries used by opening framing (`assumptionRegistry.ts` + calculator):

| Missing / needed input | Assumption | Conditions | Resulting material | Review / decision | Without assumption |
|---|---|---|---|---|---|
| `kingStudCount` | Default **2** per occurrence (`KING_STUD_COUNT_DEFAULT`) | Eligible opening; quantity resolved; consult `opening.king-studs` / `kingStudCount` | King studs line with assumption claim status | Review item id from rule `opening.kingStudCount.default`; assumption object emitted when `active` | No king materials (`resolveKingStudCountPerOccurrence` → null) |
| Rough sill **size** (not length) | Assumed size = parent wall `studSize` | Window; rough width + quantity; eligible; studSize present | Rough sill LF (length from rough width); size label from assumption | Review item `opening.roughSillSize.default` | No sill materials |
| Cripple layout method | `"layout-continuation-from-rough-width"` | After cripple line(s) built | Attaches assumption to above/below cripple lines; claim status with assumption | Review item `opening.crippleLayout.default` | Calculator **clears** cripple materials if consult ≠ `assumed` |

**No registry / not assumed:** `jackStudCount`, rough width/height, quantity, category, parent, wall stud spacing (required resolved for cripples), headers.

**Blocked/unresolved without assumption attempt:** missing parent; non–wood-stud / wrong category; missing quantity; missing rough width; missing wall studSize; missing jack count (pending claim); missing wall spacing for cripples; Stage 13 `canCalculate: false`; cased above without headerMemberId or rough height.

---

## 10. Validation / authority dependencies Stage 14 opening calc consults

Via `isQuantityBlocked(validation, objectIds, quantityKey)` only:

| Gate (Stage 13 openings validator, factual effect) | What it blocks when `canCalculate: false` |
|---|---|
| Missing `parentObjectId` (occurrences) | Opening framing aggregate + king / sill / cripples (category-gated impact list) |
| Missing/invalid parent wall | Same family of opening quantities |
| Category / rough-width / quantity failures (category-gated impacts) | Corresponding emit keys |
| Jack count missing when header linked | `opening.jack-studs` (`canCalculate: false`); skipped if no header |
| Default rules (king/sill/cripple layout) | Typically **warning / not-blocked** with `canCalculate: true` when defaults may apply — do not themselves suppress calc |

Calculator also re-checks eligibility independently (category, wood stud, studSize, parent segment).

**Not consulted by calculator:** confidence evaluations, Evidence relationship/status, bindingAuthorityGrade, dictionary governance, `segment.openingIds`.

---

## 11. Minimum current calculator contract

| Opening material | Actual construction inputs used by formula | Other current software prerequisites | Formula / current behavior |
|---|---|---|---|
| **King studs** | Count per opening (Evidence or assumed 2); opening quantity; wall stud size (spec label) | `parentObjectId`→segment→wood-stud wall with studSize; category door/window/cased; validation not blocking; quantity resolved | `count × quantity` each |
| **Jack studs** | Explicit jackStudCount; quantity; wall stud size (label) | Same eligibility/parent; **no** default | `jackStudCount × quantity`; else pending claim |
| **Rough sill** | Rough width; quantity; sill size assumed = wall studSize | Window only; same eligibility; registry assume size | LF = `roughWidth × quantity` |
| **Cripples above** | Rough width; wall stud spacing; quantity | Window, or cased+headerMemberId+rough height; eligibility; layout assumption | `max(0, ceil(width_in/spacing)-1) × quantity` |
| **Cripples below** | Same | Window only + layout assumption | Same count formula |
| **Header lumber** | — | — | **Not implemented** in this calculator |

### Bottom line (factual)

Between reader-established opening information and opening material quantities, Stage 8 **converts opening Evidence into `Opening` domain objects**, **classifies identity role**, **merges explicitly bound subjects**, and **translates already-known host run/tag relationships into `parentWallId` / `parentObjectId` against Stage 7 walls**. It does not invent openings, dims, or hosts from the PDF. Wall `openingIds` backlinks reverse-index that parent link and are **not** required by Stage 14. Header ObjectIds are filled in Stage 9. Stage 14 then needs a resolvable parent segment on a wood-stud wall plus category/quantity/rough-width (and for some lines assumptions or explicit jack counts) to emit king studs, jack studs, rough sill, and cripples — and skips entirely when the parent ObjectId mapping or wall eligibility is missing.
