# Stage 7 Wall Framing — Factual Finding

**Scope:** Current Stage 7 `wallFraming` / `resolveWallFraming`, directly involved helpers/schemas, and Stage 14 `calculateWallFraming` consumption.  
**Question:** After READ THE PLANS has established what the plans say and show, what does the current wall-framing implementation do between that information and wall material calculations?  
**Authority:** Code and tests only. No KEEP/REMOVE recommendations. No replacement design.

**Primary files:**
- Stage wiring: [`src/scopes/framing/stages/createFramingStages.ts`](../src/scopes/framing/stages/createFramingStages.ts) (orders 7, 13, 14)
- Resolver: [`src/scopes/framing/resolvers/resolveWallFraming.ts`](../src/scopes/framing/resolvers/resolveWallFraming.ts)
- Helpers: [`wallFramingPropertyPaths.ts`](../src/scopes/framing/resolvers/wallFramingPropertyPaths.ts), [`convergeEvidenceByCanonicalObjectId.ts`](../src/scopes/framing/resolvers/convergeEvidenceByCanonicalObjectId.ts), [`ids.ts`](../src/scopes/framing/resolvers/ids.ts)
- Schemas: [`wall.schema.ts`](../src/scopes/framing/schemas/wall.schema.ts)
- Calculator: [`calculateWallFraming.ts`](../src/scopes/framing/calculators/calculateWallFraming.ts), [`netStudDeduction.ts`](../src/scopes/framing/calculators/netStudDeduction.ts)
- Validation consulted by calc: [`wall-framing.validator.ts`](../src/scopes/framing/validators/wall-framing.validator.ts), [`isQuantityBlocked.ts`](../src/scopes/framing/calculators/isQuantityBlocked.ts)

---

## 1. Stage 7 input

### What Stage 7 receives

Stage 7 reads **only**:

1. Stage 6 payload `extractedEvidence.evidence` (`Evidence[]`)
2. Optional `userDecisionRunInput` (user decisions, review items, governing answers) when present

It does **not** read compiled pages, `projectDictionary`, plan index, ODL raw, or Project Learning companions directly.

### Where major wall properties already existed before Stage 7

| Property ultimately on `BuildingWall` / segment | Typical pre–Stage 7 source (learned from plans) | How it reaches Stage 7 | Learned vs repackaged |
|---|---|---|---|
| Wall subject / physical run identity | Drawing Compiler PBG `physical-run:…` on compiled pages | Stage 6 geometry / wall-assembly / dictionary-binding / existence / Claude wall Evidence with that `subjectKey` | Run identity learned in compiler; Stage 6 **repackages** as `subjectKind:"wall"` Evidence |
| Schedule / type-mark subject (`SW2`, etc.) | Schedule OCR / Project Learning / orientation schedule extract | Stage 6 schedule-definition Evidence (`subjectKey` = mark) and/or Claude | Mark definitions learned in reader; Stage 6 **repackages** as Evidence on mark subjects |
| `semanticTypeKey` on a physical run | Compiler semantic binding and/or Project Dictionary subtype binding | Stage 6 binding Evidence (`propertyPath:"semanticTypeKey"`) | Binding learned in reader; Stage 6 **repackages** |
| `bindingAuthorityGrade` | Same binding emitters | Stage 6 grade Evidence twin | Repackaged authority metadata |
| `wallType` | Claude extraction; dictionary class binding (`wood-stud-wall`, shear class); wall-assembly thickness legend | Stage 6 Evidence on wall or mark subject | Mix: plan-derived class/type; existence path sets `"unknown"` as architecture placeholder |
| `lengthFeet` | Compiler dim ownership / plan length observations | Stage 6 `buildGeometryEvidenceFromCompiledPages` → length Evidence; optionally wall-assembly geometry length; Claude | Length learned from plan dims/geometry; Stage 6 **repackages** as Evidence |
| `assembly.studSize` | Plan notes + thickness legend vs PBG thickness; Claude; rarely schedule paths that use this exact propertyPath | Stage 6 wall-assembly Evidence / Claude | Plan-derived when notes/legend exist |
| `assembly.studSpacingInches` | Plan notes (e.g. 16″ O.C.); Claude | Stage 6 wall-assembly note Evidence / Claude | Plan-derived |
| `assembly.plateCount` | Plan notes (double top + bottom → 3); Claude | Stage 6 wall-assembly note Evidence / Claude | Plan-derived / note interpretation |
| `assembly.heightFeet` | Claude / schedule-ish Evidence if emitted under this path | Stage 6 Evidence if present | Plan-derived only if someone emitted this path; Stage 7 does not invent |
| `isShearOrBraced` | Dictionary class binding when reference implies shear; Claude | Stage 6 dict/Claude Evidence | Plan-convention derived, then Evidence |
| `location`, `bearingStatus`, `constructionPhase`, `fireRating`, `assembly.material`, `assembly.sheathing` | Primarily Claude Evidence if present | Stage 6 Claude/merge Evidence | Plan-derived only if extraction emitted them; Stage 7 defaults location/bearing/phase to `"unknown"` when missing |
| `level` | Not resolved from Evidence in Stage 7 | Always `null` on minted wall | Not supplied by current Stage 7 path |

**Beckstead-shaped example:** Physical run on p4 + schedule/mark assembly on `SW2` + binding Evidence `physical-run → SW2` (synthetic path in `calculateWallFraming.bound-physical-run.test.ts`): length and run identity from geometry/compiler side; stud size/spacing/plates often from note/assembly or from mark-subject Evidence after inheritance; schedule sheathing/nailing on `SW*` often use property paths Stage 7 **does not** map into `BuildingWall.assembly` (`WALL_PROPERTY_PATHS` has `assembly.sheathing`, not `assembly.sheathingType`).

---

## 2. Wall minting / existence

### What creates the wall object

`resolveWallFraming`:

1. Keep only Evidence with `subjectKind === "wall"`.
2. Group by exact `subjectKey`.
3. `convergeEvidenceByCanonicalObjectId` merges groups whose `createWallObjectId(subjectKey)` collide after sanitize.
4. For each cluster, `resolveOneWall` builds one `BuildingWall` + one `WallSegment`.

IDs ([`ids.ts`](../src/scopes/framing/resolvers/ids.ts)):

- Wall id = sanitized `subjectKey`, or `W-` + sanitized if needed (e.g. `physical-run:p4:…` typically becomes a `W-physical-run:…`-style id when charset requires prefixing — actually physical-run keys use `:` which is allowed in identifier charset, so the sanitized key often **is** the ObjectId without extra prefix when it already parses as identifier).
- Segment id = `WS-` + wall id without leading `W-`.

### Discover vs convert

Stage 7 **does not discover new physical walls from the PDF**. It converts existing `subjectKind:"wall"` Evidence subjects into domain objects. If no wall Evidence exists for a run/mark, no wall is minted.

### What already established the physical wall/run before Stage 7

Typically Drawing Compiler PBG runs on compiled pages, plus any Stage 6 emitter that created wall Evidence for that key (geometry length, wall-assembly, dictionary binding, semantic binding, wall-existence, Claude).

### Eligibility / authority inside Stage 7

**None.** Stage 7 does not re-check PBG authority, opening-parent demand, or dictionary governance. Those gates (if any) already decided which Evidence rows exist. Stage 7 only requires: at least one wall Evidence record for a subjectKey.

Comment on the resolver: it never applies assumptions, sheet precedence, validation, or quantity calculation.

---

## 3. Resolution operations (`resolveWallFraming`)

| Step | Function / helper | Input | Output / change | New construction understanding? | Beckstead / current example |
|---|---|---|---|---|---|
| Filter + group | `groupBySubjectKey` | Full Evidence list | Map `subjectKey → wall Evidence[]` | No — filters representation | Only `subjectKind:"wall"` rows participate |
| Canonical converge | `convergeEvidenceByCanonicalObjectId` | Groups + `createWallObjectId` | Clusters with merged records, shared `objectId` | No — identity normalize when sanitized keys collide | e.g. whitespace variants of same tag converging |
| User-decision index | `buildUserDecisionContext` | Optional decisions + clusters | Override index by objectId/property | No — human override path | Only when Run-2 decisions supplied |
| Per cluster | `resolveOneWall` | Cluster + all groups | One wall + one segment | Mostly transform; inheritance merge is the main cross-subject combine | Bound physical-run + `SW2` |
| Semantic type on physical-run | `selectCandidate(…, "semanticTypeKey")` | Cluster records | `wall.semanticTypeKey` | No new plan fact — copies binding Evidence | `physical-run:…` → `"SW2"` |
| Authority grade | `selectCandidate(…, "bindingAuthorityGrade")` | Cluster records | `wall.bindingAuthorityGrade` `"A"`\|`"B"`\|null | No — stores grade; **calculator does not read it** | Grade twin Evidence |
| Type-cluster merge | `allGroups.get(semanticTypeKey)` | Mark subject Evidence | `wallResolutionRecords = run records ∪ mark records` | No new facts — **inherits** properties already on mark subject | `SW2` studSize/spacing/plates applied to run wall |
| Per wall property | `resolvePropertyAuthority` → `selectCandidate` + normalize | Merged records | Field value or conflict/`missing` + traces | No — selects among existing Evidence candidates; conflict → unresolved (no precedence) | Conflicting lengths → unresolved length |
| Length on segment | Same for `lengthFeet` | **Run records only** (not mark cluster) | `segment.lengthFeet` | No — length must already be on physical-run Evidence | Dim-owned length on run; mark subjects do not supply segment length |
| Defaults | `resolvedValue` fallbacks | Missing decisions | `location`/`bearingStatus`/`constructionPhase` → `"unknown"`; many fields → `null` | Placeholders, not plan learning | Existence-only wall → `wallType:"unknown"` if that was Evidence candidate |
| Completion / status | `createCompletion` | Resolved field counts | `completion`, `reviewStatus:"no-review-required"`, `blockingStatus:"not-blocked"` | Status bookkeeping | Always those review/blocking defaults at mint |
| Provenance | `tracesForDecision` / `convergenceTraces` | Decisions | `resolutionTraces`, `evidenceIds` | Traceability only | `"explicit-project-value"` vs `"unresolved"` |
| Assumptions | — | — | `assumptionIds: []` always | N/A | Documented: never applies assumptions |
| Level | hardcoded | — | `level: null` | Does not resolve level from Evidence | Schema allows later assumption; Stage 7 never sets it |
| Openings on segment | hardcoded | — | `openingIds: []` | Filled later by Stage 8 backlinks | — |

### Property-by-property behavior in `resolveOneWall`

- **physical-run clustering:** Exact `subjectKey` group; one cluster → one wall. Multiple runs = multiple walls.
- **semantic/type clustering:** Separate Evidence subjects for marks (`SW2`). Linked only when physical-run has resolved `semanticTypeKey`.
- **wallType / stud size / spacing / plate count / shear / fire / material / sheathing / height:** Resolved from merged wallResolutionRecords when Evidence `propertyPath` matches `WALL_PROPERTY_PATHS` and passes `normalizeWallFramingCandidate`.
- **length:** Segment-only path; physical-run records only.
- **bearing / location / phase:** Enum-normalized; else `"unknown"`.
- **authority/grade:** Stored; not used by Stage 14 wall calc.
- **traces:** Method `"explicit-project-value"`, `"unresolved"`, `"supported-inference"` (convergence note), or user-override.

---

## 4. Merging / identity / relationships

Operations whose **primary** purpose is reconciling representations, identity, inheritance, or downstream shape — and what construction info already existed:

| Operation | Purpose | Construction info that already existed |
|---|---|---|
| `groupBySubjectKey` | Bucket Evidence by subject string | Whatever plan facts were already encoded as Evidence on that key |
| `convergeEvidenceByCanonicalObjectId` | Merge subjectKeys that mint the same ObjectId | Same wall facts under alternate key spellings |
| `createWallObjectId` / `createWallSegmentObjectId` | Canonical domain IDs for Stages 8–16 | Physical run or mark identity already in `subjectKey` |
| Always one segment per wall | Satisfy segment-based calc / opening parent model | Length already on Evidence; segment is structural packaging |
| `semanticTypeKey` + mark-cluster merge | Inherit schedule/mark properties onto physical-run wall | Mark assembly/type Evidence and the binding that links run→mark |
| `bindingAuthorityGrade` on wall | Carry binding grade into domain object | Grade already on Evidence; unused by wall material formula |
| `resolutionTraces` / `evidenceIds` / completion | Provenance and completeness metadata | Do not add plan facts |
| Defaults `"unknown"` / `null` | Schema-required placeholders | Absence of plan Evidence |
| Stage 8 later `openingIds` backlink | Relationship list on segment/wall | Opening↔run relationship already in opening Evidence / resolved openings |

---

## 5. What Stage 14 actually needs (`calculateWallFraming`)

Wired via `coordinateFramingCalculations` → `calculateWallFraming(wallFraming, validation, openings)`.

**Materials currently implemented for walls:** **studs** and **plates** only. No wall sheathing, no headers, no connectors in this calculator.

### Studs

**A. Construction inputs that affect quantity/spec**

- `segment.lengthFeet` (positive)
- `wall.assembly.studSpacingInches` (positive)
- `wall.assembly.studSize` (string — used in description / classification; also required for emit)
- Optional netting: openings on segment with `positionOffsetFeetFromSegmentStart` + `dimensions.roughWidthFeet` → `computeNetStudDeduction`; overlapping rough zones → skip deduction (emit baseline only)

**Formula:** `countRegularlySpacedStuds(lengthFeet, spacingInches) = ceil((lengthFeet * 12) / spacingInches) + 1`, then subtract deduction unless blocked by overlap.

**B. Architecture / eligibility prerequisites**

- Segment must have parent wall present in payload (`wallsById.get` else `continue`)
- `isQuantityInputResolved` for length, spacing, studSize (value present and trace method ≠ `"unresolved"`)
- `isQuantityBlocked(validation, [wallId, segmentId], "studs")` → null if Stage 13 issue has `canCalculate: false` for studs on those objects
- `emitLineItem` drops non-finite or ≤0 quantities

### Plates

**A. Construction inputs**

- `segment.lengthFeet`
- `wall.assembly.plateCount` (positive integer)
- Quantity: `lengthFeet * plateCount` (linear feet)
- `studSize` optional for description/`plate-{size}` classification only (not required to emit)

**B. Architecture prerequisites**

- Same parent-wall presence
- Resolved length + plateCount (`isQuantityInputResolved`)
- Validation block on `"plates"`
- Positive finite quantity

### Exact skip / null conditions

1. No wall for `segment.parentWallId` → skip segment entirely  
2. Validation `canCalculate: false` for that quantityKey on wall or segment → null for that line  
3. Missing or conflict-unresolved length / spacing / studSize (studs) or length / plateCount (plates) → null  
4. Quantity ≤ 0 or non-finite after formula → null  

**Not consulted by wall calculator:** `bindingAuthorityGrade`, `semanticTypeKey`, `level`, `location`, `bearingStatus`, `isShearOrBraced`, `fireRating`, `constructionPhase`, `heightFeet`, confidence, Evidence `relationship`/status fields (beyond what already shaped resolved values).

---

## 6. Derivations

### Already performed (deterministic)

| Where | Derivation |
|---|---|
| Stage 7 | ObjectId / segment id from subjectKey sanitize rules |
| Stage 7 | Candidate normalize (enums, positive numbers); unanimous Evidence value selection; conflict → unresolved |
| Stage 7 | Property inheritance: physical-run ∪ mark-subject Evidence when `semanticTypeKey` binds |
| Stage 14 | Stud count from length + spacing; plate LF from length × plateCount |
| Stage 14 | Net stud deduction from opening position + rough width vs stud layout (when openings linked and non-overlapping) |

### Inputs exist elsewhere but Stage 7/14 expect an explicit resolved property (factual gaps in current path — not proposals)

- Schedule columns often land as Evidence under paths like `assembly.sheathingType` / nailing / holdown on `SW*` subjects; Stage 7 only copies paths in `WALL_PROPERTY_PATHS` (includes `assembly.sheathing`, not `sheathingType`). Those schedule facts do not populate calculator inputs.
- PBG length/geometry exist on compiled pages; Stage 14 never reads compiled pages — only `segment.lengthFeet` on the resolved object (fed by Stage 6 length Evidence).
- `level` never filled from Evidence in Stage 7.
- Height may be validated for sheathing quantity keys, but wall calculator does not compute sheathing and does not use height for studs/plates.
- Mark-subject length Evidence is not used for the physical-run segment (`lengthFeet` resolution uses run records only).

---

## 7. Assumptions

**Stage 7:** Does not use the assumption registry. Comment: never applies assumptions. `assumptionIds` always `[]`. Missing properties stay `null` or `"unknown"`; conflicts stay unresolved traces.

**Stage 14 wall calculator:** Does not call `consultAssumptionRegistry`. (Registry entries that exist today are opening-oriented — king studs, rough sill, etc. — used by `calculateOpeningFraming`, not wall studs/plates.)

**Missing wall inputs today:** Stay unresolved on the domain object → `isQuantityInputResolved` fails → calculator returns null for that line; and/or Stage 13 emits `canCalculate: false` (especially missing length).

---

## 8. Validation / authority dependencies Stage 14 wall calc consults

`calculateWallFraming` consults Stage 13 **only** through `isQuantityBlocked(validation, objectIds, quantityKey)`.

Relevant wall validation impacts ([`validateWallFraming`](../src/scopes/framing/validators/wall-framing.validator.ts)):

| Validation rule | When it fails | Effect on wall calc |
|---|---|---|
| Segment parent missing | Orphan segment | `canCalculate: false` for studs + plates → blocked |
| Wall/segment ID inconsistency | Mismatched segmentIds/parentWallId | Blocks studs + plates |
| Wall type null | `wallType === null` | Blocks studs unless studSize **and** spacing present; blocks plates unless plateCount present. Note: `wallType: "unknown"` (string) **passes** type-resolved |
| Segment length missing | `lengthFeet` null / unresolved | Blocks studs + plates |
| Height missing | height null | **Does not** block studs/plates (`canCalculate: true`); blocks sheathing quantity key (no wall-sheathing line in this calculator) |
| Location / bearing `"unknown"` | Warning issues | **No** `quantityImpacts` blocking studs/plates |

**Not consulted:** `bindingAuthorityGrade`, confidence evaluations, Evidence relationship enums, dictionary greenOutcome.

---

## 9. Minimum current calculator contract

| Wall material | Actual construction inputs used by formula | Other current software prerequisites | Formula / current behavior |
|---|---|---|---|
| **Studs** | Segment length (ft); stud spacing (in); stud size (spec/label); optional opening positions + rough widths for netting | Resolved `BuildingWall` + `WallSegment` with those fields set; parent wall present; Stage 13 must not set studs `canCalculate: false`; inputs not marked `unresolved` in traces; openings payload optional for netting | `ceil((L_ft * 12) / spacing_in) + 1`, minus non-overlapping opening deductions; overlap → baseline only; else null if inputs missing |
| **Plates** | Segment length (ft); plate count (integer) | Same object/validation prerequisites for plates; stud size optional for labeling only | `L_ft * plateCount` linear feet; null if length or plateCount unresolved/blocked |
| **Other wall materials** | — | — | **None implemented** in `calculateWallFraming` |

### Bottom line (factual)

Between reader-established plan information and wall lumber quantities, Stage 7’s job in the current engine is: **select `subjectKind:"wall"` Evidence → mint wall/segment domain objects → pick/merge property candidates (including mark inheritance via `semanticTypeKey`) → write traces**. Stage 14 then needs **length + spacing + stud size** (studs) and **length + plate count** (plates) on those objects, optionally netting openings, and honors Stage 13 quantity blocks. It does not re-read the plans, compiled pages, or dictionary, and does not assume missing wall assembly fields.
