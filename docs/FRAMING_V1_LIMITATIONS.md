# Framing V1 Limitations

Product-readable statement of what the current framing takeoff engine **will not invent or calculate**. This is part of the Beckstead readiness gate.

Authority remains in Construction Brain specs and calculation docs. This sheet summarizes the operational posture for reviewers and operators.

---

## Walls

- **No corner / intersection extras** unless explicitly supported later.
- **Additive baseline studs** from segment length and spacing. Opening framing is separate; **no net opening stud deductions**.
- Plate quantities follow resolved plate count only — no inferred plate stacks from wall type alone beyond explicit Evidence / assumptions.

## Openings

- **Jack / trimmer count** only when explicitly stated on the plan or supplied by User Decision. Extraction must not invent jacks from opening width or practice.
- **King stud count** defaults in the deterministic engine when missing; Claude must not invent king counts.
- **No jack / cripple linear footage** where unsupported by Brain authority.
- Opening framing counts are deterministic from resolved facts — Claude emits source facts only.
- **Nominal opening dimensions** are currently required to unblock the opening-framing quantity family. Rough-only schedules without nominal sizes will review/block opening framing (including jacks) until nominal is supplied or User-Decision completed.

## Structural members

- Individually tagged members (headers, beams, posts, etc.) own their own LF / quantity.
- **No connector / hardware inference** (hangers, straps, nails, bolts).
- **No code-inferred sizes or quantities** from IRC tables or span charts.

## Floor framing

- Baseline regularly spaced joist **count** and (when eligible) **LF** only for authorized simple equal-length areas.
- **No floor truss package** takeoff.
- **No generic rim / rim-board formula**.
- **`joistLayoutLengthFeet`** and **`joistMemberLengthFeet`** must be explicit (or User Decision). Do not derive from area SF, polygons, or span tables.
- Floor baseline population is **additive** to individually tagged floor SMs (beams, special joists). The engine does **not** auto-dedupe overlapping populations.

## Roof framing

- **Common-rafter count** only for authorized simple stick-framed planes with explicit spacing-axis layout length.
- **No roof common-rafter LF** in V1.
- **No hip / valley / jack rafter population geometry**.
- **No roof truss package** takeoff or truss-to-stick decomposition.
- Roof baseline commons are **additive** to individually tagged roof SMs. No automatic duplicate-population detection.

## Sheathing

- **Coverage SF is explicit or user-resolved only.** Extraction must not multiply wall length × height (or other geometry) into SF.
- **No sheet conversion** and **no waste factors** in V1.
- Sheathing is an independent ownership domain from wall/floor/roof member populations.

## Double-count posture (V1)

The engine does **not** claim automatic detection of duplicate populations when both a baseline calculator and a tagged structural member could describe overlapping material.

Expected coexistence (not leakage of the same object into two domains):

| Baseline population | Individually tagged SM |
| --- | --- |
| Floor joist count / LF | Floor beam / girder / special joist tags |
| Roof common-rafter count | Tagged ridge / special rafter SMs |
| Opening header association path | Header SM LF |
| Sheathing SF | (independent; not a lumber count) |

Operators should treat overlapping takeoff lines as a review concern until a future dedupe contract exists.

## Extraction posture

- Prefer **missing Evidence + Review Item** over invented facts.
- User Decision → Run-2 can complete missing scalars without re-asking Claude for the value.
- Realistic plans may omit SF, jack counts, or layout lengths; that is expected, not a calculator failure.

---

*Last updated with the realistic synthetic extraction-robustness milestone.*
