# Floor Framing Calculations

## Purpose

This document defines the authoritative, deterministic calculation contract for **floor-framing-derived quantities** on resolved Floor Framing Systems and Floor Framing Areas.

It closes the calculation authority gap for floor assemblies described in `04-building-assemblies.md` (Floor Framing Assembly; Stair Opening / Floor Opening Assembly) without duplicating:

- Structural Member material ownership in `08-structural-members.md`
- Sheathing coverage ownership in `04-building-assemblies.md` (Net Sheathing Coverage Quantity)
- Blocking, connector, or hardware ownership

This document is **calculation authority only**. It does not define extraction prompts, schemas, or TypeScript implementation.

---

# Scope Boundary

## In scope (this document)

Wood / wood-product floor framing bays represented as Floor Framing System + Floor Framing Area objects with conventional regularly spaced joist layout:

- Dimensional lumber joists
- I-joists and other wood structural panel / engineered joist products when size and spacing are plan-resolved (size classification only; no engineered design)

Authorized calculable quantities:

1. **Baseline regularly spaced floor joist count** (`each`)
2. **Baseline regularly spaced floor joist material linear footage** (`linear-foot`) — only for the narrow simple-area eligibility class defined below

## Out of scope (this document)

Do not calculate under this document:

- Stock / purchasing piece counts or purchasing-length optimization
- Rim board or rim joist linear footage
- Stair / floor opening headers, trimmers, doubled joists, or hangers
- Blocking, bridging, squash blocks, web stiffeners
- Beams, girders, posts, and other individually identified structural members
- Floor / subfloor sheathing square footage
- Waste, sheet conversion, or supplier SKUs
- Floor truss package takeoff (engineered system; different model)
- Metal-joist / open-web steel floor systems
- Continuous / multi-span / lapped / spliced joist piece decomposition
- Assumed bearing-seat additions to clear span

---

# Core Rules

1. **Baseline regularly spaced floor joists are additive** to other floor framing members. Opening special members, beams, rim products, and blocking are not substituted into this population by inference.
2. **Never invent joist spacing, joist size, layout length, or member length.** Missing facts block the **affected** quantity and create review items.
3. **Never derive joist count or joist LF from `areaSquareFeet`.** Area square footage classifies coverage geometry for other subsystems; it is not a joist count or LF input.
4. **Never infer `joistLayoutLengthFeet` or `joistMemberLengthFeet` from bounding-wall topology, room polygons, \(\sqrt{\text{area}}\) heuristics, IRC tables, or manufacturer span tables** in the core engine unless a future Brain rule explicitly authorizes that derivation.
5. **Each Floor Framing Area calculates independently.**
6. **Every assumption used in a formula must produce an assumption record** per `10-assumptions.md`.
7. **No material line may appear in more than one ownership domain.**
8. **Joist count and joist LF are independently blockable.** Missing LF-only inputs must not block count when count inputs resolve.
9. **Do not invent shortening, splice, or bearing-seat arithmetic.** Prefer block or area decomposition over clever geometry.

---

# Terminology

| Term | Meaning |
| --- | --- |
| **Span direction** | Direction in which each joist runs from bearing to bearing. |
| **Joist spacing axis** | Axis **perpendicular** to span direction. Regularly spaced joists are placed along this axis at `joistSpacingInches`. |
| **`joistLayoutLengthFeet`** | Resolved length, in feet, of the floor area measured along the **joist spacing axis**. Governs baseline joist **count**. Must **not** be reused as member length. |
| **`joistMemberLengthFeet`** | Resolved **installed material length**, in feet, of **one** baseline regularly spaced joist member in the eligible Floor Framing Area. Governs baseline joist **LF**. See § Length Fact Semantics. |
| **Clear span** | Face-to-face distance between supports. **Not** an authorized LF input by itself. |
| **Bearing-to-bearing dimension** | Support-center or support-edge geometry used structurally. **Not** automatically equal to material member length. |
| **Stock / purchasing length** | Supplier cut length. **Out of scope** here. |

## Why not `runWidthFeet`

The earlier STOP-package term `runWidthFeet` is **rejected** as the domain name.

**Authoritative field name for the count input:** `joistLayoutLengthFeet`.

## Why `joistMemberLengthFeet` (not `joistSpanLengthFeet`)

`joistSpanLengthFeet` invites confusion with structural clear span or bearing-to-bearing geometry.

Takeoff needs **material quantity**. The authoritative length fact for baseline joist LF is therefore:

**`joistMemberLengthFeet`** — the explicit resolved length of one installed baseline joist member.

### Length fact semantics — what `joistMemberLengthFeet` DOES mean

- The material length of one baseline regularly spaced joist piece as installed for that Floor Framing Area (or an explicit plan note that states that piece length).
- The length that, when multiplied by the baseline joist count for that area, yields **net installed framing material LF** for that baseline population (before waste / purchasing).

### Length fact semantics — what `joistMemberLengthFeet` does NOT mean

- Clear span alone
- A dimension inferred by adding assumed end-bearing / seat lengths to clear span
- Bay geometry along the spacing axis (`joistLayoutLengthFeet`)
- Stock / purchasing stick length
- Linked Structural Member `lengthFeet` unless that member is **explicitly** the same baseline population and ownership rules allow it (normally they do not; SM joists are specials)

### Geometric interpretation (axes)

Given a rectangular (or rectangularized takeoff) floor bay:

- If joists **span** north–south, `joistLayoutLengthFeet` is the **east–west** bay dimension (spacing axis).
- If joists **span** east–west, `joistLayoutLengthFeet` is the **north–south** bay dimension.
- `joistMemberLengthFeet` lies along the **span** axis and must not be copied from `joistLayoutLengthFeet`.

`spanDirection` (and/or `framingDirection` when it unambiguously identifies span) must be resolved sufficiently to confirm axis assignment.

Do not swap axes by guess.

---

# Eligibility Preconditions (Baseline Joist Count)

A Floor Framing Area participates in baseline joist **count** calculation only when **all** of the following are true:

| Input | Requirement |
| --- | --- |
| Parent Floor Framing System | `area.parentSystemId` resolves to an existing system |
| System ↔ area consistency | Area listed on `system.areaIds` and parent pointer consistent |
| `system.assembly.joistSpacingInches` | Resolved (non-null, positive) |
| `system.assembly.joistSize` | Resolved (non-null) — material identity |
| `system.assembly.joistType` | Resolved (non-null) — material identity / classification |
| `area.joistLayoutLengthFeet` | Resolved (non-null, positive) — **spacing-axis length** |
| `area.spanDirection` | Resolved sufficiently to confirm layout-length axis (non-null; not an empty/unknown placeholder) |

Optional / not required for count:

| Input | Role |
| --- | --- |
| `area.joistMemberLengthFeet` | **Not required for count**; required for LF |
| `area.areaSquareFeet` | **Not used** for count or LF |
| `area.framingDirection` | May corroborate span/layout; not a substitute for resolved layout length |
| `system.assembly.rimBoard` | Spec note only |
| `area.boundingWallIds` | Traceability |
| `area.openingIds` | Traceability for count; see LF opening policy |
| `area.structuralMemberIds` | Traceability; double-count review when conflicting |

If any required **count** eligibility input fails, **do not emit** baseline joist count for that area. Preserve the Floor objects; validation and review explain the block.

---

# Eligibility Class (Baseline Joist LF — Simple Area)

Baseline joist **LF** is authorized only for the **simple single-span equal-length Floor Framing Area** class.

An area is eligible for the one-length LF formula only when **all** of the following are true:

| Requirement | Meaning |
| --- | --- |
| Count eligibility | Area already satisfies baseline joist **count** preconditions (or an explicit count override resolves) so a baseline `joistCount` exists |
| `area.joistMemberLengthFeet` | Resolved (non-null, positive) — **one common installed member length** for the baseline population |
| Simple single-span layout | Area represents a single-span bay in which every baseline regularly spaced joist shares that same member length |
| Equal-length population | No resolved evidence that baseline joists in the area have multiple different member lengths |
| Not continuous / multi-span | No resolved continuous joist over intermediate bearing requiring piece decomposition |
| Not lapped / spliced | No resolved lap or splice condition for the baseline population |
| Not floor truss | Area is not a floor-truss package representation |
| Opening length effect | See Opening Policy for LF — openings that change baseline member lengths disqualify the one-length formula unless the bay is decomposed into independently resolved Areas |

If LF eligibility fails while count eligibility succeeds: **emit count; block LF only**.

---

# Material Ownership

| Material | Calculation owner | Output unit | Notes |
| --- | --- | --- | --- |
| Baseline regularly spaced floor joists — **count** | Floor Framing (this document) | `each` | Section A |
| Baseline regularly spaced floor joists — **material LF** | Floor Framing (this document) | `linear-foot` | Section B; same population as count |
| Individually identified beams / girders / posts | Structural Member (`08`) | `LF` | Exclusive when resolved as SM objects |
| Stair / floor opening headers, trimmers, doubled joists | Structural Member and/or future floor-opening calculation authority | — | **Not** baseline population |
| Rim board / rim joist | Future Floor or SM authority | — | **Excluded** from baseline joist count and LF |
| Floor / subfloor sheathing | Sheathing (`04` Net Sheathing Coverage) | `SF` | Separate |
| Blocking / bridging | Blocking subsystem | — | Out of scope here |
| Hangers / connectors | Connectors / Hardware | — | Out of scope here |

## Dual emission (count + LF)

When both count and LF are calculable for the same Floor Framing Area, Floor Framing **shall emit both**:

1. One material line for baseline joist **count** (`each`)
2. One material line for baseline joist **material LF** (`linear-foot`)

Both lines describe the **same physical baseline population** under Floor ownership. They are complementary quantity views (piece count vs material length), not two populations.

Do **not** treat the LF line as Structural Member output.

## Double-counting rule (Floor vs Structural Members)

When baseline regularly spaced joists are calculated under this document:

- Emit **Floor Framing** material lines for baseline joist **count** and, when eligible, baseline joist **LF**.
- Do **not** also emit Structural Member net material LF for the same repetitive baseline joist population solely because joist type/size/spacing/length appear on the floor schedule.

Structural Member calculation remains correct for:

- Beams, girders, posts
- Explicitly tagged special members (trimmer, header, doubled joist callout as its own object)
- Rim members when modeled as Structural Member objects with resolved length and quantity
- Any joist that the project has resolved as an **individual** Structural Member object with its own `lengthFeet` and `quantity` **and** that object is **not** part of the baseline regularly spaced population already owned by Floor Framing

If both representations exist for the same physical members, **block** both domains’ overlapping quantities and create a review item rather than emitting both.

---

# Component Rules and Formulas

## A. Baseline Regularly Spaced Floor Joist Count

### When required

Baseline joist count is required for eligible Floor Framing Areas on eligible Floor Framing Systems with conventional regularly spaced joist layout.

### Count authority

| Source | Policy class |
| --- | --- |
| Explicit project evidence for total joist count in the area | **Explicit project evidence required** — overrides the layout formula when resolved onto the area as an explicit count |
| Layout length + spacing with both endpoints counted | **Deterministically derivable** when required inputs resolve |

Do **not** derive count from:

- `areaSquareFeet`
- `joistMemberLengthFeet` / clear span / bearing geometry
- IRC / manufacturer span tables
- Assumed rectangularization of irregular rooms without resolved layout length

### Material identity

Classify the material line from resolved system assembly:

- `joistType`
- `joistSize`

Do not infer engineered species, series, or flange grade beyond what is resolved.

### Geometric quantity that governs count

**`joistLayoutLengthFeet`** — length along the joist spacing axis.

This is the floor analogue of wall-segment `lengthFeet` in the baseline wall stud rule (`04-building-assemblies.md`).

### Formula

**Inputs:** count eligibility preconditions, `joistLayoutLengthFeet`, `joistSpacingInches`

**Calculation:**

```
layoutLengthInches = joistLayoutLengthFeet × 12
spaces = layoutLengthInches / joistSpacingInches
joistCount = ceil(spaces) + 1
```

**Output:** `joistCount` — unit: **`each`**

Whole-piece rounding for member counts follows the same ceil-based whole-piece policy used for wall stud counts (`10-assumptions.md`).

### Endpoint / layout policy

- Count **both endpoints** of the layout axis.
- Place intermediate joists at the specified on-center spacing from the start of the layout axis.
- Always count the far-end joist.
- The final bay may therefore be shorter than the specified spacing.

### Explicit count override

When an explicit resolved joist count for the area exists:

```
joistCount = explicitJoistCount
```

Do not average or blend with the layout formula. Explicit count wins.

### Rim / band interaction (count)

Baseline joist count **includes** the regularly spaced end joists at both ends of the layout axis (endpoint policy).

Baseline joist count **excludes** separate rim board / rim joist **products**.

Rim material is **NOT CALCULABLE** under this document until a dedicated rim LF rule is authored.

### Opening interaction (count)

- Baseline joist count is **unchanged** by floor / stair openings.
- Opening-derived members are **not** included in this count.
- Do **not** deduct joists from the baseline count using opening width unless a future net-mode rule resolves opening position along the layout axis (or an explicit deducted-joist count).
- Unresolved opening references on the area do **not** by themselves block baseline joist count.

### Multi-area behavior (count)

| Rule | Behavior |
| --- | --- |
| Iteration | Calculate independently for **each** Floor Framing Area |
| Shared system assembly | Spacing/size/type come from the parent system; count uses each area’s own `joistLayoutLengthFeet` |
| Overlapping areas | If two areas claim the same physical bay, **block** both counts and create a review item rather than double-counting |

### Provenance (count)

Material lines must carry:

- `sourceObjectIds` including the Floor Framing Area and parent Floor Framing System
- `assumptionIds` / `reviewItemIds` when assumptions or reviews apply
- Classification derived from resolved `joistType` and `joistSize`

### Blocking conditions (count only)

Block baseline joist **count** when:

- Count eligibility preconditions fail
- `joistSpacingInches` unresolved
- `joistLayoutLengthFeet` unresolved
- `joistSize` or `joistType` unresolved (material identity)
- `spanDirection` unresolved such that layout-axis confirmation fails
- Explicit count and layout formula both claim authority with conflicting values
- Overlapping areas would double-count

Do **not** block count solely because `joistMemberLengthFeet` is unresolved.

### Worked examples (count)

**Example C1 — exact spaces**

- `joistLayoutLengthFeet = 20`
- `joistSpacingInches = 16`
- `joistCount = 16`

**Example C2 — short final bay**

- `joistLayoutLengthFeet = 12`
- `joistSpacingInches = 16`
- `joistCount = 10`

**Example C3 — non-integer spaces**

- `joistLayoutLengthFeet = 19.5`
- `joistSpacingInches = 16`
- `joistCount = 16`

**Example C4 — area SF present but irrelevant**

- `areaSquareFeet = 240`
- `joistLayoutLengthFeet` unresolved  
→ **Block** joist count. Do not infer layout length from area.

**Example C5 — wrong axis (must not calculate)**

- Plan: joists span 14 ft N–S; bay is 14 ft × 24 ft
- Evidence stores `joistLayoutLengthFeet = 14` while `spanDirection` resolves to N–S  
→ Treat as conflict / unresolved layout length; **block** count.

---

## B. Baseline Regularly Spaced Floor Joist Material Linear Footage

### Quantity definition

**Baseline floor joist material linear footage** is the **net installed framing material length** of the **same** baseline regularly spaced joist population already governed by Section A.

It is **not**:

- Stock / purchasing LF
- Waste-adjusted LF
- Rim LF
- Opening special-member LF
- Structural Member LF for individually tagged members

### When required

Baseline joist LF is required for Floor Framing Areas that satisfy the **simple-area LF eligibility class**.

### Count input authority (single authoritative path)

LF **consumes the authoritative baseline `joistCount`** produced by Section A for that area (layout formula or explicit count override).

Do **not** independently re-derive count inside the LF rule with a second copy of the spacing math. One count path; LF multiplies that result.

If Section A cannot produce `joistCount` for the area, LF is **not calculable**.

### Length authority

| Source | Policy class |
| --- | --- |
| Explicit project evidence for installed member / piece length of the baseline joists in the area | **1 — Explicit evidence required** |
| Clear span, bearing-to-bearing dimension, bay span geometry without explicit member length | **4 — Forbidden** as silent LF inputs |
| Derived length from `areaSquareFeet`, `joistLayoutLengthFeet`, wall topology, IRC / span tables | **4 — Forbidden** |
| Assumed end-bearing seat addition to clear span | **4 — Forbidden** |

### Formula

**Status: CALCULABLE** when simple-area LF eligibility and Section A `joistCount` resolve.

```
joistLinearFeet = joistCount × joistMemberLengthFeet
```

**Output:** `joistLinearFeet` — unit: **`linear-foot`**

Unrounded net construction quantity (same spirit as Structural Member net material LF). No waste. No purchasing-length rounding.

### Material identity

Same as count:

- `joistType`
- `joistSize`

### Opening policy (LF)

Conservative V1 rule:

1. Baseline **count** remains unchanged by openings (Section A).
2. The one-length LF formula assumes **every** baseline joist in the area has length `joistMemberLengthFeet`.
3. If resolved evidence shows that floor/stair openings cause some baseline joists to **terminate or shorten** (different installed lengths within the same Area), the Area is **NOT eligible** for the one-length LF formula.
4. Remediation path: decompose into independently resolved Floor Framing Areas (each with its own common member length), **or** represent shortened/special members as Structural Members / future floor-opening authority — do **not** invent opening-width LF deductions.
5. Unresolved `openingIds` alone do **not** prove length change; they also do **not** authorize inventing deductions. If the plan leaves opening length effects ambiguous while a single `joistMemberLengthFeet` is stated for the bay, treat as review: confirm simple-area equal-length assumption or block LF.

Do **not** subtract opening area or opening width from `joistLinearFeet`.

### Bearing / multi-span / splice policy (LF)

| Condition | LF policy |
| --- | --- |
| Simple single-span; one common explicit `joistMemberLengthFeet` | **CALCULABLE** under this section |
| Intermediate bearing with continuous joists (one piece over multiple spans) | **NOT CALCULABLE** under the one-length simple-area formula unless evidence explicitly states one installed piece length that already accounts for the continuous member **and** the area is still equal-length; prefer decomposition / SM when ambiguous |
| Lapped joists | **NOT CALCULABLE** as one-length baseline LF; laps create additional piece lengths |
| Spliced joists | **NOT CALCULABLE** as one-length baseline LF without explicit piece schedule |
| Clear span known; member length unknown | **Block LF**; do **not** add assumed bearing seats |
| Multiple different baseline member lengths in one Area | **Block LF**; decompose Areas or use SM specials |

### Material-type applicability

| Product | LF under this section |
| --- | --- |
| Dimensional lumber joists | Yes, when simple-area eligibility resolves |
| I-joists / engineered wood joists (size classification only) | Yes, when simple-area eligibility resolves; do not invent series/grade/flange design |
| Floor trusses | **No** — out of scope; different model |
| Metal joists / open-web steel | **No** — out of scope |

### Rim interaction (LF)

Rim / band products remain **excluded** from baseline joist LF. Do not include rim length in `joistLinearFeet`.

### Provenance (LF)

Material lines must carry:

- `sourceObjectIds` including the Floor Framing Area and parent Floor Framing System
- Evidence for `joistMemberLengthFeet` and for the inputs that produced `joistCount`
- `assumptionIds` / `reviewItemIds` when applicable
- Classification from `joistType` and `joistSize`

### Blocking conditions (LF only)

Block baseline joist **LF** (without necessarily blocking count) when:

- Section A `joistCount` is not available for the area
- `joistMemberLengthFeet` unresolved or conflicted
- Simple-area LF eligibility fails (multi-span / continuous / lap / splice / unequal lengths / floor truss)
- Opening evidence shows unequal baseline member lengths without Area decomposition
- Floor vs SM double-count conflict for the same physical population
- Axis / length semantics conflict (e.g. evidence shows `joistMemberLengthFeet` was copied from spacing-axis layout length)

### Worked examples (LF)

**Example A — count and LF**

- `joistLayoutLengthFeet = 20`
- `joistSpacingInches = 16`
- → `joistCount = 16`
- `joistMemberLengthFeet = 12`
- → `joistLinearFeet = 16 × 12 = 192` LF  
Emit both: **16 each** and **192 LF**.

**Example B — count without LF**

- Same count inputs → `joistCount = 16`
- `joistMemberLengthFeet` unresolved  
→ Emit **16 each**; **block LF only**.

**Example C — SF absent; member length present**

- `areaSquareFeet` absent
- Count inputs resolve → `joistCount = 16`
- `joistMemberLengthFeet = 12`  
→ Count and LF both calculable. SF must not participate.

**Example D — multi-span / continuous**

- Area has intermediate bearing; joists continuous over multiple spans; no single explicit equal installed piece length for the baseline population  
→ Count may still calculate from layout length + spacing if count inputs resolve.  
→ **Block LF** under this simple-area rule (decompose or SM / future authority).

**Example E — Floor / SM duplicate**

- Floor Area emits baseline joist count (and LF if eligible)
- Same physical joists also resolved as repetitive Structural Member joist objects with `lengthFeet` × `quantity`  
→ **Block** overlapping quantities; review; do not emit both domains.

**Example F — opening shortens some joists**

- Bay has an opening that terminates selected joists at different lengths; one Area still claims a single `joistMemberLengthFeet`  
→ **Block LF** until Areas are decomposed or specials are SM-owned. Do not deduct opening width from LF.

---

# Assumption Policy Summary

| Fact | Class | Notes |
| --- | --- | --- |
| Joist count from layout length ÷ spacing + endpoints | **2 — Deterministically derivable** | When count inputs resolve |
| Explicit joist count from plans | **1 — Explicit evidence required** | Overrides layout formula |
| Joist LF = count × `joistMemberLengthFeet` | **2 — Deterministically derivable** | Only when simple-area LF eligibility resolves |
| Joist spacing | **1 — Explicit evidence required** | |
| Joist size / type | **1 — Explicit evidence required** | |
| `joistLayoutLengthFeet` | **1 — Explicit evidence required** | Spacing axis only |
| `joistMemberLengthFeet` | **1 — Explicit evidence required** | Installed member length; never defaulted |
| Span direction | **1 — Explicit evidence required** | Axis confirmation |
| Member length from clear span + assumed bearing seats | **4 — Forbidden** | |
| Member length from `areaSquareFeet` or `joistLayoutLengthFeet` | **4 — Forbidden** | |
| Member length from IRC / span tables | **4 — Forbidden** | |
| Rim count/LF from perimeter | **4 — Forbidden** until dedicated rule | |
| Joist count from `areaSquareFeet` | **4 — Forbidden** | |
| Opening joist length deductions without decomposition | **4 — Forbidden** | |
| Opening joist count deductions without position | **4 — Forbidden** | |

---

# Quantity Classification Matrix

| Quantity | Status |
| --- | --- |
| Baseline regularly spaced floor joist **count** | **CALCULABLE NOW** when count eligibility inputs resolve |
| Explicit joist count override | **CALCULABLE WITH ADDITIONAL RESOLVED INPUT** |
| Baseline regularly spaced floor joist **material LF** | **CALCULABLE NOW** when simple-area LF eligibility + `joistMemberLengthFeet` + Section A count resolve |
| Stock piece count | **DEFERRED** — purchasing optimization out of scope |
| Rim / band LF | **DEFERRED** — extract/review today; no LF formula here |
| Continuous / multi-span / lap / splice piece schedules | **NOT CALCULABLE** under the simple-area LF rule |
| Stair / floor opening framing | **DEFERRED** / partially **OWNED BY STRUCTURAL MEMBERS** when tagged as SM objects |
| Blocking / bridging | **OWNED BY BLOCKING SUBSYSTEM** / deferred |
| Beams / girders / posts | **OWNED BY STRUCTURAL MEMBERS** (`08` net material LF) |
| Floor / subfloor sheathing SF | **OWNED BY SHEATHING** |

---

# Quantities Intentionally NOT CALCULABLE (Current Contract)

| Quantity | Why blocked | Additional fact / authority required |
| --- | --- | --- |
| Stock pieces / purchasing lengths | Purchasing | Out of scope |
| Waste / sheet conversion | Purchasing | Out of scope |
| Rim LF | No perimeter/rim formula | Future rim calculation contract |
| Opening trimmers/headers | Structural/plan dependent | Explicit SM evidence or future floor-opening calc doc |
| Net joist count deductions at openings | Opening position along layout axis unknown | Position or explicit deducted count |
| Opening-based LF shortening deductions | Unequal lengths / no decomposition | Decompose Areas or SM specials |
| Continuous / multi-span piece LF | Outside simple-area class | Explicit piece schedule or future Brain rule |
| Lap / splice quantities | Outside simple-area class | Explicit piece schedule |
| Bearing seat additions to clear span | Forbidden assumption | Explicit `joistMemberLengthFeet` |
| Floor truss package quantities | Different model | Truss authority |
| Sheathing from Floor `areaSquareFeet` | Ownership | Explicit Sheathing Area |
| Layout length from bounding walls or area SF | Forbidden | Explicit `joistLayoutLengthFeet` |
| Member length from layout length or area SF | Forbidden | Explicit `joistMemberLengthFeet` |

---

# Validation and Review Triggers

Create review items when:

**Count-related**

- Eligible floor area lacks `joistLayoutLengthFeet` while joist takeoff is expected
- Joist spacing, size, or type missing
- Span direction missing or conflicts with the axis used for layout length
- Layout length appears to equal span-axis member length under resolved span direction without corroboration (axis conflict)
- Explicit joist count conflicts with layout formula result
- Overlapping floor areas would double-count joists

**LF-related (do not auto-block count)**

- Count is calculable but `joistMemberLengthFeet` missing while joist material LF is expected
- `joistMemberLengthFeet` conflicts across evidence
- Evidence suggests multi-span / continuous / lap / splice / unequal lengths while one-length LF is claimed
- Opening geometry likely changes baseline member lengths without Area decomposition
- Same physical joists would be emitted by both Floor Framing and Structural Members domains

---

# Relationship to Specs and Other Brain Files

| Source | Relationship |
| --- | --- |
| `04-building-assemblies.md` | Floor Framing Assembly extract/review; this document owns **calculation** for baseline joist count and simple-area joist LF |
| `08-structural-members.md` | Owns individually identified member LF; must not duplicate Floor baseline joist population (count or LF) |
| `09-material-taxonomy.md` | Classifies lumber / I-joist / rim products; does not define counts or LF formulas |
| `10-assumptions.md` | No floor joist spacing or member-length defaults authorized |
| `sheathing.spec.md` / sheathing SF rule | Separate; Floor Area SF ≠ sheathing coverage by itself |
| `floor-framing.spec.md` | Owns Floor System/Area objects; calculator consumes those artifacts for quantities authorized here |

No contradiction exists if baseline joist **count** and simple-area **LF** are implemented as **Floor Framing calculator** outputs fed by Floor System + Floor Area artifacts, not as embedded quantity fields that replace object identity.

---

# Complete Floor Quantity Composition (Default Mode)

For one Floor Framing Area in **default additive mode**:

```
areaJoistEach =
  baselineRegularJoistEach                    // Section A (when calculable)
  + sum(openingSpecialJoistEach)              // when future authority exists

areaJoistLinearFeet =
  baselineRegularJoistLinearFeet              // Section B (when simple-area eligible)
  // opening-shortened / special member LF: SM or future authority — not invented here

// rim, beams, blocking, sheathing: other domains
```

Floor Framing calculator emits **its own material lines** for authorized quantities. It does not rewrite Structural Member or Sheathing calculator output.

---

# Future Engine Contract (E2 handoff — do not implement in E1)

When implementing Section B in the engine, expect at minimum:

1. **Schema:** `FloorFramingArea.joistMemberLengthFeet` (nullable positive number; partial-safe). Do not repurpose `joistLayoutLengthFeet`.
2. **Evidence:** subjectKind `floor-framing-area`, propertyPath `joistMemberLengthFeet`; emit only when source explicitly states installed member/piece length; omit if silent; never derive from SF or layout length.
3. **Resolver:** resolve as explicit construction fact with conflict → unresolved; missing → null.
4. **Quantity key:** e.g. `floor.joists.linear-feet` (or project convention), distinct from `floor.joists` count.
5. **Validation:** missing/unresolved member length blocks **only** the LF quantity; count remains independently calculable; multi-span/unequal-length/opening-length-change/review triggers per this document.
6. **Calculator:** consume authoritative Section A `joistCount`; multiply by resolved `joistMemberLengthFeet`; emit `linear-foot` line with same material identity as count; no stock conversion; no opening deductions.
7. **Report / Review Workspace:** expose Floor Area member-length reviews; keep count and LF independently inspectable.
8. **Proof:** deterministic multi-area fixture (count+LF vs count-only); live PDF with explicit member length stated (not derived).

---

This file is construction knowledge for deterministic calculator implementation. Do not create a JSON companion.
