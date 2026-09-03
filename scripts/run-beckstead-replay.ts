/**
 * Beckstead framing milestone via frozen Evidence replay (no live Claude).
 *
 * Use when live Anthropic extraction is unavailable; proves:
 * PDF index → interpret → calculate → framing-takeoff.json
 *
 * Usage:
 *   npx tsx scripts/run-beckstead-replay.ts \
 *     [--evidence artifacts/b2.3-wave5/runs/beckstead-wave5-after/framing/06-extractedEvidence.json] \
 *     [--project beckstead-replay]
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { indexPlan } from "../src/pdf/indexPlan.js";
import { extractedFramingEvidencePayloadSchema } from "../src/framing/schemas/framing-artifacts.schema.js";
import { runFramingTakeoff } from "../src/framing/output/runFramingTakeoff.js";
import { FRAMING_TAKEOFF_FILENAME } from "../src/framing/output/writeFramingTakeoff.js";

const DEFAULT_EVIDENCE =
  "artifacts/b2.3-wave5/runs/beckstead-wave5-after/framing/06-extractedEvidence.json";
const DEFAULT_PDF = "tests/fixtures/beckstead-residence-plans.pdf";

function argValue(argv: string[], flag: string, fallback: string): string {
  const index = argv.indexOf(flag);
  if (index >= 0 && argv[index + 1]) {
    return argv[index + 1]!;
  }
  return fallback;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const evidencePath = path.resolve(argValue(argv, "--evidence", DEFAULT_EVIDENCE));
  const pdfPath = path.resolve(argValue(argv, "--pdf", DEFAULT_PDF));
  const projectId = argValue(argv, "--project", "beckstead-replay");

  const envelope = JSON.parse(await readFile(evidencePath, "utf8"));
  const payload = extractedFramingEvidencePayloadSchema.parse(
    envelope.payload ?? envelope,
  );

  const planIndex = await indexPlan(pdfPath);
  const result = await runFramingTakeoff({
    projectId,
    pdfPath,
    planIndex,
    useMockAi: true,
    evidenceReplay: payload.evidence,
    writeDebugArtifacts: true,
  });

  if (!result.success || !result.takeoffPath || !result.takeoff) {
    console.error("Beckstead framing replay failed:");
    for (const error of result.errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }

  const baselineDir = path.resolve("artifacts", projectId, "framing");
  await mkdir(baselineDir, { recursive: true });
  const byDomain: Record<string, number> = {};
  for (const line of result.takeoff.materials) {
    const domain = line.domain ?? "unknown";
    byDomain[domain] = (byDomain[domain] ?? 0) + 1;
  }

  const baseline = {
    capturedAt: new Date().toISOString(),
    mode: "evidence-replay",
    evidenceSource: evidencePath,
    pdfPath,
    projectId,
    takeoffPath: result.takeoffPath,
    materialCount: result.takeoff.materials.length,
    assumptionCount: result.takeoff.assumptions?.length ?? 0,
    byDomain,
    meta: result.takeoff.meta,
    notes: [
      "Live Claude extraction may be run separately when network allows.",
      "This replay proves interpret→calculate→framing-takeoff without Stage 13/15/16.",
      "Zeros by domain are capability/input gaps, not permission-gate failures.",
    ],
  };

  const baselinePath = path.join(baselineDir, "debug-beckstead-baseline.json");
  await writeFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");

  console.log(`✓ Beckstead framing replay complete`);
  console.log(`  Takeoff:  ${result.takeoffPath}`);
  console.log(`  Baseline: ${baselinePath}`);
  console.log(`  Materials:${result.takeoff.materials.length}`);
  console.log(`  By domain:${JSON.stringify(byDomain)}`);
  console.log(`  File:     ${FRAMING_TAKEOFF_FILENAME}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
