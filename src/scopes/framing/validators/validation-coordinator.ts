import {
  validationPayloadSchema,
  type ValidationPayload,
} from "../schemas/framing-artifacts.schema.js";
import {
  buildOpeningsById,
  buildRelatedObjectMaps,
  buildStructuralMembersById,
  buildWallsById,
  hasAssociatedObjectArtifacts,
  hasConnectorAssociatedArtifacts,
  hasCoveredObjectArtifacts,
  hasMemberAssociatedArtifacts,
  hasParentArtifacts,
  type FramingValidationArtifacts,
} from "./buildRelatedObjectMaps.js";
import { mergeValidationBatches } from "./mergeValidationBatch.js";
import { validateAssumptions } from "./assumptions.validator.js";
import { validateBlocking } from "./blocking.validator.js";
import { validateConnectorsHardware } from "./connectors-hardware.validator.js";
import { validateFloorFraming } from "./floor-framing.validator.js";
import { validateFramingScope } from "./framing-scope.validator.js";
import { validateOpenings } from "./openings.validator.js";
import { validateRoofFraming } from "./roof-framing.validator.js";
import { validateSheathing } from "./sheathing.validator.js";
import { validateStructuralMembers } from "./structural-members.validator.js";
import type { ValidationBatch } from "./types.js";
import { validateWallFraming } from "./wall-framing.validator.js";

export type FramingValidationInput = FramingValidationArtifacts;

export function coordinateFramingValidation(
  input: FramingValidationInput,
): ValidationPayload {
  const batches: ValidationBatch[] = [];
  const { relatedObjectsById, connectorsById } = buildRelatedObjectMaps(input);

  if (input.wallFraming) {
    batches.push(validateWallFraming(input.wallFraming));
  }

  if (input.floorFraming) {
    batches.push(
      validateFloorFraming({
        payload: input.floorFraming,
        boundingWallsById: input.wallFraming
          ? buildWallsById(input.wallFraming)
          : undefined,
        openingsById: input.openings
          ? buildOpeningsById(input.openings)
          : undefined,
        structuralMembersById: input.structuralMembers
          ? buildStructuralMembersById(input.structuralMembers)
          : undefined,
      }),
    );
  }

  if (input.roofFraming) {
    batches.push(
      validateRoofFraming({
        payload: input.roofFraming,
        boundingWallsById: input.wallFraming
          ? buildWallsById(input.wallFraming)
          : undefined,
        openingsById: input.openings
          ? buildOpeningsById(input.openings)
          : undefined,
        structuralMembersById: input.structuralMembers
          ? buildStructuralMembersById(input.structuralMembers)
          : undefined,
      }),
    );
  }

  if (input.sheathing) {
    batches.push(
      validateSheathing({
        payload: input.sheathing,
        relatedObjectsById: hasCoveredObjectArtifacts(input)
          ? relatedObjectsById
          : undefined,
        openingsById: input.openings
          ? buildOpeningsById(input.openings)
          : undefined,
      }),
    );
  }

  if (input.blocking) {
    batches.push(
      validateBlocking({
        payload: input.blocking,
        relatedObjectsById: hasAssociatedObjectArtifacts(input)
          ? relatedObjectsById
          : undefined,
      }),
    );
  }

  if (input.openings) {
    batches.push(
      validateOpenings({
        payload: input.openings,
        parentObjectsById: hasParentArtifacts(input)
          ? relatedObjectsById
          : undefined,
        structuralMembersById: input.structuralMembers
          ? buildStructuralMembersById(input.structuralMembers)
          : undefined,
      }),
    );
  }

  if (input.structuralMembers) {
    batches.push(
      validateStructuralMembers({
        payload: input.structuralMembers,
        relatedObjectsById: hasMemberAssociatedArtifacts(input)
          ? relatedObjectsById
          : undefined,
        connectorsById: input.connectorsHardware ? connectorsById : undefined,
      }),
    );
  }

  if (input.connectorsHardware) {
    batches.push(
      validateConnectorsHardware({
        payload: input.connectorsHardware,
        relatedObjectsById: hasConnectorAssociatedArtifacts(input)
          ? relatedObjectsById
          : undefined,
      }),
    );
  }

  if (input.assumptions) {
    batches.push(validateAssumptions({ payload: input.assumptions }));
  }

  if (input.framingScope) {
    batches.push(
      validateFramingScope({
        payload: input.framingScope,
        validation: input.validation,
        confidence: input.confidence,
      }),
    );
  }

  const batch = mergeValidationBatches(...batches);
  return validationPayloadSchema.parse(batch);
}
