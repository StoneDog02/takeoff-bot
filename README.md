# Takeoff Bot

Reusable AI construction takeoff engine — a repeatable scope pipeline framework.

## Philosophy

- **Claude/Anthropic** extracts structured information from plans
- **TypeScript** performs deterministic calculations
- Every scope follows the same pipeline pattern
- Every stage saves artifacts for debuggability
- No single Claude call generates a full takeoff

## Quick Start

```bash
npm install
cp .env.example .env   # optional — pipeline mocks AI without API key
npm run dev -- --pdf ./plans/sample.pdf --scope framing
```

Artifacts are written to `artifacts/{projectId}/framing/`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Run CLI via tsx |
| `npm run build` | Compile TypeScript |
| `npm run start` | Run compiled output |
| `npm run test` | Run tests |

## Project Structure

```
docs/          Architecture and guides (manual population)
specs/         Per-scope extraction/calculation specs
knowledge/     Domain knowledge loaded per-stage
src/           TypeScript source
artifacts/     Pipeline stage outputs (gitignored)
plans/         Input PDFs
tests/         Test files
```

## Adding Scopes

See `docs/SCOPE_CREATION_GUIDE.md`. Register new scopes in `src/scopes/registry.ts`.

## Current Status

Skeleton framework only — mocked pipeline, placeholder docs, no real construction logic.
