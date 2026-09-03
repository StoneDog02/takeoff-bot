# Takeoff Bot

Residential framing takeoff engine: upload a construction plan PDF, read the plans, calculate framing materials, and emit a takeoff.

## Product

- **In scope:** residential framing material takeoffs
- **Out of scope:** concrete, electrical, plumbing, HVAC, and other trade takeoffs

Authoritative architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)  
Product contract (taxonomy / recommended format): [`docs/product/`](docs/product/)  
Known limitations: [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md)

## How a PDF becomes materials

```text
PDF → indexPlan → readFramingPlans → calculateFramingTakeoff → framing takeoff JSON
```

1. **Upload** — index the PDF (`src/pdf/indexPlan.ts`)
2. **Read** — classify pages, optionally compile drawings / project dictionary, extract facts, reconcile walls/openings/members/floor/roof/sheathing
3. **Calculate** — deterministic domain calculators and governed assumptions
4. **Output** — material list under `artifacts/{projectId}/framing/`

Plans decide what exists. The Material Taxonomy defines finished-product completeness vocabulary — it does not decide what exists on the house.

## Requirements

- Node.js 20 or later
- Java 11 or later on `PATH` (required by `@opendataloader/pdf` for PDF text-layer indexing)

```bash
node -v
java -version
```

## Quick start

```bash
npm install
cp .env.example .env   # optional — mocks AI without API key
npm run dev -- --pdf ./plans/sample.pdf
```

Live Claude (requires `ANTHROPIC_API_KEY`; never falls back to mock Evidence):

```bash
npm run proof:live-framing
```

For OCR-heavy residential PDFs (e.g. Beckstead), enable compiler / learning flags as documented in `.env.example`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Run CLI via tsx |
| `npm run build` | Compile TypeScript |
| `npm run start` | Run compiled output (`npm run build` first) |
| `npm run test` | Run tests |
| `npm run ui:dev` | Local takeoff UI server |
| `npm run proof:live-framing` | Controlled PDF through live Claude extraction |

## Project structure

```text
docs/                Architecture, product contract, limitations
docs/history/        Non-authoritative historical notes
docs/product/        Master Taxonomy product contract
knowledge/           Construction Brain (framing)
src/app.ts           CLI entry
src/pdf/             PDF indexing / classification
src/compiler/        Drawing compiler
src/project-reading/ Project dictionary / learning / orientation
src/framing/         Read / resolve / calculate / output
tests/               Tests and fixtures
benchmarks/          Beckstead benchmark / parity assets
artifacts/           Generated outputs (gitignored)
plans/               Input PDFs (gitignored)
```

## Agent / contributor rules

See [`AGENTS.md`](AGENTS.md).
