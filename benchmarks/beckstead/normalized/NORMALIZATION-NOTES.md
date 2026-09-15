# Burton Normalization Notes

**Source (immutable):** `benchmarks/beckstead/source/burton-takeoff.pdf`  
**Derived fixture:** `burton-takeoff.normalized.json`  
**Identity:** `beckstead-burton-benchmark-v1` / `v1-freeze-candidate`  
**Status:** freeze candidate — **not** the reviewed/frozen v1 consumed by B-CMP-1

This artifact is for Stoney + ChatGPT review. Completing B-FIX-1 does not freeze the benchmark.

## What this pass did

Inspected the complete 7-page Burton quotation (quote #1343851, 2025-07-21). Normalized **all 90 product quotation lines**. Section headers, section subtotals, terms, and the signature page are not product lines and are not rows.

Out-of-framing-scope lines (doors, finish, rebar, ground wire) are **classified and kept** for audit completeness. They are not dropped.

Every row has `comparisonEligible: false`. `engineJoin` is a suggested downstream mapping only. This pass does **not** judge numeric comparability.

`frozenAt` remains `null` until review freeze.

## Envelope fields

| Field | Value |
|-------|--------|
| `benchmarkId` | `beckstead-burton-benchmark-v1` |
| `benchmarkVersion` | `v1-freeze-candidate` |
| `status` | `freeze-candidate` |
| `frozenAt` | `null` |
| `sourceFile` | `benchmarks/beckstead/source/burton-takeoff.pdf` |

## Changelog vs the prior 23-line file

The previous derived file was a **representative subset** (23 lines), all tagged `quantityLayer: procurement_convention`, with no `comparisonEligible` / `engineJoin` / `benchmarkItemId`.

This candidate:

- Expands 23 → **90** product lines (complete quotation SKUs).
- Replaces `procurement_convention` with `procurement_stock_ea` \| `procurement_lf` \| `package_lump` \| `out_of_framing_scope`.
- Adds `comparisonEligible: false` on every row.
- Adds suggested `engineJoin` where a HEAD `quantityKey` exists as a **hypothesis**, never as eligibility.
- Corrects rimboard line 36: prior file stored **571 lf** (the dollar total). Quote Qty/Footage is **8 ea**, tally `8/24`, priced per lf (`pricingUnit: lf`, extended 571.20).
- Corrects rimboard family: prior `wall_roof_sheathing` → `rim_board`.
- Adds previously omitted framing-relevant rows, including basement 2x4-16' / 2x8s, garage 2x4-16', roof stick lumber, roof hardware, sill seal, connectors, and PT plates in every purchasing section they appear.
- Keeps doors/finish/rebar as `inFramingEngineScope: false` instead of omitting them.

## Completeness (Burton source)

Product lines present: **90**. PDF line numbers:

2–9 FOUNDATION; 12–24 HARDWARE; 27–31 BASEMENT WALLS; 34–37 1ST FLOOR PACKAGE; 41–49 1ST FLOOR WALLS; 53–56 GARAGE WALLS; 59–70 ROOF; 73–77 EXTERIOR DOORS; 80–86 INTERIOR DOORS; 89–95 DOOR HARDWARE; 98–107 FINISH MATERIAL; 110–115 FINISH HARDWARE.

Not rows: section titles, section dollar totals, tally-only continuation lines (38, 50), terms, page 7 signature.

## Family / spec classification

| Pattern | `normalizedFamily` | Notes |
|---------|--------------------|--------|
| Description contains `Plate` | `plate` | PT plates stay split by section and size |
| Description contains `Stud` | `stud` | 2x4 and 2x6 stay split |
| `BCI` | `floor_joist` | spec `BCI-6000-11-7/8` |
| Rimboard / `11PLUS` | `rim_board` | not sheathing |
| T&G flooring | `floor_sheathing` | sheets |
| Wall-section 7/16 OSB | `wall_sheathing` | sheets; garage vs 1st floor stay separate |
| Roof 5/8 OSB | `roof_sheathing` | sheets |
| LVL / `BEAM` | `beam` | |
| `6X6` post | `post` | |
| 2x10/2x8 in a **walls** section | `header_stock` | conventional purchasing guess; role not printed |
| Dimensional lumber with **no** role | `lumber_stock` | includes basement 96", garage 10', roof stick |
| Truss quote | `truss_package` | lump |
| Sill seal | `sill_seal` | |
| Bolts / straps / anchors / clips / adhesive | hardware families | |
| Rebar / ground wire / doors / finish | out-of-scope families | |

2x4 vs 2x6 are never lumped. Length splits (10' vs 12' 2x10, etc.) stay separate rows.

## Quantity-layer classification

| Layer | Meaning | Examples |
|-------|---------|----------|
| `procurement_stock_ea` | Purchasable pieces, boxes, rolls | studs, plates, sheets, most hardware (`RL`/`BD` kept as printed units) |
| `procurement_lf` | Purchasable linear feet | BCI 1388 lf; LVL 48 lf |
| `package_lump` | Supplier package / allowance sold as 1 | truss quote |
| `out_of_framing_scope` | Not residential framing material | rebar, doors, millwork, bath accessories |

`comparisonUnit` copies the printed qty unit. This pass does **not** convert stock ea → LF, sheets → SF, or boxes → inner counts.

Special provenance:

- Line 36 rimboard: original qty **8 ea**; tally `8/24`; `pricingUnit` lf.
- Line 12 / 15 / 59: qty is **boxes**, not inner piece count.
- Line 16 sill seal unit is `RL`; line 17 is `ea` — preserved as printed.

## Scope classification

Burton organizes by **purchasing / delivery section**. HEAD organizes by **construction objects** (often floor-plan physical runs), not “1ST FLOOR WALLS” labels.

That mismatch is why **1ST FLOOR WALLS stays ineligible** on this candidate:

- Engine `wall.studs` / `wall.plates` are not attributed to Burton’s 1ST FLOOR WALLS batch.
- Live/compiler walls are typically page-3/4 runs, not basement/garage/roof purchasing scopes.
- Same-family (`stud` ↔ `wall.studs`) is **not** scope proof and is **not** a numeric-comparability flag.

Garage, basement, and roof sections are likewise unattributed to HEAD objects unless a later review writes that proof.

## Suggested `engineJoin` mappings

`engineJoin` is optional and **suggested only**. It never sets eligibility.

| Family | Suggested keys | Caveat |
|--------|----------------|--------|
| `stud` | `wall.studs` (each) | Section ≠ house census; kings/jacks/cripples may differ; keep 2x4/2x6 split |
| `plate` | `wall.plates` and/or `foundation.sill-linear-feet` (LF) | Stock ea ≠ plate LF; PT plate in a package is not automatically FI-1 sill |
| `lumber_stock` in walls | `wall.plates` or dual stud/plate | Role unproven |
| `header_stock` | `member.material` (LF) | Guess from size + walls section |
| `floor_joist` | `floor.joists`, `floor.joist-linear-feet` | Burton LF + tally ≠ W4-C 31/527 |
| `floor_sheathing` / wall / roof OSB | `sheathing.area` (SF) | Sheets vs SF; S5 does not exist |
| `beam` / `post` | `member.material` (LF) | Needs a tagged member |
| `rim_board` | **null** | Taxonomy `no_emitter` |
| `truss_package` | **null** | Lump ≠ `roof.common-rafters` |
| Roof stick lumber | `roof.common-rafters` (weak) or **null** | Quote already has a truss package |
| Connectors / hardware | `connector.material` / `hardware.material` / `fastener.material` | No HEAD calculator |

## Rows that might later become `comparisonEligible`

**None in this implementation.** Review may later consider (still requiring scope + unit + layer proof):

1. **L045 / L046 studs** — only family with pcs-vs-pcs `wall.studs`, still blocked by section-scope vs HEAD attribution and 2x4/2x6 split.
2. **L037 BCI** — family overlap with floor joist LF, still procurement LF vs calculated layout, and W4-C is not a Burton target.
3. **L049 LVL** — only if a tagged 1-3/4×11-7/8 member exists; still purchasing LF.

Plate ea, OSB sheets, rimboard, truss lump, headers-as-stock, and hardware should remain ineligible unless a later slice (often S5-shaped) exists **and** scope is proven. This pass does not mark any of them eligible.

## Assumptions (per line, summarized)

1. Burton row quantity is purchasing count, not a plan-traceable calculated requirement.
2. Section header is a purchasing boundary, not a plan page.
3. Tally strings (`244/8`, `8/24`, BCI length groups) are stock-length grouping, not engine layout.
4. Truss quote is a supplier lump-sum.
5. `header_stock` / some `lumber_stock` roles are classification hypotheses, not construction facts.

## Review checklist (not done by B-FIX-1)

1. Completeness against the Burton source
2. Normalized family/spec classifications
3. Quantity-layer classifications
4. Scope classifications
5. Suggested `engineJoin` mappings
6. Which specific rows, if any, can legitimately become `comparisonEligible`

Only after that review is the artifact treated as frozen v1 for B-CMP-1.
