# Takeoff Bot — agent guidance

## Product

This repository builds a **residential framing takeoff** engine only.

Do not add architecture for other construction scopes (concrete, electrical, plumbing, HVAC, etc.).

## Start here

1. Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the production four-box flow.
2. Read [`docs/product/PRODUCT_CONTRACT.md`](docs/product/PRODUCT_CONTRACT.md) for taxonomy / output authority (when present).
3. Read [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md) for verified current gaps (when present).
4. For framing behavior, read relevant files under `knowledge/framing/`.
5. Read only the repository files relevant to the current task.

Do not treat [`docs/history/`](docs/history/) as authoritative.

## Source of truth

- `docs/ARCHITECTURE.md` — system architecture and engine-wide rules
- Construction Brain (`knowledge/framing/`) — construction behavior
- `docs/product/` — finished-product completeness / contractor output contract
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
