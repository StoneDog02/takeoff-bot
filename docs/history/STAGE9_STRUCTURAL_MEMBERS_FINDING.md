# Stage 9 Structural Members — Factual Finding

**Scope:** Current Stage 9 `structuralMembers` / `resolveStructuralMembers`, `linkOpeningHeaderRelationships`, involved helpers/schemas, and Stage 14 `calculateStructuralMembers`.  
**Question:** After READ THE PLANS has understood structural members and their natural construction relationships, what does current Stage 9 actually add before material calculation?  
**Authority:** Code and tests only. No KEEP/REMOVE recommendations. No replacement design.

**Primary files:**
- Stage wiring: [`createFramingStages.ts`](../src/framing/stages/createFramingStages.ts) (order 9)
- Resolver: [`resolveStructuralMembers.ts`](../src/framing/resolve/resolveStructuralMembers.ts)
- Authority pass: [`structuralMemberAuthority.ts`](../src/framing/resolve/structuralMemberAuthority.ts)
- Header linking: [`linkOpeningHeaderRelationships.ts`](../src/framing/resolve/linkOpeningHeaderRelationships.ts)
- Property paths: [`structuralMemberPropertyPaths.ts`](../src/framing/resolve/structuralMemberPropertyPaths.ts)
- Schema: [`structural-member.schema.ts`](../src/framing/schemas/structural-member.schema.ts)
- Schedule Evidence (Stage 6): [`buildSemanticDefinitionEvidenceFromCompiledPages.ts`](../src/framing/geometry/buildSemanticDefinitionEvidenceFromCompiledPages.ts)
- Calculator: [`calculateStructuralMembers.ts`](../src/framing/calculate/calculateStructuralMembers.ts)
- Validation: [`structural-members.validator.ts`](../src/framing/validators/structural-members.validator.ts), [`openings.validator.ts`](../src/framing/validators/openings.validator.ts) (header reference)

---

## 1. Stage 9 input

### What Stage 9 receives

1. Stage 6 `extractedEvidence.evidence`
2. Stage 8 `openings` payload (required — stage throws if openings artifact missing)
3. Optional `userDecisionRunInput` (user decisions + review items for scalar property overrides)

Stage 9 does **not** read compiled pages, `projectDictionary`, walls directly, or plan index.

### Major properties — plan origin vs repackaging

| Property on `StructuralMember` / link fields | Typical plan/reader origin (learned) | How it reaches Stage 9 (repackaged) |
|---|---|---|
| Member subject / mark (`WB2-11.88LVL`, `HDR-001`, …) | Wood beam/header schedule rows; Claude extraction; Project Learning header defs | `subjectKind:"structural-member"` Evidence with `subjectKey` = schedule mark |
| `category` (header, beam, joist, …) | Schedule row type / Claude / beam↔header synonym on schedule | Evidence `propertyPath:"category"` |
| `materialType` | Schedule material column (LVL, dimensional lumber, …) | Evidence on mark subject |
| `size` | Schedule dimensional cell; notation variants (1.75×11.875 vs 1-3/4×11-7/8) | Evidence; authority pass may converge notation |
| `lengthFeet` | Plan placement callout / dimension Evidence (e.g. `23'-6" LONG`) | Evidence on mark subject |
| `quantity` | Explicit qty Evidence or authority-derived single occurrence | Evidence or `applyStructuralMemberAuthority` inference |
| `location` | Schedule note / Claude location text | Evidence |
| `plyCount` | Built-up schedule notation `(2)-1.75"x11.875"` parsed into size | Evidence or parsed from size authority |
| `headerMemberTag` (opening side) | Claude when opening explicitly linked to header mark on plan | Opening Evidence — **not** resolved in Stage 8 |
| `supportedOpeningTag` (member side) | Claude when header mark explicitly linked to opening tag | Member Evidence — used in Stage 9 linking |
| `headerMemberId` | N/A at reader — derived from tag + ObjectId mint | Stage 9 `linkOpeningHeaderRelationships` |
| `supportedObjectIds` | N/A at reader — derived from opening ObjectIds | Stage 9 linking + backlink pass |
| Relationship arrays (`associatedObjectIds`, `supportingObjectIds`, `connectorIds`) | Not populated from Evidence in current resolver | Always empty `[]` at mint |

**Beckstead examples:**
- `SM-WB2-11.88LVL`: schedule mark + material/size/length Evidence from frozen wave5 run; authority converges equivalent size strings → `(2)-1.75"x11.875"`; emits ~23.5 LF material (`beckstead-wave5-structural-milestone.test.ts`).
- Opening↔header synthetic: `HDR-001` ↔ `O-001` via `supportedOpeningTag` or `headerMemberTag` (`openings.header.relationship.test.ts`).

---

## 2. Structural member minting / existence

### What creates a `StructuralMember`

`resolveStructuralMembers`:

1. Filter Evidence with `subjectKind === "structural-member"`.
2. Group by exact `subjectKey` (schedule mark / extraction tag).
3. `convergeEvidenceByCanonicalObjectId` + `createStructuralMemberObjectId` → `SM-{sanitizedKey}` (or key already SM-prefixed).
4. `resolveOneMember` per cluster → scalar fields from Evidence consensus.
5. `applyStructuralMemberAuthority` post-pass (size/category/quantity derivations — see §9).

### Discover vs convert

Stage 9 **does not discover new physical members from geometry or the PDF**. It converts existing `structural-member` Evidence subjects into domain objects. If no Evidence exists for a mark (e.g. `WB2-11.88LVL`), no member is minted.

Schedule definitions from Drawing Compiler (`buildSemanticDefinitionEvidenceFromCompiledPages`) emit header rows as `subjectKind:"structural-member"` with `subjectKey` = `semanticTypeKey` (e.g. `WB2-10DF`) — those become members when property Evidence exists or is merged from schedule columns.

### Existence / eligibility requirements (Stage 9 itself)

- At least one `structural-member` Evidence record for a subjectKey.
- No PBG/authority re-check at mint time.
- Partially unresolved members are **always preserved** (comment: validation owns calc blocking).
- Linking step requires Stage 8 openings artifact present; linking does not create members.

---

## 3. Resolution operations (`resolveStructuralMembers`)

| Step | Helper | Input | Output / change | New construction understanding? |
|---|---|---|---|---|
| Group | `groupBySubjectKey` | Evidence | Map mark → records | No |
| Converge IDs | `convergeEvidenceByCanonicalObjectId` | Groups | Clusters, shared `SM-*` ObjectId | No — identity normalize |
| User decisions | `buildStructuralMemberUserDecisionContext` | Optional decisions | Override index | No |
| Per cluster | `resolveOneMember` | Cluster + index | One `StructuralMember` | Mostly transform |
| Scalar select | `selectCandidate` + `normalizeStructuralMemberCandidate` | Records per propertyPath | category, materialType, size, lengthFeet, quantity, location, plyCount | No — pick/normalize Evidence; conflict → unresolved trace |
| Traces / completion | `tracesForDecision`, `createCompletion` | Decisions | `resolutionTraces`, `evidenceIds`, completion % | Bookkeeping |
| Relationship slots | hardcoded | — | `associatedObjectIds`, `supportedObjectIds`, `supportingObjectIds`, `connectorIds` = `[]` | Empty placeholders |
| Authority pass | `applyStructuralMemberAuthority` | subjectKey, member, records | May set category, size, quantity; updates traces/completion | **Some derivations** (see §9) — not new plan facts, but deterministic reconciliation |

**Stage 9 linking (second operation in stage, not inside resolver):**

| Step | Helper | Output |
|---|---|---|
| Opening-side tags | `applyOpeningHeaderMemberTags` | Sets `opening.headerMemberId` from `headerMemberTag` Evidence |
| Member-side tags | `applyMemberSupportedOpeningTags` | Sets `member.supportedObjectIds`; may set `opening.headerMemberId` from member |
| Backlink | `applyOpeningHeaderBacklinks` | Merges opening ids into `member.supportedObjectIds` from resolved `headerMemberId` |

**Artifact persistence:** Primary returned artifact is **scalar** (pre-link) payload. When links change, **overrides** publish linked openings + linked structuralMembers companions via `publishArtifactOverride`. Downstream stages read `completedArtifacts` (overrides when present).

---

## 4. Opening ↔ header / structural member relationship (full trace)

Example: *“This opening uses header WB2”* (or `HDR-001` / `WB2-11.88LVL` in current representations).

| Step | Representation | A. Construction info before | B. New info discovered? | C. Translation only? |
|---|---|---|---|---|
| 1. Plans / reader | Schedule row `WB2-11.88LVL` + opening callout linked in text/leader | Header mark, size, material; opening tag; explicit association if Claude extracts it | Association only if extraction captured it | — |
| 2. Stage 6 Evidence | `subjectKind:"structural-member"`, `subjectKey:"WB2-11.88LVL"`, property Evidence; optional opening `headerMemberTag:"WB2-11.88LVL"` or member `supportedOpeningTag:"O-…"` | Same facts as strings on Evidence subjects | No | Yes — repackage |
| 3. Stage 8 `resolveOpenings` | `Opening` object; **`headerMemberId: null` always** | Opening dims/category/parent; tag still only on Evidence | No | Stage 8 does not consume header tags |
| 4. Stage 9 `resolveStructuralMembers` | `StructuralMember` `SM-WB2-11.88LVL`; **`supportedObjectIds: []`** | Member schedule properties | No | Member object mint |
| 5. Stage 9 `linkOpeningHeaderRelationships` | Reads `headerMemberTag` / `supportedOpeningTag` from Evidence | Tags already on Evidence | No | **Maps tag → ObjectId** (`createStructuralMemberObjectId` / `createOpeningObjectId`) |
| 6. After linking | `opening.headerMemberId = "SM-WB2-11.88LVL"`; `member.supportedObjectIds = ["O-…"]` | Same association, now as ObjectId pointers | No | Yes |
| 7. Stage 14 structural calc | `calculateStructuralMembers(member)` | Uses member scalar fields only | No | **Does not read** opening link for header LF |
| 8. Stage 14 opening calc | `calculateOpeningFraming` | Uses `headerMemberId` only for **cased cripples-above** eligibility | No | Gate only; no header lumber line |

**Linking lookup (factual):**
- Opening-side: `applyOpeningHeaderMemberTags` loads Evidence by **`opening.id`** as map key. Works when Evidence `subjectKey` equals `opening.id` (e.g. subjectKey `"O-001"` → id `"O-001"`). Geometry openings use subjectKeys like `opening:p4:…` while id is `O-opening:p4:…` — opening-side tag lookup may not find Evidence unless tags sit on the same key the linker uses.
- Member-side: lookup uses **`memberSubjectKey(member)`** (strips `SM-` prefix) — matches Evidence `subjectKey` `"HDR-001"` for id `"SM-HDR-001"`.

**Reciprocal linking:** Either direction alone can establish the link (`openings.header.relationship.test.ts`: member-only `supportedOpeningTag` or opening-only `headerMemberTag`). Claude prompts allow omitting reciprocal tag when one direction is emitted.

---

## 5. Natural plan relationships (code/artifact evidence)

How plans/reader currently express opening↔header associations:

| Mechanism | Where in codebase |
|---|---|
| **Wood beam/header schedule mark** (`WB*`, `HDR-*`) | Schedule Evidence on `structural-member` subject; PL fixtures (`WB2-10DF`, `WB2-11.88LVL`) |
| **Explicit Claude relationship extraction** | `extractFramingEvidence.ts` prompts: emit `headerMemberTag` on opening when source links opening to header mark; emit `supportedOpeningTag` on member when source links member to opening tag |
| **Schedule row only (no opening link)** | Beckstead wave5: `SM-WB2-11.88LVL` material from schedule + length Evidence **without** opening header link in that test path |
| **Member mark at opening** | Prompt requires explicit page text or visual callout/leader — not inferred from proximity |
| **Detail / schedule refs on openings** | `scheduleReference`, `detailReference` on Opening (Stage 8) — separate from header ObjectId link |
| **Geometric placement** | Not used by Stage 9 header linking (no proximity inference in `linkOpeningHeaderRelationships`) |
| **Keyed notes** | Not a dedicated Stage 9 header path in code reviewed |

**Factual:** The opening↔header **association mark** can exist on Evidence before Stage 9 (`headerMemberTag` / `supportedOpeningTag`). Stage 9 adds **ObjectId linkage** (`headerMemberId`, `supportedObjectIds`), not the underlying association text.

---

## 6. What breaks without canonical linking

| Missing link | Affected behavior (exact) |
|---|---|
| `headerMemberTag` present, `headerMemberId` not set | Opening calc: **cased** cripples-above blocked (`isEligibleForCripplesAbove` needs non-null `headerMemberId`). King/jack/sill/window cripples unaffected. **No header material line** exists in `calculateOpeningFraming` (`opening.header` is unsupported capability in claim contracts). |
| `supportedOpeningTag` present, `supportedObjectIds` empty | Stage 13 `validateSupportedObjectsResolved` may fail if ids populated but dangling; if never linked, `supportedObjectIds` stays `[]` → validation passes empty. Member **material calc unchanged** (calculator ignores `supportedObjectIds`). |
| `headerMemberId` set to non-existent member (`SM-HDR-999`) | Stage 13 `validateHeaderReferenceResolved`: `canCalculate: false` on `opening.header` quantity key — **does not block** king/sill/cripple keys. No header material calculator consumes this. |
| Member exists, link to opening fails | Header LF still calculable from member schedule fields if category/material/size/length/qty resolve. Opening-side cripple-above for **cased** openings still blocked without `headerMemberId`. |
| Structural member scalar incomplete | Stage 14 `calculateStructuralMembers` returns null for that member (no `member.material` line). Stage 13 blocks via category/material/size/length/quantity rules. |

**Net:** Canonical ObjectId linking most affects **validation bookkeeping** and **cased opening cripple-above** eligibility. **Header lumber quantity is not emitted** by current opening calculator; header **material** is emitted by `calculateStructuralMembers` from member fields, not from the opening link.

---

## 7. Wall / opening / member cross-object structure

| Link | Writer | Consumer | Required for material calc? | Known earlier? |
|---|---|---|---|---|
| `Opening.parentObjectId` → wall segment | Stage 8 | Stage 14 opening calc; wall stud netting | **Yes** for opening framing | `parentPhysicalRunKey` Evidence + Stage 7 wall |
| `WallSegment.openingIds` | Stage 8 `applyWallOpeningBacklinks` | Stage 8 override detection; floor/roof/sheathing validators (reference lists); **not** opening/wall calcs | **No** for wall/opening material formulas | Same as `parentObjectId` |
| `Opening.headerMemberId` → member | Stage 9 linking | Stage 13 header validation; Stage 14 cased cripples-above | **Partial** (cripples gate only) | `headerMemberTag` / `supportedOpeningTag` Evidence |
| `StructuralMember.supportedObjectIds` → openings | Stage 9 linking | Stage 13 `supportedObjectsResolved` (blocks `member.length` qty key if dangling) | **Indirect** — can block calc via validation on `member.length`, not `member.material` directly in all rules; calculator checks both keys | Tag Evidence |
| `associatedObjectIds`, `supportingObjectIds`, `connectorIds` | Not populated | Validators if ever filled | No (empty today) | — |
| Stage 9 openings override | Stage 9 side-effect | Stages 13–14 if override in `completedArtifacts` | Linked `headerMemberId` must be in payload used by calc | — |

---

## 8. What Stage 14 actually needs (`calculateStructuralMembers`)

**Single material family implemented:** `member.material` (linear feet). Quantity key `member.length` exists for validation blocking but **no separate length line item** is emitted.

### Formula

`quantity (LF) = lengthFeet × quantity × (plyCount ?? 1)`

- `plyCount` required only when `category === "built-up-member"`.
- Description/classification use `size`, `materialType`, `category`.

### Prerequisites

**A. Construction inputs (math):** resolved `category` (not `unknown`), `materialType` (not `"unknown"`), `size`, `lengthFeet`, `quantity`; optional `plyCount` for built-up.

**B. Architecture prerequisites:** member ObjectId; `resolutionTraces` not `unresolved` for those paths (`isQuantityInputResolved`); Stage 13 not setting `canCalculate: false` on `member.material` or `member.length` for that member id.

### Skip / null conditions

- Any required field null or trace `unresolved` → null line item.
- `materialType` token `"unknown"` → null.
- `isQuantityBlocked` on `member.material` **or** `member.length` → null.
- Emitted quantity ≤ 0 or non-finite → null.

**Does not consult:** `supportedObjectIds`, `headerMemberId`, opening links, confidence, Evidence status, `associatedObjectIds`.

---

## 9. Derivations and assumptions

### Deterministic derivations (Stage 9)

| Derivation | Where | Effect |
|---|---|---|
| ObjectId from mark | `createStructuralMemberObjectId` | `SM-WB2-11.88LVL` |
| Schedule mark vs dimensional size conflict | `resolveDimensionalSizeOverScheduleMark` | Prefer dimensional size over mark-as-size |
| Notation-equivalent sizes | `resolveNotationEquivalentDimensionalSizes` | e.g. `1.75"×11.875"` ↔ `(2)-1.75"x11.875"` |
| Beam/header category synonym | `resolveBeamHeaderCategorySynonym` | `beam` + `header` conflict → `header` when HEADER-corroborated |
| Single-occurrence quantity | `resolveExplicitSingleOccurrenceQuantity` | qty = 1 when placement length Evidence exists, no qty Evidence |
| Tag → ObjectId (opening/header) | `linkOpeningHeaderRelationships` | `headerMemberId`, `supportedObjectIds` |

### Assumption registry

**None for structural members.** `assumptionRegistry.ts` has **only opening** entries (king studs, rough sill size, cripple layout). Stage 9 sets `assumptionIds: []` on members.

### Blocked despite upstream reader info (factual gaps)

- Schedule definition Evidence may use property paths (e.g. schedule column names) that never map to resolver paths (`category`, `materialType`, `size`, …) unless Claude or another emitter uses those exact paths.
- Length on schedule row alone without `lengthFeet` Evidence → member stays without length → no material line.
- Opening↔header association on Evidence does not affect member LF calc without member scalar completeness.
- Quantity remains null unless Evidence or single-occurrence authority fires.

---

## 10. Validation / authority dependencies (Stage 14 consults)

Via `isQuantityBlocked(validation, [member.id], quantityKey)` only:

| Stage 13 rule (structural) | quantityKey blocked | Effect on calc |
|---|---|---|
| Unresolved category | `member.material`, `member.length` | null line |
| Missing materialType | `member.material` | null line |
| Missing size | `member.material`, `member.length` | null line |
| Missing lengthFeet | `member.material`, `member.length` | null line |
| Missing quantity | `member.material`, `member.length` | null line |
| Missing plyCount (built-up) | `member.material`, `member.length` | null line |
| Dangling `supportedObjectIds` | **`member.length` only** (not material in impact list) | null line (calculator checks both keys) |
| Dangling `associatedObjectIds` | material: **canCalculate true** (warning) | no block |

Opening validator (when structural members map provided): dangling `headerMemberId` blocks `opening.header` — **no calculator consumes that key today**.

**Not consulted:** confidence, binding grades, Evidence relationship enums.

---

## 11. Minimum current calculator contract

| Structural material | Actual construction inputs used | Other current software prerequisites | Formula / behavior |
|---|---|---|---|
| **Member material (LF)** | `lengthFeet`; `quantity`; `size` + `materialType` + `category` (labels); `plyCount` if built-up | `SM-*` member object; traces resolved; validation not blocking `member.material`/`member.length`; `materialType ≠ "unknown"` | `LF = lengthFeet × quantity × (plyCount ?? 1)`; category maps to lumber/engineered-wood/truss/steel bucket |

---

## Bottom line (factual)

**What Stage 9 adds between reader-established structural information and material quantities:**

1. **Member object mint** — converts `structural-member` Evidence (schedule marks, Claude extraction, schedule-definition Evidence) into `StructuralMember` domain objects with canonical `SM-*` ids and resolved scalar fields.
2. **Authority reconciliation** — deterministic size/category/quantity derivations on already-evidence-backed conflicts (notation equivalence, mark-vs-size preference, beam/header synonym, single-occurrence qty).
3. **Opening↔header ObjectId linking** — translates explicit tag-level relationships already present on Evidence (`headerMemberTag`, `supportedOpeningTag`) into `headerMemberId` and `supportedObjectIds`; does **not** infer associations from geometry or proximity.
4. **Artifact split** — persists scalar members artifact; publishes **linked** openings/members overrides when header links change.

**Newly discovered vs translated:**

| Mechanism | Discovery vs translation |
|---|---|
| Schedule mark properties (size, material, length, category) | **Translated** from reader/Evidence (authority may **reconcile** notation, not invent specs) |
| `headerMemberTag` / `supportedOpeningTag` | **Translated** — association text already on Evidence; Stage 9 adds ObjectIds |
| `headerMemberId` / `supportedObjectIds` | **Translation** — software representation of known tag link |
| `structural-member` ObjectId | **Translation** — canonical id for schedule mark |
| Opening↔header association itself | **Learned in reader/extraction** when explicitly extracted; Stage 9 does not learn it from plans |

**Stage 14 header material** comes from **`calculateStructuralMembers`** using member schedule/length fields, **not** from opening header links. Opening links currently affect opening calc only through the **cased cripples-above** gate and validation flags on an **`opening.header`** quantity key that has **no material emitter**.
