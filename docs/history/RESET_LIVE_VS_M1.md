# Live Beckstead reset vs beckstead-reset-m1

**Live project:** `beckstead-reset-live-20260902-181129`  
**Replay baseline:** `beckstead-reset-m1` (wave5 Evidence replay)  
**Compared:** 2026-09-02

## Headline

Fresh live reset takeoff completed successfully (~30 min) and produced **54** material lines vs m1’s **53**.

The important live-only win: **crawl floor joists 31 each + 527 LF** (D21 verified derivation) reached calculators without Stage 13/15/16.

## Domain counts

| Domain | m1 (replay) | live | Delta |
|--------|-------------|------|-------|
| wall | 52 | 52 | 0 |
| floor | 0 | **2** | +2 |
| structural | 1 | 0 | −1 |
| opening | 0 | 0 | 0 |
| roof | 0 | 0 | 0 |
| sheathing | 0 | 0 | 0 |
| **total** | **53** | **54** | +1 |

## Material diffs

**Only in live**
- `11 7/8" TJI 210 floor joists` — **31 each**
- `11 7/8" TJI 210 floor joists` — **527 linear-foot**

**Only in m1 (replay)**
- `(2)-1.75"x11.875" LVL header` — **23.5 linear-foot**

Wall lines: same count (52); line-level identity not guaranteed identical across live vs frozen Evidence.

## Construction bag (not completeness)

| Meta | m1 | live |
|------|----|------|
| walls | 55 | 58 |
| openings | 82 | 117 |
| structural members | 40 | 51 |
| floor systems / areas | 6 / 11 | 5 / 13 |
| roof systems / planes | 10 / 3 | 2 / 0 |
| sheathing systems / areas | 11 / 1 | 10 / 0 |

Live reader established **more** openings/members/floor areas than the wave5 snapshot, but opening/roof/sheathing still emit **zero materials** — calculator input / capability gaps, not Stage 13 gates.

## Artifacts

- Live takeoff: `artifacts/beckstead-reset-live-20260902-181129/framing/reset-takeoff.json`
- Live debug: classification, learning, compiled pages, evidence, construction
- Comparison JSON: `artifacts/beckstead-reset-live-20260902-181129/framing/compare-vs-m1.json`
- Live log: `artifacts/beckstead-reset-live-20260902-181129.log`

## How to re-run comparison

```bash
npx tsx scripts/compare-reset-takeoffs.ts \
  artifacts/beckstead-reset-m1/framing/reset-takeoff.json \
  artifacts/beckstead-reset-live-20260902-181129/framing/reset-takeoff.json
```
