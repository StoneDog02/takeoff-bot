import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import type { CompiledDrawingPage } from "../../../drawing-compiler/schemas/compiledDrawingPage.schema.js";
import type { SemanticDefinition } from "../../../drawing-compiler/schemas/semanticDefinition.schema.js";
import type { GroundTruthLabel } from "./auditMetrics.schema.js";
import type { LoadedAuditArtifacts } from "./collectFramingAuditMetrics.js";
import { createWallObjectId } from "../resolvers/ids.js";

export type BecksteadP4Expected = {
  pageNumber: number;
  physicalRunKey: string;
  exampleTextContains: string;
  forbiddenFeetApprox: number;
};

export type GroundTruthCheck = {
  checkId: string;
  label: GroundTruthLabel;
  detail: string;
};

export type EvaluationTruthProperty = {
  propertyPath: string;
  expectedSubstrings: string[];
};

export type EvaluationTruthRow = {
  semanticTypeKey: string;
  properties: EvaluationTruthProperty[];
};

export type EvaluationTruthSet = {
  rows: EvaluationTruthRow[];
};

export type OwnershipTruth = {
  physicalRunKey: string;
  referenceKey: string;
};

export async function loadBecksteadP4Expected(
  repoRoot: string,
): Promise<BecksteadP4Expected | null> {
  const file = path.join(
    repoRoot,
    "tests/fixtures/drawing-compiler/expected/beckstead-p4.json",
  );
  try {
    return JSON.parse(await readFile(file, "utf8")) as BecksteadP4Expected;
  } catch {
    return null;
  }
}

export async function loadEvaluationTruthSet(
  repoRoot: string,
): Promise<EvaluationTruthSet | null> {
  const file = path.join(
    repoRoot,
    "artifacts/b2.2l.6/metrics/evaluation-truth-set.json",
  );
  try {
    const data = JSON.parse(await readFile(file, "utf8")) as EvaluationTruthSet;
    return data.rows?.length ? data : null;
  } catch {
    return null;
  }
}

export async function loadOwnershipTruth(repoRoot: string): Promise<OwnershipTruth | null> {
  const file = path.join(
    repoRoot,
    "artifacts/b2.2l.7/metrics/ownership-experiment.json",
  );
  try {
    const data = JSON.parse(await readFile(file, "utf8")) as {
      trace?: { physicalRunKey: string | null; referenceKey: string };
      o4Grade?: string;
    };
    if (data.o4Grade !== "O4-GREEN" || !data.trace?.physicalRunKey) {
      return null;
    }
    return {
      physicalRunKey: data.trace.physicalRunKey,
      referenceKey: data.trace.referenceKey,
    };
  } catch {
    return null;
  }
}

function textForPropertyMatch(
  rawText: string | undefined,
  candidateValue: unknown,
): string {
  const parts = [rawText ?? ""];
  if (typeof candidateValue === "string") {
    parts.push(candidateValue);
  } else if (candidateValue != null) {
    parts.push(JSON.stringify(candidateValue));
  }
  return parts.join(" ").toUpperCase();
}

function propertyMatchesTruth(
  rawText: string | undefined,
  candidateValue: unknown,
  expectedSubstrings: readonly string[],
): boolean {
  const text = textForPropertyMatch(rawText, candidateValue);
  return expectedSubstrings.every((sub) => text.includes(sub.toUpperCase()));
}

export function checkLengthEvidenceAgainstP4Truth(
  evidence: Array<{
    subjectKey: string;
    propertyPath: string;
    candidateValue: unknown;
    originalText?: string;
  }>,
  expected: BecksteadP4Expected,
): GroundTruthCheck[] {
  const checks: GroundTruthCheck[] = [];
  const runEvidence = evidence.filter(
    (e) =>
      e.subjectKey === expected.physicalRunKey &&
      e.propertyPath === "lengthFeet",
  );

  if (runEvidence.length === 0) {
    checks.push({
      checkId: "p4-west-bridge-length",
      label: "NOT_ATTEMPTED",
      detail: `No lengthFeet evidence for ${expected.physicalRunKey}`,
    });
  } else {
    const feet = runEvidence.map((e) => Number(e.candidateValue));
    const has54 = feet.some((f) => f >= 50 && f <= 58);
    const has240 = feet.some(
      (f) => Math.abs(f - expected.forbiddenFeetApprox) < 5,
    );
    checks.push({
      checkId: "p4-west-bridge-length",
      label:
        has54 && !has240
          ? "VERIFIED_CORRECT"
          : has240
            ? "KNOWN_INCORRECT"
            : "PLAUSIBLE_UNVERIFIED",
      detail: `lengthFeet values: ${feet.join(", ")}`,
    });
  }

  const forbidden = evidence.filter(
    (e) =>
      e.propertyPath === "lengthFeet" &&
      typeof e.candidateValue === "number" &&
      Math.abs(e.candidateValue - expected.forbiddenFeetApprox) < 5,
  );
  checks.push({
    checkId: "p4-scale-outlier-rejected",
    label: forbidden.length === 0 ? "VERIFIED_CORRECT" : "KNOWN_INCORRECT",
    detail:
      forbidden.length === 0
        ? "No ~240 ft length evidence emitted"
        : `Found forbidden scale evidence: ${forbidden.map((e) => e.subjectKey).join(", ")}`,
  });

  return checks;
}

function findCompiledDefinition(
  pages: readonly CompiledDrawingPage[],
  semanticTypeKey: string,
): SemanticDefinition | null {
  for (const page of pages) {
    if (!page.semanticDefinitions) continue;
    const def = page.semanticDefinitions.definitions.find(
      (d) => d.semanticTypeKey === semanticTypeKey,
    );
    if (def) return def;
  }
  return null;
}

export function checkScheduleTruthAgainstCompiledPages(
  pages: readonly CompiledDrawingPage[],
  truthSet: EvaluationTruthSet,
): GroundTruthCheck[] {
  const checks: GroundTruthCheck[] = [];

  for (const row of truthSet.rows) {
    const def = findCompiledDefinition(pages, row.semanticTypeKey);
    if (!def) {
      checks.push({
        checkId: `schedule-compile-${row.semanticTypeKey}`,
        label: "NOT_ATTEMPTED",
        detail: `No compiled definition for ${row.semanticTypeKey}`,
      });
      continue;
    }

    for (const prop of row.properties) {
      const compiledProp = def.properties.find(
        (p) => p.propertyPath === prop.propertyPath,
      );
      const matches = compiledProp
        ? propertyMatchesTruth(
            compiledProp.rawText,
            compiledProp.candidateValue,
            prop.expectedSubstrings,
          )
        : false;
      checks.push({
        checkId: `schedule-compile-${row.semanticTypeKey}-${prop.propertyPath}`,
        label: matches ? "VERIFIED_CORRECT" : "KNOWN_INCORRECT",
        detail: compiledProp
          ? `rawText=${compiledProp.rawText ?? "null"}`
          : `property ${prop.propertyPath} missing on compile`,
      });
    }
  }

  return checks;
}

export function checkScheduleTruthAgainstEvidence(
  evidence: readonly Evidence[],
  truthSet: EvaluationTruthSet,
): GroundTruthCheck[] {
  const checks: GroundTruthCheck[] = [];
  const definitionEvidence = evidence.filter(
    (e) => e.extractionPassId === "b2.2l.3-definition",
  );

  for (const row of truthSet.rows) {
    const rowEvidence = definitionEvidence.filter(
      (e) => e.subjectKey === row.semanticTypeKey,
    );
    if (rowEvidence.length === 0) {
      checks.push({
        checkId: `schedule-evidence-${row.semanticTypeKey}`,
        label: "NOT_ATTEMPTED",
        detail: `No definition evidence for ${row.semanticTypeKey}`,
      });
      continue;
    }

    for (const prop of row.properties) {
      const match = rowEvidence.find((e) => e.propertyPath === prop.propertyPath);
      const ok = match
        ? propertyMatchesTruth(
            match.originalText ?? undefined,
            match.candidateValue,
            prop.expectedSubstrings,
          )
        : false;
      checks.push({
        checkId: `schedule-evidence-${row.semanticTypeKey}-${prop.propertyPath}`,
        label: ok ? "VERIFIED_CORRECT" : "KNOWN_INCORRECT",
        detail: match
          ? `originalText=${match.originalText ?? "null"}`
          : `property ${prop.propertyPath} missing in evidence`,
      });
    }
  }

  return checks;
}

export function checkOwnershipTruthAgainstPipeline(
  artifacts: LoadedAuditArtifacts,
  ownership: OwnershipTruth,
): GroundTruthCheck[] {
  const checks: GroundTruthCheck[] = [];
  const { physicalRunKey, referenceKey } = ownership;

  const dictBinding = artifacts.projectDictionary?.bindings.find(
    (b) =>
      b.physicalRunKey === physicalRunKey &&
      b.status === "established_binding",
  );
  checks.push({
    checkId: "o4-dictionary-established-binding",
    label:
      dictBinding && dictBinding.referenceKey === referenceKey
        ? "VERIFIED_CORRECT"
        : dictBinding
          ? "KNOWN_INCORRECT"
          : "NOT_ATTEMPTED",
    detail: dictBinding
      ? `binding referenceKey=${dictBinding.referenceKey}`
      : "No established_binding in project dictionary for O4 run",
  });

  const bindingEvidence = artifacts.evidence.filter(
    (e) =>
      e.subjectKey === physicalRunKey &&
      (e.propertyPath === "semanticTypeKey" ||
        e.propertyPath === "wallType" ||
        e.propertyPath === "isShearOrBraced"),
  );
  const evidenceMatches = bindingEvidence.some((e) =>
    textForPropertyMatch(e.originalText ?? undefined, e.candidateValue).includes(
      referenceKey.toUpperCase().replace(/-/g, ""),
    ) ||
    (typeof e.candidateValue === "string" &&
      e.candidateValue.toLowerCase().includes(referenceKey.toLowerCase())),
  );
  checks.push({
    checkId: "o4-evidence-class-binding",
    label:
      bindingEvidence.length === 0
        ? "NOT_ATTEMPTED"
        : evidenceMatches
          ? "VERIFIED_CORRECT"
          : "KNOWN_INCORRECT",
    detail:
      bindingEvidence.length === 0
        ? "No semantic binding evidence for O4 physical run"
        : `${bindingEvidence.length} binding evidence records; match=${evidenceMatches}`,
  });

  const wallId = createWallObjectId(physicalRunKey);
  const wall = artifacts.wallFraming?.walls.find((w) => w.id === wallId);
  const resolvedSemantic =
    wall?.semanticTypeKey != null ||
    (wall?.wallType != null &&
      wall.wallType.toLowerCase().includes(referenceKey.replace(/-/g, " "))) ||
    wall?.isShearOrBraced === true;
  checks.push({
    checkId: "o4-resolution-shear-class",
    label:
      !wall
        ? "NOT_ATTEMPTED"
        : resolvedSemantic
          ? "VERIFIED_CORRECT"
          : "UNRESOLVED",
    detail: wall
      ? `wallType=${wall.wallType ?? "null"}, semanticTypeKey=${wall.semanticTypeKey ?? "null"}, isShearOrBraced=${wall.isShearOrBraced ?? "null"}`
      : `No wall object for ${physicalRunKey}`,
  });

  return checks;
}

export async function collectAllGroundTruthChecks(
  repoRoot: string,
  artifacts: LoadedAuditArtifacts,
): Promise<GroundTruthCheck[]> {
  const checks: GroundTruthCheck[] = [];

  const p4Expected = await loadBecksteadP4Expected(repoRoot);
  if (p4Expected) {
    checks.push(
      ...checkLengthEvidenceAgainstP4Truth(
        artifacts.evidence.map((e) => ({
          subjectKey: e.subjectKey,
          propertyPath: e.propertyPath,
          candidateValue: e.candidateValue,
          originalText: e.originalText ?? undefined,
        })),
        p4Expected,
      ),
    );
  }

  const truthSet = await loadEvaluationTruthSet(repoRoot);
  if (truthSet) {
    checks.push(
      ...checkScheduleTruthAgainstCompiledPages(
        artifacts.compiledPages.pages,
        truthSet,
      ),
    );
    checks.push(
      ...checkScheduleTruthAgainstEvidence(artifacts.evidence, truthSet),
    );
  }

  const ownership = await loadOwnershipTruth(repoRoot);
  if (ownership) {
    checks.push(...checkOwnershipTruthAgainstPipeline(artifacts, ownership));
  }

  return checks;
}
