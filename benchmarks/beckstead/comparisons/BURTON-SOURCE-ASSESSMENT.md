# Burton Source Assessment — Beckstead Quotation

**Source:** `benchmarks/beckstead/source/burton-takeoff.pdf` (immutable)  
**Quote:** #1343851, dated 2025-07-21, Burton Lumber Logan UT  
**Customer:** Jeff Beckstead / Grit Const. LLC  
**Total:** ~$39,565 (quotation total incl. tax)

## Document type

Professional **purchasing quotation**, not an architectural takeoff tied to plan sheets. Burton explicitly disclaims sufficiency:

> "This take off is provided as a service to our Customers and is for Budget purposes only… No guarantee or representation is made that quantities shown are sufficient to complete this project."

## Structure (7 pages)

| Section | Approx subtotal | Framing engine scope? |
|---------|-----------------|----------------------|
| FOUNDATION | $2,035 | No — rebar, bolts, straps |
| HARDWARE | $835 | Partial — connectors, sill seal (not modeled) |
| BASEMENT WALLS | $516 | Partial — 2x4 plates/studs, 2x8 |
| **1ST FLOOR PACKAGE** | **$7,180** | Yes — BCI joists, rimboard, T&G floor |
| **1ST FLOOR WALLS** | **$4,579** | Yes — studs, plates, headers, OSB, LVL |
| GARAGE WALLS | $735 | Partial — plates, studs, OSB |
| **ROOF** | **$12,514** | Partial — stick lumber, 110 OSB, **truss quote $8,953** |
| EXTERIOR DOORS | $3,747 | No |
| INTERIOR DOORS | $2,709 | No |
| DOOR HARDWARE | $495 | No |
| FINISH MATERIAL | $1,300 | No |
| FINISH HARDWARE | $229 | No |

## Quantity conventions

- **ea** — piece count (studs, plates by stock length, sheets)
- **lf** — linear feet (BCI joists, rimboard, LVL beam)
- **RL** — roll (sill seal)
- **BD** — bundle (shims)
- **Tally notation** — e.g. `244/8` means 244 studs at 8' stock length grouping
- **Product codes** embed dimensions (`2492` = 2x4 92-5/8" stud, `1178BCI6000` = 11-7/8 BCI)

## What Burton organizes by

Purchasing **scope sections** aligned to construction phases and delivery batches:

- Basement vs 1st floor vs garage vs roof
- Floor **package** (joists + rim + T&G) separate from wall framing
- Truss package as supplier lump-sum quote

## What our engine organizes by

Physical **plan pages and compiler wall runs**:

- Mode B material lines trace to `physical-run:p3:*` and `physical-run:p4:*` only
- 26 calculable segments → 284 studs, ~986 LF plates
- No basement/garage/roof stick scope in current output

## Cannot determine from Burton alone

- Stud spacing rules applied per wall type
- Opening deduction methodology
- Corner/intersection stud logic
- Whether 2x4 vs 2x6 split maps to exterior/interior wall types on Beckstead plans
- Truss vs stick framing decision basis
- Waste factors or rounding rules

## Quantity layer classification

Burton lines are **purchasable stock / package BOM** — downstream of calculated requirement, waste, and estimator convention. Treating Burton quantities as ground-truth calculated requirements would conflate layers.

## Use in benchmark

- **Investigation trigger** — missing categories, scope gaps, methodology differences
- **Not ground truth** — do not tune engine to maximize Burton agreement
- **Scope tags required** on every comparison row before any numeric delta
