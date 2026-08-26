import type {
  EvidenceId,
  PipelineRunId,
} from "../../../core/schemas/identity.schema.js";
import {
  confidencePayloadSchema,
  type ConfidencePayload,
  type FloorFramingPayload,
  type OpeningsPayload,
  type RoofFramingPayload,
  type SheathingPayload,
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
  floorFraming?: FloorFramingPayload;
  roofFraming?: RoofFramingPayload;
  sheathing?: SheathingPayload;
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

  if (input.floorFraming) {
    for (const system of input.floorFraming.systems) {
      objectEvaluations.push(evaluateObjectConfidence(system, input.validation));
    }
    for (const area of input.floorFraming.areas) {
      objectEvaluations.push(evaluateObjectConfidence(area, input.validation));
    }
  }

  if (input.roofFraming) {
    for (const system of input.roofFraming.systems) {
      objectEvaluations.push(evaluateObjectConfidence(system, input.validation));
    }
    for (const plane of input.roofFraming.planes) {
      objectEvaluations.push(evaluateObjectConfidence(plane, input.validation));
    }
  }

  if (input.sheathing) {
    for (const system of input.sheathing.systems) {
      objectEvaluations.push(evaluateObjectConfidence(system, input.validation));
    }
    for (const area of input.sheathing.areas) {
      objectEvaluations.push(evaluateObjectConfidence(area, input.validation));
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
