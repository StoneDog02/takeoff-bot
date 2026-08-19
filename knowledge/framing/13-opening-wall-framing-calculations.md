# Opening Wall Framing Calculations

## Purpose

This document defines the authoritative, deterministic calculation contract for **opening-derived wall framing members** on **wood stud wall segments**.

It closes the authority gap referenced in `04-building-assemblies.md` (baseline stud exclusions) and implements the Header Assembly decomposition promised there without duplicating header material ownership.

This document is **calculation authority only**. It does not define extraction prompts, schemas, or TypeScript implementation.

---

# Scope Boundary

## In scope

Wood stud wall openings where the parent object resolves to a `wall-segment` on a `building-wall` with conventional stud-and-plate assembly:

- Door
- Window
- Cased opening
- Garage door (limited; see blocking rules)

Calculable member types:

- King studs
- Jack (trimmer) studs
- Cripple studs (above header / below sill)
- Rough sill

## Out of scope

Do not calculate under this document:

- Header material linear footage (owned by Structural Member calculation in `08-structural-members.md`)
- Floor, stair, roof, shaft, and mechanical opening assemblies (different assembly models in `04-building-assemblies.md`)
- Light-gauge metal stud jambs/tracks
- Connectors, fasteners, holdowns, portal/engineered garage packages
- Shear/high-wind/seismic special framing
- Engineered header sizing or bearing design
- Corner, intersection, or shared-corner stud extras
- Plate offcuts or opening-specific plate length changes

---

# Core Rules

1. **Opening-derived wall framing is additive to baseline wall framing** unless net-mode inputs are explicitly resolved (see Baseline Regular Stud Interaction).
2. **Header material is never emitted by Opening calculation.** A linked `headerMemberId` is context only.
3. **Never infer jack-stud count from opening width, header span, or IRC tables** inside the core engine. Those are plan/code/engineering facts.
4. **Never infer king-stud count from code tables** when explicit project evidence exists; when absent, only the documented industry-default path applies.
5. **Every assumption used in a formula must produce an assumption record** per `10-assumptions.md`.
6. **When required inputs are missing, block that quantity** and create review items. Do not substitute silent guesses.
7. **Each opening on a segment calculates independently.** Multiple openings on one segment are supported by semantics; overlapping rough-opening zones must block net deductions.

---

# Eligibility Preconditions (All Formulas)

An opening participates in opening wall framing calculation only when **all** of the following are true:

| Input | Requirement |
| --- | --- |
| `opening.category` | One of: `door`, `window`, `cased`, `garage-door` |
| `opening.parentObjectId` | Resolves to a `wall-segment` |
| Segment `parentWallId` | Resolves to a `building-wall` |
| Wall `assembly.studSize` | Resolved (non-null) |
| Wall `assembly.heightFeet` | Resolved (non-null) |
| Wall `assembly.studSpacingInches` | Required for cripple count formulas only |
| Wall `assembly.material` | Resolved as wood stud wall **or** null with an documented assumption that the wall is conventional wood stud framing (review required). Block when material resolves to metal stud or other non-wood systems. |

If any eligibility precondition fails, **no opening-framing quantities emit** for that opening.

---

# Opening Occurrence Multiplier

All formulas below produce **per-occurrence** values first, then apply:

```
occurrenceMultiplier = opening.quantity
```

**`opening.quantity` must be resolved before any opening-framing quantity calculates.**

Do not substitute `1` when `quantity` is null or unresolved. This mirrors Structural Member quantity semantics.

## `opening.quantity` semantics

| Condition | Behavior |
| --- | --- |
| `quantity` resolved (positive integer) | Multiply all opening-framing outputs by `quantity` |
| `quantity` null or unresolved | **Block** all opening-framing quantities; preserve Opening object; validation and review explain the block |
| Opening represents multiple physically distinct locations on the same segment | Prefer separate Opening objects when location-specific takeoff is required. A single Opening with `quantity > 1` means **identical repeated occurrences** attributed to that object, not automatic placement along the segment. |
| Opening represents building-wide schedule total but is linked to one segment | **Block** opening-framing calculation until occurrences are allocated to segments or quantity is corrected |

`occurrenceMultiplier` does **not** multiply Structural Member header material. Header quantity remains on the linked Structural Member object.

---

# Material Ownership

| Material | Calculation owner | Output unit | Notes |
| --- | --- | --- | --- |
| Baseline regularly spaced studs | Wall Framing (`04-building-assemblies.md`) | `each` | Excludes opening members |
| Plates | Wall Framing (`04-building-assemblies.md`) | `LF` | Not reduced for openings in baseline rule |
| King studs | Opening Wall Framing (this document) | `each` | Per opening occurrence |
| Jack (trimmer) studs | Opening Wall Framing (this document) | `each` | Per opening occurrence |
| Cripple studs above header | Opening Wall Framing (this document) | `each` | Per opening occurrence |
| Cripple studs below sill | Opening Wall Framing (this document) | `each` | Window only |
| Rough sill | Opening Wall Framing (this document) | `LF` | Window only |
| Header | Structural Member (`08-structural-members.md`) | `LF` | **Exclusive ownership** — Opening must not duplicate |

No material line may appear in more than one ownership domain.

---

# Baseline Regular Stud Interaction

## Authoritative model

The engine uses a **two-layer model**:

```
completeWallStudTakeoff = baselineRegularStuds ± netDeductions + openingAssemblyStuds
```

### Layer 1 — Baseline (default mode: unchanged)

Baseline regularly spaced stud count for a segment remains:

```
studCount = ceil((lengthFeet × 12) / studSpacingInches) + 1
```

as defined in `04-building-assemblies.md`.

**Default behavior:** baseline count is **unchanged** by openings. Opening king, jack, and cripple members are **additive**.

This is the authoritative behavior until net-mode inputs resolve.

**Consequence:** In default mode, stud positions physically displaced by an opening are **not deducted** from baseline. This may overcount total studs until net mode is enabled. That is intentional and conservative relative to inventing layout positions.

### Layer 2 — Net regular-stud deductions (optional)

Net deductions apply **only** when **both** are resolved:

1. `opening.positionOffsetFeetFromSegmentStart` — distance from segment start to opening rough-opening left edge (or documented equivalent edge reference from evidence)
2. `opening.dimensions.roughWidthFeet`

When both resolve for an opening on a segment:

```
roughLeftInches  = positionOffsetFeetFromSegmentStart × 12
roughRightInches = roughLeftInches + (roughWidthFeet × 12)

deductCount = count of baseline stud layout positions (0, S, 2S, …, lengthInches)
              that fall strictly inside (roughLeftInches, roughRightInches)
              using the same layout origin as baseline (segment start, both endpoints counted at ends)
```

Segment net deduction:

```
segmentNetStudDeduction = sum(deductCount for each opening on segment)
```

**Overlap rule:** If rough-opening zones for two openings on the same segment overlap, **block net deductions** for the segment and create a review item. Do not double-deduct.

**Adjusted baseline:**

```
adjustedBaselineStudCount = max(0, baselineStudCount - segmentNetStudDeduction)
```

### NOT CALCULABLE today (schema gap)

`positionOffsetFeetFromSegmentStart` is **not** a current resolved Opening field. Therefore:

- **Net regular-stud deductions are NOT CALCULABLE** in the current engine schema.
- Implementations must use **default additive mode** until that input (or an equivalent explicit `regularStudsDeductedCount` from project evidence) is resolved onto the Opening or segment.

### Additional fact required for universal net takeoff

To deduct displaced regular studs without over/under-counting, the engine must know **opening position along the segment** (or an explicit deducted stud count from plans/details). Rough opening width alone is insufficient.

---

# Header Ownership Rule

Header material linear footage is calculated **only** by the Structural Member calculator:

```
netMaterialLinearFeet = lengthFeet × quantity [× plyCount when built-up]
```

per `08-structural-members.md`.

Opening wall framing calculation:

- **MUST NOT** emit header material lines.
- **MAY** read `opening.headerMemberId` for traceability and validation cross-checks.
- **MUST NOT** derive jack-stud count, jack length, or header bearing from linked header size/span.
- **MUST NOT** add header linear footage into opening-framing totals.

---

# Component Rules and Formulas

## A. King Studs

### When required

King studs are required for eligible openings (`door`, `window`, `cased`, `garage-door`) on eligible wood stud walls.

### Count authority

| Source | Policy class |
| --- | --- |
| Explicit project evidence for total king count or per-side count | **Explicit project evidence required** — overrides defaults |
| No explicit count | **Industry default allowed WITH assumption/review**: `2` kings total (`1` each side) |

Do **not** derive king count from IRC Table R602.7.5, wind zone, or opening width in the core engine.

### Material size

Inherit `wall.assembly.studSize`.

Do not assume a king size different from wall stud size unless explicit project evidence resolves a different size.

### Member length

Full wall stud height:

```
kingStudLengthFeet = wall.assembly.heightFeet
```

Piece-length purchasing conversion is out of scope here; emit stud **count**. Length is provenance for downstream length optimization.

### Formula

**Inputs:** eligibility preconditions, `kingStudCount` (explicit) OR default `2`, `occurrenceMultiplier`

**Preconditions:** all eligibility preconditions pass.

**Calculation:**

```
kingStudCountPerOccurrence = explicitKingStudCount ?? 2
kingStudEach = kingStudCountPerOccurrence × occurrenceMultiplier
```

**Output:** `kingStudEach` — unit: **`each`**

**Provenance:** `sourceObjectId = opening.objectId`, `parentWallId`, `parentSegmentId`

**Assumptions permitted:** default count `2` when explicit count absent (assumption record + review item)

**Blocking conditions:**

- Eligibility preconditions fail
- `garage-door` without conventional wood-stud portal evidence (see Garage Door blocking)
- Explicit king count resolves to `0` while category requires kings — review item, emit `0`

**Interaction:** Additive to baseline in default mode. Kings at opening edges may correspond to positions that net mode would deduct from baseline when position resolves.

---

## B. Jack (Trimmer) Studs

### When required

Jack studs are structurally required at most header-bearing openings, but **count is not safe to infer** from opening width or linked header in the core engine.

### Count authority

| Source | Policy class |
| --- | --- |
| Explicit project evidence: total jack count, per-side count, or detail/spec note | **Explicit project evidence required** |
| Header schedule/detail note listing jack or trimmer count | **Explicit project evidence required** |
| Opening width, header span, bearing status, or IRC prescriptive tables | **Forbidden assumption** — must remain unresolved |

### Per-side count

Do **not** assume `1` jack per side or `2` jacks per side without explicit evidence.

### Material size

When explicit jack size evidence resolves, use it.

Otherwise inherit `wall.assembly.studSize` **only when** jack count is explicitly known.

Do not assume jack size differs from wall stud size.

### Length authority

Jack length runs from bottom plate to header bearing (underside of header assembly).

```
jackStudLengthFeet = wall.assembly.heightFeet - headerBottomElevationFeetFromFinishFloor
```

**Required for length:** `headerBottomElevationFeetFromFinishFloor` **OR** explicit `jackStudLengthFeet` from project evidence.

Linked header `lengthFeet` is horizontal span — **not** a jack length input.

### Formula

**Status: NOT CALCULABLE (count)** unless explicit jack count evidence resolves.

**Status: NOT CALCULABLE (length)** unless explicit jack length or header bottom elevation resolves.

**When explicit total jack count `jackStudCount` resolves:**

```
jackStudEach = jackStudCount × occurrenceMultiplier
```

**When explicit per-side count `jackStudCountPerSide` resolves:**

```
jackStudEach = (jackStudCountPerSide × 2) × occurrenceMultiplier
```

(Use explicit per-side count as stated; do not assume two sides when evidence gives one side only.)

**Output:** `jackStudEach` — unit: **`each`**

**Blocking conditions:**

- No explicit jack count evidence
- Eligibility preconditions fail
- `garage-door` without resolved portal framing detail specifying jack count

**Interaction:** Jacks are additive. They do not replace king studs.

---

## C. Cripple Studs — Above Header

### When required

| Category | Default trigger |
| --- | --- |
| `window` | Cripples above header expected |
| `cased` | When linked header exists and rough opening height is resolved below top plate zone |
| `door` | **Not expected** — count = `0` unless explicit evidence of transom, clerestory, or dropped header below top plate |
| `garage-door` | **NOT CALCULABLE** without explicit detail — portal framing out of scope |

### Spacing / count authority

When count is authorized, spacing inherits **`wall.assembly.studSpacingInches`**.

```
roughOpeningWidthInches = roughWidthFeet × 12
crippleCountAbovePerOccurrence = max(0, ceil(roughOpeningWidthInches / studSpacingInches) - 1)
```

This is **layout continuation** between king studs, not structural bearing design.

Policy class for this spacing inheritance: **Deterministically derivable** when rough width and stud spacing resolve; **Industry default allowed WITH assumption/review** for the formula itself when project detail is silent.

### Length authority

```
crippleLengthAboveFeet = topPlateBottomElevationFeet - headerTopElevationFeet
```

**NOT CALCULABLE** without explicit elevations or resolved vertical rough-opening geometry (see NOT CALCULABLE section).

### Formula (count only)

**Inputs:** `roughWidthFeet`, `studSpacingInches`, `occurrenceMultiplier`, category

**Preconditions:**

- Eligibility preconditions pass
- Category is `window` OR (`cased` with linked header) OR explicit evidence overrides door default
- `roughWidthFeet` resolved
- `studSpacingInches` resolved

**Calculation:**

```
crippleCountAbovePerOccurrence = max(0, ceil((roughWidthFeet × 12) / studSpacingInches) - 1)
crippleAboveEach = crippleCountAbovePerOccurrence × occurrenceMultiplier
```

**Output:** `crippleAboveEach` — unit: **`each`**

**Blocking conditions:**

- `roughWidthFeet` unresolved
- `studSpacingInches` unresolved
- Category `door` without transom/dropped-header evidence
- Category `garage-door`

**Interaction:** Additive. Does not include kings or jacks.

---

## D. Cripple Studs — Below Sill

### When required

**Window openings only.**

Doors, cased openings without sill, and garage doors: count = `0` unless explicit evidence.

### Spacing / count authority

Same count formula as above-header cripples when rough width and stud spacing resolve.

### Length authority

```
crippleLengthBelowFeet = sillBottomElevationFeet - bottomPlateTopElevationFeet
```

Requires explicit **sill height** or vertical rough-opening geometry.

**Count does not require sill height.** **Length does.**

### Formula (count only)

**Inputs:** category `window`, `roughWidthFeet`, `studSpacingInches`, `occurrenceMultiplier`

**Preconditions:**

- Eligibility preconditions pass
- Category is `window`
- `roughWidthFeet` resolved
- `studSpacingInches` resolved

**Calculation:**

```
crippleCountBelowPerOccurrence = max(0, ceil((roughWidthFeet × 12) / studSpacingInches) - 1)
crippleBelowEach = crippleCountBelowPerOccurrence × occurrenceMultiplier
```

**Output:** `crippleBelowEach` — unit: **`each`**

**Blocking conditions:**

- Category not `window`
- `roughWidthFeet` unresolved
- `studSpacingInches` unresolved

---

## E. Rough Sill

### When required

**Window openings only.**

### Count and length

One rough sill member per window occurrence, spanning the rough opening width.

Do **not** use nominal width when rough width is unresolved.

### Material size

Inherit `wall.assembly.studSize` unless explicit sill size evidence resolves.

### Formula

**Inputs:** `roughWidthFeet`, `occurrenceMultiplier`

**Preconditions:**

- Eligibility preconditions pass
- Category is `window`
- `roughWidthFeet` resolved

**Calculation:**

```
roughSillLinearFeetPerOccurrence = roughWidthFeet
roughSillLinearFeet = roughSillLinearFeetPerOccurrence × occurrenceMultiplier
```

**Output:** `roughSillLinearFeet` — unit: **`LF`**

**Assumptions permitted:** sill size = wall stud size when no explicit sill size (assumption record + review item)

**Blocking conditions:**

- Category not `window`
- `roughWidthFeet` unresolved — do not substitute nominal width

**Interaction:** Independent of header material. Additive.

---

# Multiple Openings on One Segment

| Rule | Behavior |
| --- | --- |
| Iteration | Calculate opening-framing independently for **each** opening in `segment.openingIds` |
| Baseline studs (default mode) | Segment baseline computed **once**, unchanged by opening count |
| Baseline studs (net mode) | Sum per-opening deductions when positions resolve; block on overlap |
| Plates | Unchanged per baseline rule regardless of opening count |
| Headers | Each opening may link its own Structural Member; header quantities stay on those members |
| Same wall, multiple segments | Each segment's openings only affect that segment's baseline/net rules |

---

# Garage Door Special Case

`garage-door` openings often require engineered portal framing, posts, and doubled members.

| Component | Authority |
| --- | --- |
| Header material | Structural Member only — when header resolves |
| King studs | May use king formula **only when** evidence indicates conventional wood-stud portal framing; otherwise **block** |
| Jack studs | **NOT CALCULABLE** without explicit portal/detail jack count |
| Cripples | **NOT CALCULABLE** without explicit detail |
| Rough sill | Not applicable |

Default posture: **block opening-framing quantities** for `garage-door` unless project evidence confirms conventional wood-stud portal treatment.

---

# Assumption Policy Summary

| Fact | Class | Notes |
| --- | --- | --- |
| King stud count = 2 | **3 — Industry default WITH assumption/review** | When no explicit count |
| King stud size = wall stud size | **2 — Derivable** | From wall assembly |
| Jack stud count | **1 — Explicit evidence required** | Never from width/load/IRC |
| Jack stud length | **1 — Explicit evidence required** | Elevation or explicit length |
| Cripple count from width ÷ spacing | **3 — Industry default WITH assumption/review** | Layout continuation; not structural |
| Cripple stud length | **1 — Explicit evidence required** | Sill/header elevations |
| Rough sill length = rough width | **2 — Derivable** | When rough width resolved |
| Rough sill size = wall stud size | **3 — Industry default WITH assumption/review** | When detail silent |
| Rough opening from nominal | **4 — Forbidden** | Already in `07-openings.md` |
| Header size/ply from opening width | **4 — Forbidden** | Already in `10-assumptions.md` |
| Jack count from header span / IRC | **4 — Forbidden** | Structural/code dependent |
| King count from IRC/wind tables | **4 — Forbidden** | Plan/code dependent |
| Opening position along segment | **1 — Explicit evidence required** | For net stud deductions |
| Regular studs deducted count | **1 — Explicit evidence required** | Alternative to position |
| Wood stud wall material when null | **3 — Industry default WITH assumption/review** | Block metal stud walls |
| Cripple spacing | **2 — Derivable** | Inherit wall stud spacing |
| Seismic/high-wind doubled jacks | **4 — Forbidden** | Requires structural detail |
| Load-bearing jack doubling | **4 — Forbidden** | Requires structural detail |

---

# Quantities Intentionally NOT CALCULABLE (Current Schema)

| Quantity | Why blocked | Additional fact required |
| --- | --- | --- |
| Jack stud count | Structural/plan dependent | Explicit jack count from evidence/detail |
| Jack stud length | Vertical geometry unknown | Header bottom elevation or explicit jack length |
| Cripple length (above/below) | Vertical geometry unknown | Header top, sill, plate elevations |
| Net baseline stud deduction | Opening position unknown | `positionOffsetFeetFromSegmentStart` or explicit `regularStudsDeductedCount` |
| Garage-door portal framing | Engineered assembly | Structural portal detail |
| Header material via Opening | Ownership boundary | Already on Structural Member |
| Plate cuts at openings | No authority yet | Future explicit rule |
| Metal stud opening jambs | Different assembly | Metal stud wall model |

---

# Complete Framing Quantity Composition

For a wood stud wall segment in **default additive mode**:

```
segmentStudEach =
  baselineRegularStudEach                           // Wall Framing calculator
  + sum(opening.kingStudEach)                       // per opening on segment
  + sum(opening.jackStudEach)                       // when calculable
  + sum(opening.crippleAboveEach)                   // when calculable
  + sum(opening.crippleBelowEach)                   // when calculable

segmentPlateLinearFeet = lengthFeet × plateCount    // unchanged by openings

headerLinearFeet = sum(linked Structural Member netMaterialLinearFeet)  // separate domain
```

Opening-framing calculator emits **its own material lines**; it does not rewrite baseline wall calculator output in default mode.

---

# Validation and Review Triggers

Create review items when:

- Opening eligible but `roughWidthFeet` missing while cripple or sill formulas would apply
- Default king count assumed
- Default wood-wall material assumed
- `quantity` null but schedule implies multiple occurrences
- `quantity > 1` on a single-segment opening without repetition evidence
- Net-mode overlap detected
- `garage-door` opening blocked for portal framing
- Linked header exists but jack count evidence missing (expected for most projects)
- Bearing/shear/high-wind notes reference special opening framing not modeled here

---

# Relationship to Specs

| Spec | Relationship |
| --- | --- |
| `openings.spec.md` | States openings do not own framing members created because of openings. **Future amendment required** to add Opening Wall Framing Calculator ownership of opening-derived quantities while preserving Opening object identity ownership. |
| `wall-framing.spec.md` | Owns baseline studs/plates only. Net deductions remain wall-framing domain when implemented. |
| `structural-members.spec.md` | Owns header material exclusively. |

No spec contradiction exists if opening-derived quantities are implemented as a **calculator** fed by Opening + Wall artifacts, not as fields on the Opening schema object itself.

---

This file is construction knowledge for deterministic calculator implementation. Do not create a JSON companion.
