# M.4 Product Close-Out — Beckstead Mode B vs Burton Reference

Generated: 2026-08-24T18:13:02.601Z

## Executive summary

Mode B completes end-to-end to `16-report.json` with **52 material lines** (identical to Mode A): **284 studs**, **986 LF plates**. Mode B adds domain understanding (42 walls, 57 openings, 3 floor systems) but **does not unlock additional material categories** because only **26 compiler physical-run segments** on pages **3, 4** satisfy wall calculator inputs.

Burton quotation is a **procurement BOM**, not ground truth. Direct stud count comparison is **explicitly rejected** without scope equivalence.

## M.4 verdict: **CLOSE_M4**

| Condition | Met |
|-----------|-----|
| modeBCompletesToReport | yes |
| plusNineWallsUnderstood | yes |
| burtonComparisonPathDefined | yes |
| domainMaterialGapsTraced | yes |
| fiftyTwoUnchangedExplained | yes |
| amendment3RegressionsZero | yes |
| m5SelectableWithEvidence | yes |

## Contractor deliverable: **LIMITED_REAL_WORLD_VALUE**

End-to-end pipeline works and wall BOM is inspectable, but contractor cannot purchase floor/sheathing/roof/header package from this takeoff. Burton comparison confirms major categories missing or not comparable at procurement layer.

## Quantity layer model

```
PLAN / GEOMETRY → CALCULATED REQUIREMENT → WASTE / ROUNDING / CONVENTION → PURCHASABLE STOCK / PACKAGE BOM
```

Engine output is **calculated_requirement**. Burton lines are **procurement_convention**. Differences at the procurement layer are not automatic calculation errors.

## Engine material scope (284 studs)

Our **284 studs** represent **calculated_requirement** from **26 physical-run wall segments** on plan pages **3–4** only. They do **not** include basement walls, garage walls, roof stick lumber, 2x6 wall-type splits, or opening framing deductions.

Burton **1ST FLOOR WALLS** section alone lists **244× 2x4 + 234× 2x6** studs — a purchasing-section split. **NOT_DIRECTLY_COMPARABLE** to engine total without scope reconciliation. **No percentage delta computed.**

## Mode A vs Mode B

| Metric | Mode A | Mode B |
|--------|--------|--------|
| Material lines | 52 | 52 |
| Studs (ea) | 284 | 284 |
| Plates (LF) | 986 | 986 |
| Walls | 33 | 42 |
| Openings | 116 | 57 |
| Review items | 679 | 480 |

## +9 Mode B wall legitimacy

| Wall ID | Verdict | Contributes material |
|---------|---------|---------------------|
| 2x4-BEARING-WALL | SEMANTIC_ONLY | no |
| 2x4-BEARING-WALL-ON-CONC.-FOOTINGS | SEMANTIC_ONLY | no |
| CONC.-FDTN.-WALL | FALSE_POSITIVE | no |
| EXTERIOR-WALLS | SEMANTIC_ONLY | no |
| OUTLINE-OF-WALL-ABOVE | SEMANTIC_ONLY | no |
| SW1 | SEMANTIC_ONLY | no |
| SW2 | SEMANTIC_ONLY | no |
| SW3 | SEMANTIC_ONLY | no |
| SW5 | SEMANTIC_ONLY | no |

**Conclusion:** +9 wall count does not increase material coverage.

## Why 52 lines remain 52

Mode B adds 9 semantic wall objects and richer domain resolution, but only the same 26 compiler physical-run segments satisfy calculateWallFraming inputs. All non-wall calculators return empty.

## Domain → material dependency

| Domain | Blocker | Classification |
|--------|---------|----------------|
| wall_framing | none | CALCULABLE_NOW |
| openings | wall.assembly.heightFeet null on all walls | CALCULATOR_INPUT_INCOMPLETE |
| floor_framing | joistLayoutLengthFeet missing on 7/8 areas | CALCULATOR_INPUT_INCOMPLETE |
| sheathing | 0 sheathing-area subjects resolved | EVIDENCE_MISSING |
| roof_framing | framingType/memberSize null; prefab-truss labels; no layout lengths | CALCULATOR_INPUT_INCOMPLETE |
| structural_members | lengthFeet, quantity, materialType null on members | CALCULATOR_INPUT_INCOMPLETE |

## Material comparison (scope-gated)

| Category | Status | Scope | Notes |
|----------|--------|-------|-------|
| wall_studs_2x4 | NOT_DIRECTLY_COMPARABLE | partial_overlap | Engine 284 studs cover pages 3–4 physical runs (calculated 2x4 @ 16 OC). Burton … |
| wall_studs_2x6 | MISSING_ENGINE_CAPABILITY | engine_subset_missing_capability | Burton splits studs by wall type (2x6 exterior/bearing). Engine calculator emits… |
| wall_plates | UNIT_OR_AGGREGATION_MISMATCH | partial_overlap | Engine ~986 LF aggregate plates (pages 3–4 segments). Burton plate lines are 16'… |
| floor_joists_bci | CALCULATOR_INPUT_INCOMPLETE | burton_has_engine_missing | Mode B resolves 8 floor areas but only 1/8 have joistLayoutLengthFeet.… |
| floor_rimboard | CALCULATOR_INPUT_INCOMPLETE | burton_has_engine_missing | Blocked by same floor area layout authority as BCI joists.… |
| floor_sheathing_tg | CALCULATOR_INPUT_INCOMPLETE | burton_has_engine_missing | Floor calculator blocked; Burton T&G is procurement sheet count.… |
| wall_sheathing_osb | EVIDENCE_MISSING | burton_has_engine_missing | Mode B has 6 sheathing systems but 0 sheathing-area subjects.… |
| roof_sheathing_osb | CALCULATOR_INPUT_INCOMPLETE | burton_has_engine_missing | Roof framing inputs incomplete; sheathing areas absent.… |
| opening_headers_lvl | CALCULATOR_INPUT_INCOMPLETE | partial_overlap | Opening calculator blocked: 42/42 walls missing assembly.heightFeet.… |
| roof_truss_package | SCOPE_DIFFERENCE | method_difference | Burton uses prefab truss supplier quote; engine resolves prefab-truss labels wit… |
| doors_finish_foundation | SCOPE_DIFFERENCE | out_of_engine_scope | Explicitly outside framing engine scope — excluded from capability metrics.… |

## Review burden (679 → 480)

mixed — Mode B reduces review count (-199) primarily by fewer governed opening surfaces (116→57) and semantic-pending collapse; not fully trusted as burden reduction until blocking review parity confirmed

- Only in A: 410 items
- Only in B: 211 items

## Top 5 product unlock ranking (audit-selected)

| Rank | Blocker | Burton relevance | Score |
|------|---------|------------------|-------|
| 1 | area.joistLayoutLengthFeet + spanDirection on floo | high — 1ST FLOOR PACKAGE $7,180 largest  | 42.0 |
| 2 | sheathing-area subjects + application/thickness | high — 190 sheets explicit in Burton | 34.0 |
| 3 | wall.assembly.heightFeet for all walls | medium — headers/LVL present but not pri | 28.0 |
| 4 | lengthFeet, quantity, materialType on structural m | medium — few lines in Burton | 24.5 |
| 5 | stick vs truss routing + layout lengths | medium — Burton uses truss package quote | 23.5 |

## Recommended M.5 (evidence-selected, not pre-determined)

**Target:** `floor_area_layout_authority`

- Rank #1 by audit score (42.0)
- high — 1ST FLOOR PACKAGE $7,180 largest framing-dollar section
- 3 systems, 8 areas already resolved
- Unlocks multiple material categories in one milestone
- Does not require tuning stud counts to Burton

## Procurement layer note

Burton reveals stock-length piece counts, 2x4/2x6 purchasing splits, T&G sheet packages, and truss supplier quotes. A future **procurement conversion layer** will be required to translate calculated requirements to purchasable BOM. **Not in M.4 scope.**

## Anti-overfitting

Do not tune engine stud counts to match Burton 244+234. Use Burton to rank **missing categories** and **product unlock**, not as regression oracle.
