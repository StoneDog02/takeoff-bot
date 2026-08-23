import { readFile } from "node:fs/promises";
import path from "node:path";

export type AuditDeltaSnapshot = {
  definitionEvidenceCount: number;
  dictionaryBindingEvidenceCount: number;
  semanticBindingEvidenceCount: number;
  wallCount: number;
  wallsWithSemanticTypeKey: number;
  wallsWithShearClass: number;
  segmentsWithLength: number;
  segmentsCalculableStuds: number;
  materialLineItems: number;
  activeReviewItems: number;
  topBlockerSummary: string | null;
};

export type AuditDelta = {
  beforeLabel: string;
  afterLabel: string;
  before: AuditDeltaSnapshot;
  after: AuditDeltaSnapshot;
  delta: Record<string, number | string | null>;
};

type SemanticsSummaryFile = {
  evidenceByPassId: Record<string, number>;
  wallsWithSemanticTypeKey: number;
};

type AutomationCoverageFile = {
  segmentsWithLength: number;
  segmentsCalculableStuds: number;
};

type MaterialOutputFile = {
  lineItemCount: number;
};

type ResolutionCoverageFile = {
  walls: {
    count: number;
    segments: number;
    wallProperties?: Array<{
      propertyPath: string;
      resolved: number;
    }>;
  };
};

type AuditSummaryFile = {
  summaries: Array<{
    runMode: string;
    topBlocker: { summary: string } | null;
  }>;
};

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

export async function loadAuditDeltaSnapshot(
  metricsDir: string,
  mode: string = "A",
): Promise<AuditDeltaSnapshot> {
  const semantics = await readJson<SemanticsSummaryFile>(
    path.join(metricsDir, `semantics-summary-${mode}.json`),
  );

  const automation = await readJson<AutomationCoverageFile>(
    path.join(metricsDir, `automation-coverage-${mode}.json`),
  );

  const materials = await readJson<MaterialOutputFile>(
    path.join(metricsDir, `material-output-${mode}.json`),
  );

  const resolution = await readJson<ResolutionCoverageFile>(
    path.join(metricsDir, `resolution-coverage-${mode}.json`),
  );

  const summaryFile = await readJson<AuditSummaryFile>(
    path.join(metricsDir, "audit-summary.json"),
  );

  const modeSummary = summaryFile?.summaries.find((s) => s.runMode === mode);

  const evidenceByPassId = semantics?.evidenceByPassId ?? {};

  return {
    definitionEvidenceCount: evidenceByPassId["b2.2l.3-definition"] ?? 0,
    dictionaryBindingEvidenceCount:
      evidenceByPassId["project-orientation-binding"] ?? 0,
    semanticBindingEvidenceCount: evidenceByPassId["geometry-type-binding"] ?? 0,
    wallCount: resolution?.walls.count ?? 0,
    wallsWithSemanticTypeKey: semantics?.wallsWithSemanticTypeKey ?? 0,
    wallsWithShearClass:
      resolution?.walls.wallProperties?.find(
        (p) => p.propertyPath === "isShearOrBraced",
      )?.resolved ?? 0,
    segmentsWithLength: automation?.segmentsWithLength ?? 0,
    segmentsCalculableStuds: automation?.segmentsCalculableStuds ?? 0,
    materialLineItems: materials?.lineItemCount ?? 0,
    activeReviewItems: 0,
    topBlockerSummary: modeSummary?.topBlocker?.summary ?? null,
  };
}

export function buildAuditDelta(
  before: AuditDeltaSnapshot,
  after: AuditDeltaSnapshot,
  beforeLabel: string,
  afterLabel: string,
): AuditDelta {
  const delta: Record<string, number | string | null> = {};
  for (const key of Object.keys(before) as Array<keyof AuditDeltaSnapshot>) {
    const b = before[key];
    const a = after[key];
    if (typeof b === "number" && typeof a === "number") {
      delta[key] = a - b;
    } else if (b !== a) {
      delta[key] = `${String(b)} -> ${String(a)}`;
    }
  }
  return { beforeLabel, afterLabel, before, after, delta };
}
