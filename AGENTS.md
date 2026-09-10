# Takeoff Bot — agent guidance

## Product

This repository builds a **residential framing takeoff** engine only.

Do not add architecture for other construction scopes (concrete, electrical, plumbing, HVAC, etc.).

## Start here

1. Read [`docs/product/V1_FRAMING_INTELLIGENCE_SPEC.md`](docs/product/V1_FRAMING_INTELLIGENCE_SPEC.md) for **HOW** V1 may know, resolve, calculate, and account (product / architecture authority).
2. Read the Master Taxonomy PDF under `docs/product/` and [`docs/product/PRODUCT_CONTRACT.md`](docs/product/PRODUCT_CONTRACT.md) for **WHAT** the finished product must account for / output vocabulary. Taxonomy does not decide what exists.
3. Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the current production four-box spine (CLI/UI → `runFramingTakeoff`) and repo guidance. Where it conflicts with the V1 spec, the spec wins.
4. Read [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md) for verified current gaps (HEAD capability, not V1 scope).
5. For framing construction behavior, read relevant files under `knowledge/framing/`.
6. Read only the repository files relevant to the current task.

Do not treat [`docs/history/`](docs/history/) as authoritative.

## Source of truth

- `docs/product/V1_FRAMING_INTELLIGENCE_SPEC.md` — **HOW** (product / architecture authority). Wins where other repo docs conflict.
- Master Taxonomy PDF + `docs/product/PRODUCT_CONTRACT.md` — **WHAT** (completeness / output vocabulary). Taxonomy does not decide existence.
- `docs/ARCHITECTURE.md` — current production flow and repo guidance, not the V1 HOW ceiling
- Construction Brain (`knowledge/framing/`) — construction behavior
- `docs/LIMITATIONS.md` — verified current gaps, not V1 scope
- Existing code and tests — current implementation conventions

Do not duplicate or redefine rules from these sources.

## Implementation conventions

- Strict TypeScript on Node 20+ with ESM and `NodeNext`
- Local TypeScript imports use `.js` extensions
- Zod schemas at structured-data boundaries
- Prefer deterministic, testable functions for resolution, validation, and calculation
- Extend existing framing patterns before introducing new abstractions
- Keep changes focused and atomic

## Repository safety

- Check `git status` before making changes
- Preserve unrelated and uncommitted user work
- Never read, print, or commit `.env` or API keys
- Use `.env.example` only to learn variable names
- Treat `plans/` as user input; do not modify or delete plan files unless asked
- Treat `artifacts/` and `dist/` as generated output; do not hand-edit them

## Completion checks

- Add or update focused tests for behavior changes
- Run `npm test` when relevant
- Run `npm run build` / `npx tsc --noEmit` when relevant
- Do not invent plan facts, dimensions, quantities, or assumptions
- Surface missing information honestly; do not recreate claim/confidence/review permission architecture
