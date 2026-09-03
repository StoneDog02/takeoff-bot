/**
 * Capture a short baseline summary from a framing-takeoff.json after Beckstead.
 * Usage:
 *   npx tsx scripts/summarize-framing-takeoff.ts artifacts/<project>/framing/framing-takeoff.json
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { framingTakeoffSchema } from "../src/framing/schemas/framingTakeoff.schema.js";

async function main(): Promise<void> {
  const takeoffPath = process.argv[2];
  if (!takeoffPath) {
    console.error("Usage: npx tsx scripts/summarize-framing-takeoff.ts <framing-takeoff.json>");
    process.exit(1);
  }

  const raw = JSON.parse(await readFile(path.resolve(takeoffPath), "utf8"));
  const takeoff = framingTakeoffSchema.parse(raw);

  const byDomain = new Map<string, number>();
  for (const line of takeoff.materials) {
    const domain = line.domain ?? "unknown";
    byDomain.set(domain, (byDomain.get(domain) ?? 0) + 1);
  }

  const domains = [
    "wall",
    "opening",
    "structural",
    "floor",
    "roof",
    "sheathing",
    "fastener",
  ] as const;

  console.log(`Project:   ${takeoff.projectId}`);
  console.log(`PDF:       ${takeoff.pdfPath}`);
  console.log(`Created:   ${takeoff.createdAt}`);
  console.log(`Materials: ${takeoff.materials.length}`);
  console.log(`Assumptions disclosed: ${takeoff.assumptions?.length ?? 0}`);
  console.log("By domain:");
  for (const domain of domains) {
    const count = byDomain.get(domain) ?? 0;
    const reason =
      count === 0
        ? " (zero — capability gap or missing inputs; not Stage 13/claims)"
        : "";
    console.log(`  ${domain}: ${count}${reason}`);
  }
  if (takeoff.meta) {
    console.log("Construction bag counts (not completeness):");
    console.log(`  walls=${takeoff.meta.wallCount ?? 0} openings=${takeoff.meta.openingCount ?? 0}`);
    console.log(
      `  members=${takeoff.meta.structuralMemberCount ?? 0} floorAreas=${takeoff.meta.floorAreaCount ?? 0}`,
    );
    console.log(
      `  roofPlanes=${takeoff.meta.roofPlaneCount ?? 0} sheathingAreas=${takeoff.meta.sheathingAreaCount ?? 0}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
