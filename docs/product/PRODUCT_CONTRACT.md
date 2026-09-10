# Product contract — residential framing takeoff

This folder holds the **authoritative finished-product contract** for the residential framing takeoff engine.

## Documents

| File | Authority |
|------|-----------|
| `V1_FRAMING_INTELLIGENCE_SPEC.md` | **HOW** V1 may know, resolve, calculate, materialize, purchase, review, diagnose, and account |
| `RESIDENTIAL_FRAMING_MATERIALS_MASTER_TAXONOMY.pdf` | **WHAT** — locked Material Taxonomy + Recommended Lumber Takeoff Format (completeness / output vocabulary) |
| This file (`PRODUCT_CONTRACT.md`) | How to interpret that contract relative to the engine |

**Status:** Place the Master Taxonomy PDF in this directory as:

`docs/product/RESIDENTIAL_FRAMING_MATERIALS_MASTER_TAXONOMY.pdf`

If the PDF is missing from the repository, restore the reviewed external copy here before treating product completeness as fully contracted in-tree. Do not invent or regenerate taxonomy content.

---

## Authority split

| Source | Answers |
|--------|---------|
| **Construction plans** | What does this house contain? |
| **V1 Framing Intelligence Spec** (`V1_FRAMING_INTELLIGENCE_SPEC.md`) | **HOW** V1 may know enough to produce the takeoff |
| **Construction Brain** (`knowledge/framing/`) | How does residential framing work, and how should the engine reason about it? |
| **Master Taxonomy** (PDF in this folder) | **WHAT** the finished framing product must ultimately account for / output vocabulary. Taxonomy does not decide what exists. |
| **Recommended Lumber Takeoff Format** (in the same PDF) | What should the contractor-facing takeoff presentation look like? |

---

## Locked rules

1. **The taxonomy does not decide what exists.** The house / plans decide what exists.
2. The taxonomy is **not** an applicability engine, existence engine, material authority gate, validation gate, or permission-to-calculate system.
3. The taxonomy is the **completeness / output-vocabulary** reference for the finished product.
4. Engine code must not treat taxonomy membership as proof that a material should emit for a given project.

---

## Related docs

- HOW (V1 spec): [`V1_FRAMING_INTELLIGENCE_SPEC.md`](V1_FRAMING_INTELLIGENCE_SPEC.md)
- Architecture (current production spine): [`../ARCHITECTURE.md`](../ARCHITECTURE.md)
- Current limitations (HEAD, not V1 scope): [`../LIMITATIONS.md`](../LIMITATIONS.md)
- Construction Brain material vocabulary (not the product contract): [`../../knowledge/framing/09-material-taxonomy.md`](../../knowledge/framing/09-material-taxonomy.md)
