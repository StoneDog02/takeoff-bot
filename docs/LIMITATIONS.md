# Framing takeoff — current limitations

Verified statement of what the engine **currently does and does not** do.

This is not a backlog. Update only when behavior is verified in code/tests.

Authority for construction rules remains Construction Brain under `knowledge/framing/`. Product completeness vocabulary remains [`docs/product/`](product/).

---

## Walls

- Baseline studs from segment length and spacing; opening framing is separate.
- **Net opening stud deductions** are applied when opening framing quantities are known (`netStudDeduction`).
- No corner / intersection extras unless explicitly supported later.
- Plate quantities follow resolved plate count.

## Openings

- King stud count, rough sill size, and cripple layout may use **governed assumptions** when plan facts are missing.
- Jack / trimmer counts require plan-stated (or explicitly supplied) facts — not invented from width alone.
- **Known gap — header → cased-cripple:** extraction can emit `headerMemberTag`, but production `resolveOpenings` currently leaves `headerMemberId` null. `linkOpeningHeaderRelationships` preserves mapping intelligence and is **not wired** into `readFramingPlans`. Cased-opening cripple eligibility that requires `headerMemberId` therefore does not fire on the production path.

## Structural members

- Individually tagged members own their own LF / quantity.
- No connector / hardware / fastener inference.
- No code-inferred sizes from IRC or span tables.

## Floor framing

- Baseline regularly spaced joist **count** and (when eligible) **LF** for authorized simple equal-length areas.
- Beckstead crawl regression: **31 joists / 527 LF** when layout authority resolves (`ceil(40×12/16)+1` and `31×17`).
- No floor truss package takeoff; no generic rim formula; do not derive layout/member length from area SF.

## Roof framing

- Common-rafter **count** only for authorized simple stick-framed planes with explicit spacing-axis layout length.
- No common-rafter LF, hip/valley/jack geometry, or roof truss package takeoff in the current path.

## Sheathing

- Coverage SF only when resolved; no sheet conversion / waste factors in the current path.
- Independent ownership domain from wall/floor/roof member populations.

## Double-count posture

The engine does not claim automatic detection of every duplicate population when both a baseline calculator and a tagged structural member could describe overlapping material.

## Operator / reader composition

OCR-heavy residential PDFs (e.g. Beckstead) typically need env flags such as `TAKEOFF_COMPILER=1`, `TAKEOFF_COMPILER_OCR=1`, and `TAKEOFF_PROJECT_LEARNING=1`. See `.env.example`.

## Output

- Production material output: `artifacts/{projectId}/framing/framing-takeoff.json`
- Master Taxonomy runtime mapping / Recommended Format UI are **not** implemented yet (product phase after this repository cleanup).
