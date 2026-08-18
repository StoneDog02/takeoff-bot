import type {
  EvidenceId,
  PipelineRunId,
} from "../../../core/schemas/identity.schema.js";
import {
  confidencePayloadSchema,
  type ConfidencePayload,
  type OpeningsPayload,
  type StructuralMembersPayload,
  type ValidationPayload,
  type WallFramingPayload,
} from "../schemas/framing-artifacts.schema.js";
import { evaluateObjectConfidence } from "./evaluateObjectConfidence.js";
import { evaluateTakeoffConfidence } from "./evaluateTakeoffConfidence.js";

export type FramingConfidenceInput = {
  pipelineRunId: PipelineRunId;
  scopeName: string;
  validation: ValidationPayload;
  wallFraming?: WallFramingPayload;
  openings?: OpeningsPayload;
  structuralMembers?: StructuralMembersPayload;
  evidenceIds?: EvidenceId[];
  useExplicitFixture?: boolean;
};

export function coordinateFramingConfidence(
  input: FramingConfidenceInput,
): ConfidencePayload {
  const objectEvaluations = [];

  if (input.wallFraming) {
    for (const wall of input.wallFraming.walls) {
      objectEvaluations.push(evaluateObjectConfidence(wall, input.validation));
    }
    for (const segment of input.wallFraming.segments) {
      objectEvaluations.push(evaluateObjectConfidence(segment, input.validation));
    }
  }

  if (input.openings) {
    for (const opening of input.openings.openings) {
      objectEvaluations.push(evaluateObjectConfidence(opening, input.validation));
    }
  }

  if (input.structuralMembers) {
    for (const member of input.structuralMembers.structuralMembers) {
      objectEvaluations.push(evaluateObjectConfidence(member, input.validation));
    }
  }

  const takeoffEvaluation = evaluateTakeoffConfidence({
    pipelineRunId: input.pipelineRunId,
    scopeName: input.scopeName,
    validation: input.validation,
    objectEvaluations,
    evidenceIds: input.evidenceIds ?? [],
    useExplicitFixture: input.useExplicitFixture ?? false,
  });

  return confidencePayloadSchema.parse({
    confidenceEvaluations: [...objectEvaluations, takeoffEvaluation],
  });
}
