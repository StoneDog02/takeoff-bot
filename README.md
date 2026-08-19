# Takeoff Bot

Reusable AI construction takeoff engine — a repeatable scope pipeline framework.

## Philosophy

- **Claude/Anthropic** extracts structured information from plans
- **TypeScript** performs deterministic calculations
- Every scope follows the same pipeline pattern
- Every stage saves artifacts for debuggability
- No single Claude call generates a full takeoff

## Requirements

- Node.js 20 or later
- Java 11 or later on `PATH` (required by `@opendataloader/pdf` for PDF text-layer indexing)

```bash
node -v
java -version
```

## Quick Start

```bash
npm install
cp .env.example .env   # optional — pipeline mocks AI without API key
npm run dev -- --pdf ./plans/sample.pdf --scope framing
```

Live Claude proof (requires `ANTHROPIC_API_KEY`; never falls back to mock Evidence):

```bash
npm run proof:live-framing
```

Artifacts are written to `artifacts/{projectId}/framing/`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Run CLI via tsx |
| `npm run build` | Compile TypeScript |
| `npm run start` | Run compiled output |
| `npm run test` | Run tests |
| `npm run proof:live-framing` | Run the controlled PDF through live Claude extraction |
| `npm run test:live-framing` | Same live proof as an opt-in integration test |

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

Stage 1 indexes real PDF text layers. Downstream drawing understanding is a separate milestone.
