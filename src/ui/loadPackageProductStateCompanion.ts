import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { PipelineRunResult } from "../core/pipeline/types.js";
import type { FramingPackageProductState } from "../scopes/framing/observability/framingPackageProductState.schema.js";
import { framingPackageProductStateArtifactSchema } from "../scopes/framing/schemas/framing-artifacts.schema.js";

function stageByName(result: PipelineRunResult, name: string) {
  const stage = result.stageResults.find((entry) => entry.name === name);
  if (!stage) {
    throw new Error(`Expected pipeline stage '${name}'.`);
  }
  return stage;
}

/**
 * Loads the optional stage-16 package-product-state companion artifact when present.
 * Does not recompute product state — reads the factory companion only.
 */
export async function loadPackageProductStateCompanion(
  result: PipelineRunResult,
): Promise<FramingPackageProductState | null> {
  const reportStage = stageByName(result, "report");
  const runDir = path.dirname(reportStage.artifactPath);
  const entries = await readdir(runDir);
  const companionName = entries.find(
    (name) =>
      name.startsWith("16-") && name.endsWith(".package-product-state.json"),
  );
  if (!companionName) {
    return null;
  }

  const raw = JSON.parse(
    await readFile(path.join(runDir, companionName), "utf8"),
  );
  return framingPackageProductStateArtifactSchema.parse(raw).payload;
}
