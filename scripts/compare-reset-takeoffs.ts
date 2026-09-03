/**
 * Compare two reset-takeoff.json artifacts (e.g. live vs beckstead-reset-m1).
 *
 * Usage:
 *   npx tsx scripts/compare-reset-takeoffs.ts \
 *     artifacts/beckstead-reset-m1/framing/reset-takeoff.json \
 *     artifacts/<live-project>/framing/reset-takeoff.json
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

import {
  resetTakeoffSchema,
  type ResetMaterialLine,
  type ResetTakeoff,
} from "../src/scopes/framing/reset/resetTakeoff.schema.js";

function loadTakeoff(raw: unknown): ResetTakeoff {
  return resetTakeoffSchema.parse(raw);
}

function byDomain(materials: readonly ResetMaterialLine[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const line of materials) {
    const domain = line.domain ?? "unknown";
    counts[domain] = (counts[domain] ?? 0) + 1;
  }
  return counts;
}

function lineKey(line: ResetMaterialLine): string {
  return [
    line.domain ?? "",
    line.quantityKey ?? "",
    line.description,
    String(line.quantity),
    line.unit,
  ].join("|");
}

function summarize(label: string, takeoff: ResetTakeoff) {
  return {
    label,
    projectId: takeoff.projectId,
    materialCount: takeoff.materials.length,
    assumptionCount: takeoff.assumptions?.length ?? 0,
    byDomain: byDomain(takeoff.materials),
    meta: takeoff.meta ?? null,
  };
}

async function main(): Promise<void> {
  const leftPath = process.argv[2];
  const rightPath = process.argv[3];
  if (!leftPath || !rightPath) {
    console.error(
      "Usage: npx tsx scripts/compare-reset-takeoffs.ts <left.json> <right.json>",
    );
    process.exit(1);
  }

  const left = loadTakeoff(JSON.parse(await readFile(path.resolve(leftPath), "utf8")));
  const right = loadTakeoff(
    JSON.parse(await readFile(path.resolve(rightPath), "utf8")),
  );

  const leftKeys = new Set(left.materials.map(lineKey));
  const rightKeys = new Set(right.materials.map(lineKey));
  const onlyLeft = left.materials.filter((m) => !rightKeys.has(lineKey(m)));
  const onlyRight = right.materials.filter((m) => !leftKeys.has(lineKey(m)));

  const domains = [
    "wall",
    "opening",
    "structural",
    "floor",
    "roof",
    "sheathing",
    "fastener",
  ] as const;
  const leftDom = byDomain(left.materials);
  const rightDom = byDomain(right.materials);

  console.log("=== Reset takeoff comparison ===");
  console.log(`LEFT:  ${leftPath}`);
  console.log(`RIGHT: ${rightPath}`);
  console.log("");
  console.log(
    `Materials: left=${left.materials.length} right=${right.materials.length} delta=${right.materials.length - left.materials.length}`,
  );
  console.log(
    `Assumptions: left=${left.assumptions?.length ?? 0} right=${right.assumptions?.length ?? 0}`,
  );
  console.log("");
  console.log("By domain (left → right):");
  for (const domain of domains) {
    const l = leftDom[domain] ?? 0;
    const r = rightDom[domain] ?? 0;
    const mark = l === r ? "" : " *";
    console.log(`  ${domain}: ${l} → ${r}${mark}`);
  }
  console.log("");
  console.log("Construction bag meta (left → right):");
  const metaKeys = [
    "wallCount",
    "openingCount",
    "structuralMemberCount",
    "floorSystemCount",
    "floorAreaCount",
    "roofSystemCount",
    "roofPlaneCount",
    "sheathingSystemCount",
    "sheathingAreaCount",
  ] as const;
  for (const key of metaKeys) {
    const l = left.meta?.[key] ?? 0;
    const r = right.meta?.[key] ?? 0;
    const mark = l === r ? "" : " *";
    console.log(`  ${key}: ${l} → ${r}${mark}`);
  }
  console.log("");
  console.log(`Lines only in LEFT:  ${onlyLeft.length}`);
  for (const line of onlyLeft.slice(0, 15)) {
    console.log(
      `  - [${line.domain ?? "?"}] ${line.description} qty=${line.quantity} ${line.unit}`,
    );
  }
  if (onlyLeft.length > 15) console.log(`  … +${onlyLeft.length - 15} more`);
  console.log(`Lines only in RIGHT: ${onlyRight.length}`);
  for (const line of onlyRight.slice(0, 15)) {
    console.log(
      `  - [${line.domain ?? "?"}] ${line.description} qty=${line.quantity} ${line.unit}`,
    );
  }
  if (onlyRight.length > 15) console.log(`  … +${onlyRight.length - 15} more`);

  const report = {
    left: summarize("left", left),
    right: summarize("right", right),
    onlyLeftCount: onlyLeft.length,
    onlyRightCount: onlyRight.length,
    onlyLeft: onlyLeft.slice(0, 50),
    onlyRight: onlyRight.slice(0, 50),
    leftPath,
    rightPath,
    comparedAt: new Date().toISOString(),
  };

  const outDir = path.resolve(
    "artifacts",
    right.projectId || "compare",
    "framing",
  );
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "compare-vs-m1.json");
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log("");
  console.log(`Wrote ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
