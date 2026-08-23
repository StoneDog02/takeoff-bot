import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  phase0DecisionSchema,
  type Phase0Decision,
} from "./phase0Decision.schema.js";

const DEFAULT_DECISION_PATH = path.resolve(
  "artifacts/b2.2l.1/probe/phase0-decision.json",
);

export async function loadPhase0Decision(): Promise<Phase0Decision | null> {
  const envBranch = process.env.TAKEOFF_SEMANTIC_MARK_RECOVERY_BRANCH;
  if (envBranch) {
    const parsed = phase0DecisionSchema.safeParse(envBranch);
    if (parsed.success) return parsed.data;
  }

  try {
    const raw = await readFile(DEFAULT_DECISION_PATH, "utf8");
    const json = JSON.parse(raw) as { phase0Decision?: string };
    if (json.phase0Decision) {
      const parsed = phase0DecisionSchema.safeParse(json.phase0Decision);
      if (parsed.success) return parsed.data;
    }
  } catch {
    // fall through
  }

  return null;
}

export function resolvePhase0Decision(
  loaded: Phase0Decision | null,
  fallback: Phase0Decision = "ENCLOSURE_OCR",
): Phase0Decision {
  return loaded ?? fallback;
}
