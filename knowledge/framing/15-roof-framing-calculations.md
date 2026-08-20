# Roof Framing Calculations

## Purpose

This document defines the authoritative, deterministic calculation contract for **roof-framing-derived quantities** on resolved Roof Framing Systems and Roof Planes.

It closes the calculation authority gap for roof assemblies described in `04-building-assemblies.md` (Roof Framing Assembly) without duplicating:

- Structural Member material ownership in `08-structural-members.md`
- Sheathing coverage ownership in `04-building-assemblies.md` (Net Sheathing Coverage Quantity)
- Blocking, connector, or hardware ownership

This document is **calculation authority only**. It does not define extraction prompts, schemas, or TypeScript implementation.

---

# Scope Boundary

## In scope (this document)

Stick-framed wood / wood-product roof planes represented as Roof Framing System + Roof Plane objects with conventional regularly spaced **common rafter** layout.

Authorized calculable quantities:

1. **Baseline regularly spaced common-rafter count** (`each`) — only for the narrow simple-plane eligibility class defined below

## Out of scope / deferred (this document)

Do not calculate under this document:

- Baseline common-rafter **material LF** (deferred; see § Future Common-Rafter LF Boundary)
- Stock / purchasing piece counts or purchasing-length optimization
- Hip rafter, valley rafter, or jack rafter geometry or material
- Ridge board or ridge beam material
- Roof opening headers, trimmers, or doubled members
- Outlookers / lookouts
- Fascia / subfascia
- Blocking
- Beams, girders, posts, and other individually identified structural members
- Roof sheathing square footage
- Waste, sheet conversion, or supplier SKUs
- Roof truss package takeoff or truss internal member decomposition
- Metal roof framing systems
- Pitch-derived slope lengths or assumed overhang/tail additions

---

# Core Rules

1. **Baseline regularly spaced common rafters are additive** to other roof framing members. Hips, valleys, jacks, ridges, opening specials, outlookers, fascia, and blocking are not substituted into this population by inference.
2. **Never invent spacing, member size, framing type, layout length, or member length.** Missing facts block the **affected** quantity and create review items.
3. **Never derive common-rafter count from `areaSquareFeet`.** Plane square footage is not a rafter-count input.
4. **Never derive common-rafter count from pitch.** Pitch does not change how many regularly spaced commons occupy the spacing axis.
5. **Never infer `rafterLayoutLengthFeet` from plane area, bounding-wall topology, \(\sqrt{\text{area}}\) heuristics, IRC tables, or manufacturer span tables** unless a future Brain rule explicitly authorizes that derivation.
6. **Each Roof Plane calculates independently.**
7. **Every assumption used in a formula must produce an assumption record** per `10-assumptions.md`.
8. **No material line may appear in more than one ownership domain.**
9. **Prefer plane decomposition or block** over clever hip/valley/opening geometry inference.
10. **Truss-framed systems never use the common-rafter count formula.**

---

# Construction Model — What Population Is Counted?

## Baseline regularly spaced common rafters

For this document, a **common rafter** is a stick-framed roof member that:

- Belongs to the regularly spaced primary roof-member population of a Roof Plane
- Shares the plane’s resolved common member size and on-center spacing
- Runs in the plane’s span / framing direction between parallel primary bearings (typically eave/wall plate and ridge, or eave-to-eave on a simple shed)
- Is **not** a hip, valley, or jack special
- Is **not** a ridge board or ridge beam
- Is **not** an opening header/trimmer, outlooker, fascia, or blocking member

**Baseline regularly spaced common-rafter count** is the piece count of that population on **one** eligible Roof Plane.

This is a coherent Roof-owned baseline population: the repetitive stick commons that fill a simple plane at stated O.C., analogous in *role* (not ownership) to baseline floor joists — but defined from roof construction, not copied from floor rules.

## Explicit exclusions from this population

| Member | Why excluded from baseline common-rafter count |
| --- | --- |
| Hip rafter | Diagonal special; not part of the regular O.C. common grid |
| Valley rafter | Diagonal special; not part of the regular O.C. common grid |
| Jack rafter | Shortened / angled filler toward hip or valley; replaces commons in hip/valley fields |
| Ridge board | Continuous ridge product; different ownership |
| Ridge beam | Structural ridge member; Structural Member (or dedicated future rule) |
| Header / trimmer at roof openings | Opening specials; separate authority |
| Outlooker / lookout | Special eave/overhang framing |
| Blocking | Blocking subsystem |
| Fascia / subfascia | Edge finish framing; not commons |
| Individually tagged special rafters | Structural Member objects when resolved as such |
| Roof truss | Engineered assembly; different model |

---

# Terminology

| Term | Meaning |
| --- | --- |
| **Span direction** | Direction in which each common rafter runs from primary bearing toward primary bearing (e.g. eave toward ridge). |
| **Rafter spacing axis** | Axis **perpendicular** to span direction. Regularly spaced common rafters are placed along this axis at `memberSpacingInches`. |
| **`rafterLayoutLengthFeet`** | Resolved length, in feet, of the Roof Plane measured along the **rafter spacing axis**. Governs baseline common-rafter **count**. Must **not** be reused as installed member length, horizontal run, or slope length. |
| **Horizontal run** | Plan-projected distance along span. **Not** a count input. |
| **Slope / pitch length** | Along-slope rafter geometry. **Not** a count input. |
| **Installed rafter member length** | Material length of one common rafter piece. **Not** authorized for LF in this chapter (deferred). |
| **Pitch** | Rise/run or equivalent roof slope descriptor. **Not** a count input. |
| **Clear span / bearing-to-ridge distance** | Structural geometry. **Not** a count input. |

## Chosen spacing-axis field name

**Authoritative field name:** `rafterLayoutLengthFeet`

### Why this name

It states that the length is the **layout dimension for placing regularly spaced rafters**, parallel in intent to `joistLayoutLengthFeet` on floors, without implying floor ownership or formulas.

### What `rafterLayoutLengthFeet` DOES mean

- The length of the eligible Roof Plane along the axis on which commons are spaced (perpendicular to span).
- For a simple gable or shed plane, this often **numerically coincides** with that plane’s ridge length or eave length measured along the same axis — but the semantic authority is **spacing-axis layout length**, not “ridge material length.”

### What `rafterLayoutLengthFeet` does NOT mean

- Horizontal run (eave-to-ridge in plan)
- Slope / pitch length of one rafter
- Installed common-rafter member length
- Stock / purchasing stick length
- Ridge board / ridge beam LF (a different material quantity)
- A dimension inferred from `areaSquareFeet`

### Rejected alternative names

| Candidate | Why rejected |
| --- | --- |
| `runWidthFeet` / `horizontalRunFeet` | Invites span-axis / plan-run confusion |
| `roofSpanFeet` | Ambiguous structural span |
| `slopeLengthFeet` | Member/slope geometry, not spacing axis |
| `rafterMemberLengthFeet` | Future LF fact; not count |
| `eaveToRidgeFeet` | Span-axis geometry |
| `ridgeLengthFeet` | Collides with ridge **material** ownership |

### Geometric interpretation (axes)

Given a rectangular (or rectangularized takeoff) simple roof plane:

- If common rafters **span** toward a ridge that runs east–west, `rafterLayoutLengthFeet` is the **east–west** plane dimension (spacing axis, typically parallel to ridge/eave).
- If commons **span** east–west, `rafterLayoutLengthFeet` is the **north–south** plane dimension.

`spanDirection` (and/or `framingDirection` when it unambiguously identifies span) must resolve sufficiently to confirm axis assignment.

Do not swap axes by guess.

---

# Eligibility Class (Baseline Common-Rafter Count — Simple Plane)

A Roof Plane participates in baseline common-rafter **count** only when **all** of the following are true:

| Requirement | Meaning |
| --- | --- |
| Parent Roof Framing System | `plane.parentSystemId` resolves to an existing system |
| System ↔ plane consistency | Plane listed on `system.planeIds` and parent pointer consistent |
| Stick-framed commons | System `assembly.framingType` resolves to a **stick / rafter** classification (not truss / engineered truss package) |
| `assembly.memberSpacingInches` | Resolved (non-null, positive) |
| `assembly.memberSize` | Resolved (non-null) — material identity |
| `plane.rafterLayoutLengthFeet` | Resolved (non-null, positive) — **spacing-axis length** |
| `plane.spanDirection` | Resolved sufficiently to confirm layout-length axis |
| Simple single-field geometry | Plane represents a **simple rectangular (or rectangularized) common-rafter field** in which regularly spaced commons occupy the full spacing axis |
| Both spacing-axis boundaries are common-rafter endpoints | End members of the layout axis are baseline commons of this population (typical simple gable-end or shed-end condition), **not** hip or valley diagonals |
| No unresolved hip/valley field | Plane does **not** use hip or valley boundaries that replace commons with jacks or otherwise make the regularly spaced common population unequal or incomplete along the spacing axis |
| Not a truss package | System is not a roof-truss representation |

Optional / not required for count:

| Input | Role |
| --- | --- |
| `plane.pitch` | **Not required for count**; may matter for future length rules |
| `plane.areaSquareFeet` | **Not used** for count |
| `plane.framingDirection` | May corroborate span; not a substitute for resolved layout length |
| `plane.openingIds` | Traceability; see Opening Policy |
| `plane.structuralMemberIds` | Traceability; double-count review when conflicting |
| `plane.boundingWallIds` | Traceability |

If any required eligibility input fails, **do not emit** baseline common-rafter count for that plane. Preserve the Roof objects; validation and review explain the block.

### Decomposition preference

When a roof contains hips, valleys, irregular polygons, or mixed common/jack fields:

- **Decompose** into independently resolved simple Roof Planes that each satisfy this eligibility class, **or**
- Leave those regions **NOT CALCULABLE** under this rule and take specials through Structural Members / future authority

Do not invent a single clever count across hip/valley geometry.

---

# Material Ownership

| Material | Calculation owner | Output unit | Notes |
| --- | --- | --- | --- |
| Baseline regularly spaced common rafters — **count** | Roof Framing (this document) | `each` | Section A |
| Baseline common-rafter **material LF** | Deferred | — | Future rule; not authorized here |
| Ridge board / ridge beam | Structural Member (`08`) when resolved as SM | `LF` | Not baseline commons |
| Hip / valley / jack / special rafters | Structural Member and/or future roof-special authority | — | Not baseline commons |
| Roof opening headers / trimmers | Structural Member and/or future roof-opening authority | — | Not baseline commons |
| Roof sheathing | Sheathing (`04` Net Sheathing Coverage) | `SF` | Separate |
| Blocking | Blocking subsystem | — | Out of scope here |
| Fascia / subfascia | Future / out of scope here | — | Excluded |
| Hangers / connectors | Connectors / Hardware | — | Out of scope here |

## Double-counting rule (Roof vs Structural Members)

When baseline regularly spaced common rafters are calculated under this document:

- Emit **Roof Framing** material lines for baseline common-rafter **count**.
- Do **not** also emit Structural Member net material LF (or each) for the same repetitive baseline common-rafter population solely because rafter size/spacing appear on the roof schedule.

Structural Member calculation remains correct for:

- Ridge beams / boards modeled as SM objects
- Hip, valley, jack, and other specials with resolved `lengthFeet` and `quantity`
- Beams, girders, posts
- Any rafter resolved as an **individual** Structural Member that is **not** part of the baseline regularly spaced common population already owned by Roof Framing

If both representations exist for the same physical members, **block** both domains’ overlapping quantities and create a review item rather than emitting both.

---

# Component Rules and Formulas

## A. Baseline Regularly Spaced Common-Rafter Count

### When required

Baseline common-rafter count is required for eligible Roof Planes on eligible stick-framed Roof Framing Systems.

### Count authority

| Source | Policy class |
| --- | --- |
| Explicit project evidence for total common-rafter count in the plane | **1 — Explicit evidence required** — overrides the layout formula when resolved onto the plane as an explicit count |
| Layout length + spacing with both spacing-axis endpoints counted | **2 — Deterministically derivable** when required inputs resolve |

Do **not** derive count from:

- `areaSquareFeet`
- Pitch / slope tables
- Horizontal run or eave-to-ridge distance
- IRC / manufacturer span tables
- Assumed rectangularization without resolved `rafterLayoutLengthFeet`

### Material identity

Classify the material line from resolved system assembly:

- `framingType` (stick/rafter classification)
- `memberSize`

Do not invent species, grade, or engineered series beyond what is resolved.

### Geometric quantity that governs count

**`rafterLayoutLengthFeet`** — length along the rafter spacing axis.

### Formula

**Status: CALCULABLE** when simple-plane eligibility and required inputs resolve.

**Physical basis:** Along the spacing axis, regularly spaced commons are placed at the stated on-center spacing. Counting **spaces** from layout length and adding **both endpoint members** yields the member count for a population that occupies both boundaries with commons. This is the same *counting geometry family* used for regularly spaced wall studs and floor joists, authorized here only because the eligible Roof Plane class requires both spacing-axis boundaries to be common-rafter endpoints.

```
layoutLengthInches = rafterLayoutLengthFeet × 12
spaces = layoutLengthInches / memberSpacingInches
rafterCount = ceil(spaces) + 1
```

**Output:** `rafterCount` — unit: **`each`**

Whole-piece rounding for member counts follows the same ceil-based whole-piece policy used for wall stud counts (`10-assumptions.md`).

### Endpoint / layout policy

- Count **both endpoints** of the spacing axis.
- Place intermediate commons at the specified on-center spacing from the start of the layout axis.
- Always count the far-end common rafter.
- The final bay may therefore be shorter than the specified spacing.

### When both-endpoint counting is valid

This endpoint policy is valid **only** when both spacing-axis boundaries are occupied by baseline common rafters of this population (simple gable-end or shed-end conditions under the eligibility class).

If a hip, valley, or other special member **replaces** a spacing-axis boundary common:

- The plane is **ineligible** for this baseline rule (policy **A**), **or**
- The roof must be **decomposed** into simple planes that restore common-rafter endpoints (policy **B**)

Do **not** silently keep the full `ceil(spaces)+1` count while one endpoint is a hip/valley (policy rejected for V1).

Do **not** invent a “minus one endpoint” adjustment without a future explicit Brain rule.

### Explicit count override

When an explicit resolved common-rafter count for the plane exists:

```
rafterCount = explicitRafterCount
```

Do not average or blend with the layout formula. Explicit count wins.

### Pitch policy (count)

**Pitch does not affect baseline common-rafter count.**

Commons are counted along the spacing axis. Slope changes member **length**, not how many regularly spaced commons occupy a resolved layout length.

Therefore:

- `pitch` is **not** a required input for count
- Missing pitch must **not** block count
- Current engine validator coupling of pitch → `roof.members` is **implementation debt**, not Brain authority

### `areaSquareFeet` policy (count)

**`areaSquareFeet` does not participate in common-rafter count.**

- Not a required input
- Must not be used to derive `rafterLayoutLengthFeet`
- Missing SF must **not** block count
- Current engine validator coupling of plane SF → `roof.members` is **implementation debt**, not Brain authority

### Opening interaction (count)

Examples: skylights, roof hatches, chimneys, framed penetrations.

V1 policy:

- Baseline common-rafter count is **unchanged** by roof openings
- Opening-derived headers, trimmers, and specials are **not** included in this count
- Do **not** deduct commons using opening width unless a future net-mode rule resolves opening position along the spacing axis (or an explicit deducted-rafter count)
- Unresolved `openingIds` alone do **not** block baseline common-rafter count

### Hip / valley interaction (count)

Hip and valley geometry typically:

- Introduces jack rafters of **varying lengths**
- Replaces or truncates the rectangular common field
- May place a diagonal special on what would otherwise be a spacing-axis boundary

**V1 policy:** Roof Planes with hip/valley boundaries (or unresolved hip/valley conditions that affect the baseline common population) are **NOT eligible** for this count formula.

Remediation: decompose into simple common-only planes where possible; take hips/valleys/jacks as Structural Members or future specials. Do not invent jack counts from this rule.

### Ridge interaction (count)

Distinguish:

| Element | Effect on common-rafter **count** | Material ownership |
| --- | --- | --- |
| Common rafters terminating at a ridge | Count governed by spacing axis + eligibility; ridge does not add/subtract commons by itself | Commons → Roof count |
| Ridge board | Does not change common count | SM (when modeled) / future |
| Structural ridge beam | Does not change common count | SM |

Do **not** emit ridge material through the common-rafter calculator.

### Multi-plane behavior (count)

| Rule | Behavior |
| --- | --- |
| Iteration | Calculate independently for **each** Roof Plane |
| Shared system assembly | Spacing/size/type come from the parent system; count uses each plane’s own `rafterLayoutLengthFeet` |
| Overlapping planes | If two planes claim the same physical common field, **block** both counts and create a review item |
| Sibling planes | One blocked plane must not prevent other eligible planes (or unrelated domains) from calculating |

### Provenance (count)

Material lines must carry:

- `sourceObjectIds` including the Roof Plane and parent Roof Framing System
- `assumptionIds` / `reviewItemIds` when assumptions or reviews apply
- Classification derived from resolved framing type and member size

### Blocking conditions (count)

Block baseline common-rafter **count** when:

- Simple-plane eligibility preconditions fail
- Parent system missing or system/plane inconsistent
- `framingType` unresolved
- `framingType` is truss / engineered truss package (formula not applicable)
- `memberSpacingInches` unresolved
- `memberSize` unresolved
- `rafterLayoutLengthFeet` unresolved
- `spanDirection` unresolved such that layout-axis confirmation fails
- Hip/valley / complex geometry makes the plane ineligible
- Explicit count and layout formula conflict
- Overlapping planes would double-count
- Floor-style Roof/SM duplicate representation of the same baseline commons

Do **not** block count solely because:

- `pitch` is unresolved
- `areaSquareFeet` is unresolved

### Worked examples (count)

**Example A — exact spaces**

- `rafterLayoutLengthFeet = 20`
- `memberSpacingInches = 16`
- `rafterCount = ceil((20 × 12) / 16) + 1 = 16`

**Example B — shorter layout**

- `rafterLayoutLengthFeet = 12`
- `memberSpacingInches = 16`
- `rafterCount = ceil(144 / 16) + 1 = 10`

**Example C — non-even division**

- `rafterLayoutLengthFeet = 19.5`
- `memberSpacingInches = 16`
- `rafterCount = ceil(234 / 16) + 1 = 16`
- Final bay shorter than 16".

**Example D — SF present, layout missing**

- `areaSquareFeet = 480`
- `rafterLayoutLengthFeet` unresolved  
→ **Block** common-rafter count. Do not infer layout length from area.

**Example E — pitch missing, count inputs present**

- Layout length + spacing + size + stick framing type + span direction resolve
- `pitch` unresolved  
→ **Emit** common-rafter count. Pitch is irrelevant to count.

**Example F — truss-framed system**

- `assembly.framingType` resolves to roof truss / engineered truss  
→ Common-rafter count formula **not applicable**. Do not emit stick common counts. Truss package quantities remain outside this chapter.

**Example G — hip / valley plane**

- Plane bounded by a hip or valley such that jacks replace commons or an endpoint is a diagonal special  
→ **Not eligible**. Block under this rule (decompose or SM specials). Do not run `ceil(spaces)+1` across the hip field.

**Example H — roof opening present**

- Eligible simple plane with a skylight referenced on `openingIds`
- Count inputs resolve  
→ Baseline common-rafter count **unchanged**. Opening headers/trimmers are not included and are not deducted.

---

# Future Common-Rafter LF Boundary (DEFERRED — not authorized)

Common-rafter **material LF** is **NOT CALCULABLE** under this chapter.

Future distinction (do not implement yet):

| Field / concept | Role |
| --- | --- |
| `rafterLayoutLengthFeet` | Spacing-axis dimension for **count** |
| `rafterMemberLengthFeet` (proposed future) | Installed material length of **one** baseline common rafter for **LF** |

Do **not** conflate these.

Do **not** derive future member length from:

- Pitch alone
- `areaSquareFeet`
- `rafterLayoutLengthFeet`
- Horizontal run
- Clear span + assumed overhang / bearing seats

unless a future Brain rule explicitly authorizes that geometry.

---

# Assumption Policy Summary

| Fact | Class | Notes |
| --- | --- | --- |
| Common-rafter count from layout length ÷ spacing + endpoints | **2 — Deterministically derivable** | When simple-plane eligibility resolves |
| Explicit common-rafter count from plans | **1 — Explicit evidence required** | Overrides layout formula |
| Framing type (stick/rafter vs truss) | **1 — Explicit evidence required** | |
| Member size | **1 — Explicit evidence required** | |
| Member spacing | **1 — Explicit evidence required** | Never default |
| `rafterLayoutLengthFeet` | **1 — Explicit evidence required** | Spacing axis only |
| Span direction | **1 — Explicit evidence required** | Axis confirmation |
| Pitch for count | **Not an input** | |
| Layout length from `areaSquareFeet` | **4 — Forbidden** | |
| Count from pitch / slope tables | **4 — Forbidden** | |
| Count from horizontal run alone | **4 — Forbidden** | |
| Hip/valley jack inference for baseline count | **4 — Forbidden** | |
| Opening rafter deductions without position | **4 — Forbidden** | |
| Truss stick decomposition | **4 — Forbidden** | |
| Member length from pitch (for future LF) | **4 — Forbidden** until future rule | |

---

# Quantity Classification Matrix

| Quantity | Status |
| --- | --- |
| Baseline regularly spaced common-rafter **count** | **CALCULABLE NOW** (authority) when simple-plane eligibility inputs resolve |
| Explicit common-rafter count override | **CALCULABLE WITH ADDITIONAL RESOLVED INPUT** |
| Baseline common-rafter **material LF** | **DEFERRED** |
| Hip / valley / jack material | **NOT CALCULABLE** under this chapter / often **OWNED BY STRUCTURAL MEMBERS** when tagged |
| Ridge board / beam LF | **OWNED BY STRUCTURAL MEMBERS** when resolved as SM |
| Roof opening specials | **DEFERRED** / SM when tagged |
| Roof sheathing SF | **OWNED BY SHEATHING** |
| Truss package / internal members | **NOT CALCULABLE** under this chapter |
| Stock / waste / purchasing | **DEFERRED** / out of scope |

---

# Quantities Intentionally NOT CALCULABLE (Current Contract)

| Quantity | Why blocked | Additional fact / authority required |
| --- | --- | --- |
| Common-rafter LF | Deferred | Future length semantics + eligibility |
| Stock pieces / purchasing lengths | Purchasing | Out of scope |
| Waste / sheet conversion | Purchasing | Out of scope |
| Hip rafter geometry/material | Outside simple-plane class | Explicit SM or future specials rule |
| Valley rafter geometry/material | Outside simple-plane class | Explicit SM or future specials rule |
| Jack-rafter geometry/material | Outside simple-plane class | Explicit SM or future specials rule |
| Opening headers/trimmers | Structural/plan dependent | Explicit SM or future roof-opening calc |
| Fascia / subfascia | No formula here | Future authority |
| Blocking | Ownership | Blocking subsystem |
| Connectors / hardware | Ownership | Connectors / Hardware |
| Truss internal members / design | Engineered system | Truss authority; do not decompose |
| Truss package quantities from this formula | Wrong model | Future truss rule + explicit evidence |
| Ridge material via common-rafter calculator | Ownership | SM / future ridge rule |
| Layout length from plane SF | Forbidden | Explicit `rafterLayoutLengthFeet` |
| Member length from pitch / run / SF | Forbidden for now | Future LF Brain rule |
| Count deductions at openings without position | Forbidden | Position or explicit deducted count |

---

# Validation and Review Triggers

Create review items when:

**Count-related**

- Eligible roof plane lacks `rafterLayoutLengthFeet` while common-rafter takeoff is expected
- Member spacing, size, or framing type missing
- Framing type is truss while stick common counts are expected
- Span direction missing or conflicts with the axis used for layout length
- Layout length appears to equal span-axis run/member length under resolved span direction without corroboration (axis conflict)
- Plane appears hip/valley-bounded or otherwise outside simple-plane eligibility
- Explicit common-rafter count conflicts with layout formula result
- Overlapping roof planes would double-count commons
- Same physical commons would be emitted by both Roof Framing and Structural Members domains

**Not count blockers by themselves**

- Missing `pitch`
- Missing `areaSquareFeet`

---

# Relationship to Specs and Other Brain Files

| Source | Relationship |
| --- | --- |
| `04-building-assemblies.md` | Roof Framing Assembly extract/review; this document owns **calculation** for baseline common-rafter count |
| `08-structural-members.md` | Owns individually identified member LF; must not duplicate Roof baseline common-rafter population |
| `09-material-taxonomy.md` | Classifies lumber / truss products; does not define counts |
| `10-assumptions.md` | No roof rafter spacing or layout-length defaults authorized |
| `sheathing.spec.md` / sheathing SF rule | Separate; Roof Plane SF ≠ sheathing coverage by itself |
| `roof-framing.spec.md` | Owns Roof System/Plane objects; calculator consumes those artifacts for quantities authorized here |

No contradiction exists if baseline common-rafter **count** is implemented as a **Roof Framing calculator** output fed by Roof System + Roof Plane artifacts.

---

# Engine Debt Notes (not Brain authority)

The following existing engine behaviors are **not** authorized by this document and must be corrected when the engine implements Section A:

- Treating unresolved `RoofPlane.areaSquareFeet` as a critical blocker of `roof.members` for common-rafter count
- Treating unresolved `RoofPlane.pitch` as a critical blocker of `roof.members` for common-rafter count

Count requires `rafterLayoutLengthFeet` (future schema field), not plane SF or pitch.

---

# Future Engine Contract (handoff — do not implement in R1)

When implementing Section A in the engine, expect at minimum:

1. **Schema:** `RoofPlane.rafterLayoutLengthFeet` (nullable positive number; partial-safe). Do not repurpose `areaSquareFeet` or `pitch`.
2. **Evidence:** subjectKinds `roof-framing-system` / `roof-plane`; propertyPath `rafterLayoutLengthFeet`; emit only when source explicitly states spacing-axis layout length; omit if silent; never derive from SF or pitch.
3. **Resolver:** resolve stick systems and planes; conflict → unresolved; missing → null; preserve partial objects.
4. **Quantity key:** e.g. `roof.common-rafters` (or project convention), distinct from any future LF key; revisit speculative `roof.members` naming if it conflates count with length.
5. **Validation:** implement this chapter’s blockers; **remove** SF/pitch count coupling; smallest blast radius across planes.
6. **Calculator:** `ceil((rafterLayoutLengthFeet × 12) / memberSpacingInches) + 1` when eligibility resolves; unit `each`; no truss path; no hip/valley invention; no opening deductions.
7. **Pipeline / report / Review Workspace:** add roof stage wiring, report population, and RW indexing analogous to Floor.
8. **Proof:** deterministic multi-plane fixture (eligible count vs blocked hip/truss/missing layout); live PDF with explicit layout length stated (not derived).

---

This file is construction knowledge for deterministic calculator implementation. Do not create a JSON companion.
