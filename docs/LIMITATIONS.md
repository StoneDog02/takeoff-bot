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
- Production `buildFramingConstructionFromEvidence` calls `linkOpeningHeaderRelationships` when Evidence includes `headerMemberTag`. Live region reads may still omit those tags; `headerMemberId` then stays null and cased-opening cripple eligibility that requires it does not fire.
- W4-C compiled PBG gaps exist, but frozen pages have no opening-mark text. Identified openings stay unparented; geometry does not invent quantity or attach from ambiguous gaps. Semantic-binding / opening-geometry bridges stay opt-in.

## Structural members

- Individually tagged members own their own LF / quantity.
- No connector / hardware / fastener inference.
- No code-inferred sizes from IRC or span tables.

## Floor framing

- Baseline regularly spaced joist **count** and (when eligible) **LF** for authorized simple equal-length areas.
- Beckstead crawl regression: **31 joists / 527 LF** when layout authority resolves (`ceil(40×12/16)+1` and `31×17`).
- Live crawl `joistLayoutLengthFeet` is Evidence from the region read (notes + geometry observations). `associatedRunKey` locates a dim; it is not exclusive wall ownership. TypeScript does not copy unique compiler dims onto layout. Competing layout lengths stay unresolved.
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

Empty-text / OCR-heavy residential PDFs (e.g. Beckstead) auto-run the Drawing Compiler and Project Learning unless `TAKEOFF_COMPILER=0` / `TAKEOFF_PROJECT_LEARNING=0`. Force-on remains `=1`. Semantic-binding and opening-geometry bridges stay opt-in. See `.env.example`.

READ writes `reader-claude-call-ledger.json` (illustrative token/cost estimates, not an invoice), `reader-read-complete.json` (calculator-required inputs for plan-identified conditions only), and `reader-project-dictionary.json` when a governed Plan Dictionary exists.

## Output

- Production material output: `artifacts/{projectId}/framing/framing-takeoff.json` (`schemaVersion: 2`)
- Recommended Format fields on each line: `material`, `lengthOrType` (nullable), `quantity`, `unit`
- Structural members remain **LF** (Construction Brain); size/length are preserved in presentation fields only — not converted to orderable pcs
- Product accounting sibling: `artifacts/{projectId}/framing/framing-product-accounting.json` (house-first taxonomy completeness; statuses `calculated` | `unaccounted` only)
- UI: contractor table is Recommended Format; developer diagnostics require `TAKEOFF_UI_ACCESS=developer` (customer API omits accounting/debug fields)
