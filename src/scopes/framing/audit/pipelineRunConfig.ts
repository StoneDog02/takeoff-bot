import type { AuditRunMode } from "./auditMetrics.schema.js";
import type { EvidenceStageVariant } from "./evidenceStageTypes.js";

export type EnvSnapshot = Record<string, string>;

export function snapshotEnv(keys: readonly string[]): EnvSnapshot {
  const out: EnvSnapshot = {};
  for (const key of keys) {
    if (key === "ANTHROPIC_API_KEY") {
      if (process.env[key]) {
        out[key] = "(set)";
      }
      continue;
    }
    const val = process.env[key];
    if (val !== undefined) {
      out[key] = val;
    }
  }
  return out;
}

export const TRACKED_ENV_KEYS = [
  "TAKEOFF_COMPILER",
  "TAKEOFF_COMPILER_OCR",
  "TAKEOFF_COMPILER_MAX_PAGES",
  "TAKEOFF_PROJECT_ORIENTATION",
  "TAKEOFF_SEMANTIC_BINDING",
  "TAKEOFF_SEMANTIC_MARK_RECOVERY",
  "TAKEOFF_SEMANTIC_DEFINITION_EXTRACTION",
  "TAKEOFF_B2_2L3_PROOF",
  "TAKEOFF_SCHEDULE_PAGE_NUMBERS",
  "TAKEOFF_OPENING_GEOMETRY",
  "TAKEOFF_WALL_ASSEMBLY_OCR_CACHE_DIR",
  "ANTHROPIC_API_KEY",
] as const;

export function applyRunModeEnv(
  mode: AuditRunMode,
  options?: { maxPages?: number },
): EnvSnapshot {
  const clearFlags = [
    "TAKEOFF_COMPILER",
    "TAKEOFF_COMPILER_OCR",
    "TAKEOFF_COMPILER_MAX_PAGES",
    "TAKEOFF_PROJECT_ORIENTATION",
    "TAKEOFF_SEMANTIC_BINDING",
    "TAKEOFF_SEMANTIC_MARK_RECOVERY",
    "TAKEOFF_SEMANTIC_DEFINITION_EXTRACTION",
    "TAKEOFF_B2_2L3_PROOF",
    "TAKEOFF_SCHEDULE_PAGE_NUMBERS",
    "TAKEOFF_OPENING_GEOMETRY",
  ];
  for (const key of clearFlags) {
    delete process.env[key];
  }

  if (mode === "A0") {
    return snapshotEnv(TRACKED_ENV_KEYS);
  }

  process.env.TAKEOFF_COMPILER = "1";
  process.env.TAKEOFF_COMPILER_OCR = "1";
  process.env.TAKEOFF_PROJECT_ORIENTATION = "1";
  process.env.TAKEOFF_SEMANTIC_BINDING = "1";
  process.env.TAKEOFF_SEMANTIC_DEFINITION_EXTRACTION = "1";
  process.env.TAKEOFF_B2_2L3_PROOF = "1";
  process.env.TAKEOFF_SCHEDULE_PAGE_NUMBERS = "1";
  process.env.TAKEOFF_OPENING_GEOMETRY = "1";

  if (options?.maxPages != null) {
    process.env.TAKEOFF_COMPILER_MAX_PAGES = String(options.maxPages);
  }

  return snapshotEnv(TRACKED_ENV_KEYS);
}

export function shouldUseMockAi(mode: AuditRunMode): boolean {
  if (mode === "B") {
    return !process.env.ANTHROPIC_API_KEY;
  }
  return true;
}

export function evidenceStageVariant(mode: AuditRunMode): EvidenceStageVariant {
  if (mode === "A0") return "a0_empty";
  if (mode === "B") return "live_claude";
  if (mode === "A") return "compiler_only";
  return "diagnostic";
}
