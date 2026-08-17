# Takeoff Bot repository guidance

## Start here

- Read `docs/ARCHITECTURE.md` before changing architecture, schemas, pipeline behavior, or artifact contracts.
- Read only the repository files relevant to the current task.
- For scope work, read the relevant files under:
  - `src/scopes/<scope>/specs/`
  - `knowledge/<scope>/`
  - `knowledge/universal/`
- Use `docs/SCOPE_CREATION_GUIDE.md` when adding a scope.
- Do not edit repository guidance documents unless the user explicitly asks.

## Source of truth

- `docs/ARCHITECTURE.md` is authoritative for system architecture and engine-wide rules.
- Construction Brain files are authoritative for construction behavior.
- Specs define subsystem implementation contracts.
- Existing code and tests define current implementation conventions.

Do not duplicate or redefine rules from these sources.

## Implementation conventions

- The project uses strict TypeScript on Node 20+ with ESM and `NodeNext`.
- Local TypeScript imports use `.js` extensions.
- Use Zod schemas at structured-data boundaries.
- Prefer deterministic, testable functions for resolution, validation, and calculation.
- Extend existing patterns before introducing new abstractions.
- Keep changes focused and atomic.

## Repository safety

- Check `git status` before making changes.
- Preserve unrelated and uncommitted user work.
- Never read, print, or commit `.env` or API keys.
- Use `.env.example` only to learn variable names.
- Treat `plans/` as user input.
- Do not modify or delete plan files unless explicitly asked.
- Treat `artifacts/` and `dist/` as generated output.
- Do not hand-edit generated output.

## Completion checks

- Add or update focused tests for behavior changes.
- Run `npm test` when relevant.
- Run `npm run build` when relevant.
- Do not invent plan facts, dimensions, quantities, or assumptions.
- Surface missing or conflicting information through the existing review and validation architecture.