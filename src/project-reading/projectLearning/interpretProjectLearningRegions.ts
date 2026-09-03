import type { ProjectSemanticDefinition } from "../schemas/projectDictionary.schema.js";
import {
  projectLearningCandidateSchema,
  type ProjectLearningCandidate,
} from "./projectLearningTypes.js";

export type InterpretedDefinitionProposal = {
  candidateId: string;
  semanticTypeKey: string;
  definitionKind: NonNullable<ProjectLearningCandidate["definitionKind"]>;
  properties: Array<{ propertyPath: string; rawText: string }>;
  interpretedValue: string;
};

/**
 * Deterministic region interpretation for tests / offline path.
 * Maps harvest candidates that already carry semanticTypeKey+properties,
 * or promotes explicit fixture proposals. Does NOT trust raw Hybrid OCR alone.
 */
export function interpretProjectLearningRegionsDeterministic(input: {
  candidates: readonly ProjectLearningCandidate[];
  proposals?: readonly InterpretedDefinitionProposal[];
}): ProjectLearningCandidate[] {
  const byId = new Map(input.proposals?.map((p) => [p.candidateId, p]) ?? []);
  return input.candidates.map((candidate) => {
    const proposal = byId.get(candidate.id);
    if (proposal) {
      return projectLearningCandidateSchema.parse({
        ...candidate,
        semanticTypeKey: proposal.semanticTypeKey,
        definitionKind: proposal.definitionKind,
        properties: proposal.properties,
        interpretedValue: proposal.interpretedValue,
        validationStatus: "interpreted",
      });
    }
    if (
      candidate.semanticTypeKey &&
      candidate.properties &&
      candidate.properties.length > 0 &&
      candidate.definitionKind
    ) {
      return projectLearningCandidateSchema.parse({
        ...candidate,
        interpretedValue:
          candidate.interpretedValue ??
          `${candidate.semanticTypeKey}: ${candidate.properties.map((p) => p.rawText).join("; ")}`,
        validationStatus: "interpreted",
      });
    }
    // Raw harvest without construction-semantic interpretation stays harvested.
    return candidate;
  });
}

export function proposalsToDictionaryDefinitions(
  candidates: readonly ProjectLearningCandidate[],
  provenanceToolCallId: string,
): ProjectSemanticDefinition[] {
  const defs: ProjectSemanticDefinition[] = [];
  for (const c of candidates) {
    if (c.validationStatus !== "interpreted" && c.validationStatus !== "validated") {
      continue;
    }
    if (!c.semanticTypeKey || !c.properties || c.properties.length === 0) {
      continue;
    }
    defs.push({
      semanticTypeKey: c.semanticTypeKey,
      sourcePage: c.pageNumber,
      properties: c.properties.map((p) => ({
        propertyPath: p.propertyPath,
        rawText: p.rawText,
      })),
      status: "definition",
      provenance: [
        {
          kind: "artifact",
          toolCallId: provenanceToolCallId,
          pageNumber: c.pageNumber,
          artifactPath: `project-learning:${c.id}`,
        },
      ],
    });
  }
  return defs;
}
