import type { ProjectSemanticDefinition } from "../schemas/projectDictionary.schema.js";
import {
  isContextEligible,
  projectLearningCandidateSchema,
  type ProjectLearningCandidate,
} from "./projectLearningTypes.js";

const DEFINITION_KEY_PATTERNS: Record<
  NonNullable<ProjectLearningCandidate["definitionKind"]>,
  RegExp
> = {
  "shear-wall": /^SW\d+[A-Z]?$/i,
  header: /^WB\d[\w./-]*$/i,
  holdown: /^(?:LSTHD|STHD|HDU|HTT)\w*$/i,
  connector: /^(?:MTS|CS|HSTA|MST)\w*$/i,
  "wall-type": /^(?:W|WT|AW)-?\d+[A-Z]?$/i,
  unknown: /.+/,
};

export function isValidDefinitionKey(
  key: string,
  kind: ProjectLearningCandidate["definitionKind"] = "unknown",
): boolean {
  const pattern = DEFINITION_KEY_PATTERNS[kind ?? "unknown"];
  return pattern.test(key.trim());
}

export type ValidateProjectLearningResult = {
  candidates: ProjectLearningCandidate[];
  validatedDefinitions: ProjectSemanticDefinition[];
  acceptedKeys: string[];
  rejectedKeys: string[];
};

/**
 * Validation gate: only interpreted candidates with valid keys + properties
 * become validated / context-eligible. Raw harvested OCR never passes.
 */
export function validateProjectLearningDefinitions(input: {
  candidates: readonly ProjectLearningCandidate[];
  /** Optional cross-check map: semanticTypeKey → expected property snippets. */
  crossCheckByKey?: ReadonlyMap<string, readonly string[]>;
  provenanceToolCallId?: string;
}): ValidateProjectLearningResult {
  const acceptedKeys: string[] = [];
  const rejectedKeys: string[] = [];
  const validatedDefinitions: ProjectSemanticDefinition[] = [];
  const candidates: ProjectLearningCandidate[] = [];

  for (const candidate of input.candidates) {
    if (candidate.validationStatus === "harvested") {
      candidates.push(candidate);
      continue;
    }

    if (
      candidate.validationStatus !== "interpreted" &&
      candidate.validationStatus !== "validated"
    ) {
      candidates.push(candidate);
      continue;
    }

    const key = candidate.semanticTypeKey?.trim() ?? "";
    const kind = candidate.definitionKind ?? "unknown";
    const props = candidate.properties ?? [];

    if (!key || !isValidDefinitionKey(key, kind) || props.length === 0) {
      rejectedKeys.push(key || candidate.id);
      candidates.push(
        projectLearningCandidateSchema.parse({
          ...candidate,
          validationStatus: "rejected",
          conflictNotes: [
            ...(candidate.conflictNotes ?? []),
            "Failed key/property validation gate",
          ],
        }),
      );
      continue;
    }

    const cross = input.crossCheckByKey?.get(key);
    if (cross && cross.length > 0) {
      const joined = props.map((p) => p.rawText).join(" ").toLowerCase();
      const mismatch = cross.every(
        (snippet) => !joined.includes(snippet.toLowerCase()),
      );
      if (mismatch) {
        rejectedKeys.push(key);
        candidates.push(
          projectLearningCandidateSchema.parse({
            ...candidate,
            validationStatus: "conflict",
            conflictNotes: [
              ...(candidate.conflictNotes ?? []),
              "Cross-check disagreement with existing OCR/schedule evidence",
            ],
          }),
        );
        continue;
      }
    }

    acceptedKeys.push(key);
    const validated = projectLearningCandidateSchema.parse({
      ...candidate,
      validationStatus: "validated",
    });
    candidates.push(validated);

    validatedDefinitions.push({
      semanticTypeKey: key,
      sourcePage: candidate.pageNumber,
      properties: props.map((p) => ({
        propertyPath: p.propertyPath,
        rawText: p.rawText,
      })),
      status: "definition",
      provenance: [
        {
          kind: "artifact",
          toolCallId: input.provenanceToolCallId ?? `project-learning:${candidate.id}`,
          pageNumber: candidate.pageNumber,
          artifactPath: `project-learning:${candidate.id}`,
        },
      ],
    });
  }

  return {
    candidates,
    validatedDefinitions,
    acceptedKeys,
    rejectedKeys,
  };
}

export function contextEligibleDefinitions(
  candidates: readonly ProjectLearningCandidate[],
): ProjectLearningCandidate[] {
  return candidates.filter((c) => isContextEligible(c.validationStatus));
}
