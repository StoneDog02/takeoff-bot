# Architecture

This repository is a **residential framing takeoff engine**.

It accepts residential construction plan PDFs and returns a framing material takeoff.

It is not a multi-scope takeoff platform. Other trades (concrete, electrical, plumbing, HVAC, etc.) are out of product scope.

---

## Production flow

```text
UPLOAD PDF
    ↓
READ THE PLANS
    ↓
CALCULATE / DERIVE / ASSUME
    ↓
MATERIAL OUTPUT
```

| Step | Responsibility | Primary code |
|------|----------------|--------------|
| UPLOAD | Index the PDF into page text / structure | `src/pdf/indexPlan.ts` |
| READ | Classify pages, optionally compile drawings / learn project meaning, extract facts, reconcile construction objects | `src/framing/read/readFramingPlans.ts` + `resolve/` / `geometry/` / `extract/` |
| CALCULATE | Deterministic quantities and governed assumptions | `src/framing/calculate/` |
| OUTPUT | Contractor-facing material list | `src/framing/output/` → `artifacts/{projectId}/framing/framing-takeoff.json` |

Supporting subsystems: `src/compiler/` (drawing compiler), `src/project-reading/` (dictionary / learning / orientation).

Entry points: `src/app.ts` (CLI) and `src/ui/framingTakeoffService.ts` (UI).

Both call `runFramingTakeoff`. There is no separate stage pipeline for production.

---

## Locked principles

1. **Plans decide what exists.** The Material Taxonomy does not decide what exists on the house.
2. **Claude / reader systems understand the plans.** TypeScript performs deterministic derivation, calculation, and governed assumptions.
3. **Input completion order:** plan fact → deterministic derivation → governed assumption → NOT DETERMINABLE only when necessary.
4. **Relationships** exist only when they help interpret construction, calculate quantities, prevent duplication, or satisfy another concrete takeoff need.
5. **Validators** validate our reading and math — not whether the architect designed the building correctly.
6. **Developer provenance / debugging** must not become contractor-facing authority or calculation permission machinery.
7. Do **not** recreate Evidence-as-authority, claim lifecycles, centralized validation permission, confidence gates, or review-workspace architecture under new names.

---

## Layer jobs

| Layer | Job |
|-------|-----|
| Construction Brain (`knowledge/framing/`) | How residential framing works and how the engine should reason |
| PDF ingest / classification | What pages exist and what roles they play |
| Drawing compiler / project reading | Geometry, schedules, project-local meaning |
| Extraction (Claude) | Structured facts from plans |
| Evidence | Reader → resolver transport (not emit permission) |
| Resolvers | Construction understanding (walls, openings, members, floor, roof, sheathing) |
| Calculators + assumptions | Material quantities and governed defaults |
| Output | Material list for the takeoff product |
| Master Taxonomy (`docs/product/`) | What the finished product must ultimately account for / output vocabulary |
| Developer diagnostics | Artifacts, replay, traces — never calculation permission |

---

## Product completeness

Authoritative product contract:

- [`docs/product/PRODUCT_CONTRACT.md`](product/PRODUCT_CONTRACT.md)
- Master Taxonomy PDF under `docs/product/`

Known current capability limits:

- [`docs/LIMITATIONS.md`](LIMITATIONS.md)

---

## Historical docs

Prior stage-pipeline and reset migration documents live under [`docs/history/`](history/). They are not source of truth.
