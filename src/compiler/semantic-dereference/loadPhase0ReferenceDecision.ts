import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  Phase0ProofTarget,
  ReferenceMechanism,
} from "./referenceMechanism.schema.js";

const DEFAULT_DECISION_PATH = path.resolve(
  "artifacts/b2.2l.3/metrics/phase0-reference-mechanism-decision.json",
);
const DEFAULT_TARGET_PATH = path.resolve(
  "artifacts/b2.2l.3/metrics/phase0-proof-target.json",
);

export type Phase0ReferenceDecision = {
  referenceMechanism: ReferenceMechanism;
  rationale: string[];
  generatedAt: string;
};

export async function loadPhase0ReferenceDecision(
  filePath = DEFAULT_DECISION_PATH,
): Promise<Phase0ReferenceDecision | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as Phase0ReferenceDecision;
  } catch {
    return null;
  }
}

export async function loadPhase0ProofTarget(
  filePath = DEFAULT_TARGET_PATH,
): Promise<Phase0ProofTarget | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as Phase0ProofTarget;
  } catch {
    return null;
  }
}

export function resolveReferenceMechanismFromEnv(): ReferenceMechanism | null {
  const v = process.env.TAKEOFF_REFERENCE_MECHANISM?.trim().toUpperCase();
  if (!v) return null;
  const allowed = [
    "TAG",
    "TAG_LEADER",
    "KEYED_NOTE",
    "GRAPHIC_CONVENTION",
    "MIXED",
    "NOT_ESTABLISHED",
  ];
  return allowed.includes(v) ? (v as ReferenceMechanism) : null;
}
