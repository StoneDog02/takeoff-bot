import type { ObjectId } from "../../../core/schemas/identity.schema.js";
import type {
  SheathingArea,
  SheathingSystem,
} from "../schemas/sheathing.schema.js";
import type { SheathingPayload } from "../schemas/framing-artifacts.schema.js";
import {
  buildFailedBatch,
  buildPassedBatch,
  buildSkippedBatch,
  collectEvidenceIds,
  toReviewQuantityImpacts,
} from "./buildValidationBatch.js";
import { createObjectTarget } from "./ids.js";
import { isPropertyResolved } from "./isPropertyResolved.js";
import { mergeValidationBatches } from "./mergeValidationBatch.js";
import {
  SHEATHING_QUANTITY_KEYS,
  SHEATHING_RULE_IDS,
} from "./rule-ids.js";
import type { RelatedObjectRef, ValidationBatch } from "./types.js";

export type SheathingValidationInput = {
  payload: SheathingPayload;
  relatedObjectsById?: ReadonlyMap<ObjectId, RelatedObjectRef>;
  openingsById?: ReadonlyMap<ObjectId, RelatedObjectRef>;
};

function isPanelTypeResolved(system: SheathingSystem): boolean {
  return (
    system.panelSpecification.panelType !== null ||
    isPropertyResolved(
      system.resolutionTraces,
      "panelSpecification.panelType",
    )
  );
}

function isThicknessResolved(system: SheathingSystem): boolean {
  return (
    system.panelSpecification.thickness !== null ||
    isPropertyResolved(
      system.resolutionTraces,
      "panelSpecification.thickness",
    )
  );
}

function isAreaSquareFeetResolved(area: SheathingArea): boolean {
  return (
    area.areaSquareFeet !== null ||
    isPropertyResolved(area.resolutionTraces, "areaSquareFeet")
  );
}

function validateAreaParentSystemResolved(
  area: SheathingArea,
  systemsById: ReadonlyMap<ObjectId, SheathingSystem>,
): ValidationBatch {
  const target = createObjectTarget(area.id, area.objectType);
  const ruleId = SHEATHING_RULE_IDS.areaParentSystemResolved;
  const evidenceIds = collectEvidenceIds(area);

  if (systemsById.has(area.parentSystemId)) {
    return buildPassedBatch(
      ruleId,
      "relationship",
      target,
      `Sheathing area ${area.id} references an existing parent system.`,
      evidenceIds,
    );
  }

  const quantityImpacts = [
    {
      quantityKey: SHEATHING_QUANTITY_KEYS.area,
      description: "Sheathing area takeoff requires a valid parent system.",
      canCalculate: false,
    },
    {
      quantityKey: SHEATHING_QUANTITY_KEYS.material,
      description:
        "Sheathing material takeoff requires a valid parent system specification.",
      canCalculate: false,
    },
  ];

  const explanation = `Sheathing area ${area.id} references missing parent system ${area.parentSystemId}.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "relationship",
      severity: "critical",
      ruleViolated:
        "Sheathing area parent system must reference an existing system.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm the sheathing system that owns this area.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve parent system for sheathing area ${area.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction: "Identify the parent sheathing system for this area.",
        targetProperty: "parentSystemId",
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [{ objectId: area.id, objectType: area.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateSystemAreasConsistent(
  system: SheathingSystem,
  areasById: ReadonlyMap<ObjectId, SheathingArea>,
): ValidationBatch {
  const target = createObjectTarget(system.id, system.objectType);
  const ruleId = SHEATHING_RULE_IDS.systemAreasConsistent;
  const evidenceIds = collectEvidenceIds(system);
  const problems: string[] = [];

  for (const areaId of system.areaIds) {
    const area = areasById.get(areaId);
    if (!area) {
      problems.push(
        `Sheathing system ${system.id} references missing area ${areaId}.`,
      );
      continue;
    }

    if (area.parentSystemId !== system.id) {
      problems.push(
        `Area ${area.id} is listed on system ${system.id} but references parent ${area.parentSystemId}.`,
      );
    }
  }

  for (const area of areasById.values()) {
    if (
      area.parentSystemId === system.id &&
      !system.areaIds.includes(area.id)
    ) {
      problems.push(
        `Area ${area.id} references system ${system.id} but is not listed on the system.`,
      );
    }
  }

  if (problems.length === 0) {
    return buildPassedBatch(
      ruleId,
      "relationship",
      target,
      `Sheathing system ${system.id} area relationships are consistent.`,
      evidenceIds,
    );
  }

  const quantityImpacts = [
    {
      quantityKey: SHEATHING_QUANTITY_KEYS.area,
      description:
        "Inconsistent sheathing areas prevent reliable area takeoff.",
      canCalculate: false,
    },
    {
      quantityKey: SHEATHING_QUANTITY_KEYS.material,
      description:
        "Inconsistent sheathing areas prevent applying the correct panel specification.",
      canCalculate: false,
    },
  ];

  const explanation = problems.join(" ");

  return buildFailedBatch(
    {
      ruleId,
      level: "relationship",
      severity: "critical",
      ruleViolated:
        "Sheathing system and area relationships must be consistent.",
      explanation,
      target,
      recommendedUserAction:
        "Reconcile sheathing system area IDs and parent system references.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Reconcile areas for sheathing system ${system.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction: "Confirm which areas belong to this sheathing system.",
        targetProperty: "areaIds",
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [{ objectId: system.id, objectType: system.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateApplicationResolved(system: SheathingSystem): ValidationBatch {
  const target = createObjectTarget(system.id, system.objectType);
  const ruleId = SHEATHING_RULE_IDS.applicationResolved;
  const evidenceIds = collectEvidenceIds(system);

  if (system.application !== "unknown") {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Sheathing system ${system.id} has a resolved application.`,
      evidenceIds,
    );
  }

  // Brain: application classifies material and does not change SF arithmetic.
  // Area quantity remains calculable; material-line emission stays blocked.
  const quantityImpacts = [
    {
      quantityKey: SHEATHING_QUANTITY_KEYS.material,
      description:
        "Sheathing material-line emission requires a resolved wall, floor, or roof application.",
      canCalculate: false,
    },
    {
      quantityKey: SHEATHING_QUANTITY_KEYS.area,
      description:
        "Coverage square footage arithmetic may proceed from resolved areaSquareFeet without application; material identity remains incomplete.",
      canCalculate: true,
    },
  ];

  const explanation = `Sheathing system ${system.id} has unresolved application.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "critical",
      ruleViolated: "Sheathing application must be resolved.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm whether this sheathing applies to walls, floors, or roofs.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve application for sheathing system ${system.id}`,
      description: explanation,
      action: {
        type: "select-option",
        instruction: "Select the sheathing application for this system.",
        targetProperty: "application",
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [{ objectId: system.id, objectType: system.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validatePanelTypeResolved(system: SheathingSystem): ValidationBatch {
  const target = createObjectTarget(system.id, system.objectType);
  const ruleId = SHEATHING_RULE_IDS.panelTypeResolved;
  const evidenceIds = collectEvidenceIds(system);

  if (isPanelTypeResolved(system)) {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Sheathing system ${system.id} has a resolved panel type.`,
      evidenceIds,
    );
  }

  const quantityImpacts = [
    {
      quantityKey: SHEATHING_QUANTITY_KEYS.material,
      description: "Sheathing material takeoff requires a resolved panel type.",
      canCalculate: false,
    },
    {
      quantityKey: SHEATHING_QUANTITY_KEYS.area,
      description:
        "Sheathing area may still be calculated without a panel type.",
      canCalculate: true,
    },
  ];

  const explanation = `Sheathing system ${system.id} is missing panel type.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "critical",
      ruleViolated: "Sheathing panel type must be resolved.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm the panel type from structural notes or schedules.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve panel type for sheathing system ${system.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction: "Provide the sheathing panel type.",
        targetProperty: "panelSpecification.panelType",
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [{ objectId: system.id, objectType: system.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateThicknessResolved(system: SheathingSystem): ValidationBatch {
  const target = createObjectTarget(system.id, system.objectType);
  const ruleId = SHEATHING_RULE_IDS.thicknessResolved;
  const evidenceIds = collectEvidenceIds(system);

  if (isThicknessResolved(system)) {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Sheathing system ${system.id} has resolved panel thickness.`,
      evidenceIds,
    );
  }

  const quantityImpacts = [
    {
      quantityKey: SHEATHING_QUANTITY_KEYS.material,
      description:
        "Sheathing material takeoff requires a resolved panel thickness.",
      canCalculate: false,
    },
    {
      quantityKey: SHEATHING_QUANTITY_KEYS.area,
      description:
        "Sheathing area may still be calculated without panel thickness.",
      canCalculate: true,
    },
  ];

  const explanation = `Sheathing system ${system.id} is missing panel thickness.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "critical",
      ruleViolated: "Sheathing panel thickness must be resolved.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm panel thickness from structural notes or schedules.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve panel thickness for sheathing system ${system.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction: "Provide the sheathing panel thickness.",
        targetProperty: "panelSpecification.thickness",
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [{ objectId: system.id, objectType: system.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateAreaSquareFeetResolved(area: SheathingArea): ValidationBatch {
  const target = createObjectTarget(area.id, area.objectType);
  const ruleId = SHEATHING_RULE_IDS.areaSquareFeetResolved;
  const evidenceIds = collectEvidenceIds(area);

  if (isAreaSquareFeetResolved(area)) {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Sheathing area ${area.id} has resolved area square footage.`,
      evidenceIds,
    );
  }

  const quantityImpacts = [
    {
      quantityKey: SHEATHING_QUANTITY_KEYS.area,
      description: "Sheathing area takeoff requires resolved square footage.",
      canCalculate: false,
    },
    {
      quantityKey: SHEATHING_QUANTITY_KEYS.material,
      description:
        "Sheathing material specification may still be known without area geometry.",
      canCalculate: true,
    },
  ];

  const explanation = `Sheathing area ${area.id} is missing area square footage.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "critical",
      ruleViolated: "Sheathing area square footage must be resolved.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm sheathing area square footage from plans or covered assemblies.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve area square footage for sheathing area ${area.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction: "Provide the sheathing area in square feet.",
        targetProperty: "areaSquareFeet",
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [{ objectId: area.id, objectType: area.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateReferenceIds(
  area: SheathingArea,
  ruleId: string,
  referenceIds: ObjectId[],
  objectsById: ReadonlyMap<ObjectId, RelatedObjectRef> | undefined,
  options: {
    skipExplanation: string;
    emptyExplanation: string;
    passExplanation: string;
    relationshipLabel: string;
    targetProperty: string;
    actionInstruction: string;
  },
): ValidationBatch {
  const target = createObjectTarget(area.id, area.objectType);
  const evidenceIds = collectEvidenceIds(area);

  if (referenceIds.length === 0) {
    return buildPassedBatch(
      ruleId,
      "relationship",
      target,
      options.emptyExplanation,
      evidenceIds,
    );
  }

  if (objectsById === undefined) {
    return buildSkippedBatch(
      ruleId,
      "relationship",
      target,
      options.skipExplanation,
      evidenceIds,
    );
  }

  const missingIds = referenceIds.filter((id) => !objectsById.has(id));

  if (missingIds.length === 0) {
    return buildPassedBatch(
      ruleId,
      "relationship",
      target,
      options.passExplanation,
      evidenceIds,
    );
  }

  const quantityImpacts = [
    {
      quantityKey: SHEATHING_QUANTITY_KEYS.area,
      description:
        "Sheathing area takeoff may still proceed from explicit area geometry.",
      canCalculate: true,
    },
  ];

  const explanation = `Sheathing area ${area.id} references missing ${options.relationshipLabel}: ${missingIds.join(", ")}.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "relationship",
      severity: "warning",
      ruleViolated: `Sheathing area ${options.relationshipLabel} must reference existing objects.`,
      explanation,
      target,
      recommendedUserAction: options.actionInstruction,
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve ${options.relationshipLabel} for sheathing area ${area.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction: options.actionInstruction,
        targetProperty: options.targetProperty,
      },
      reviewStatus: "review-recommended",
      blockingStatus: "not-blocked",
      affectedObjects: [{ objectId: area.id, objectType: area.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateCoveredObjectsResolved(
  area: SheathingArea,
  relatedObjectsById: ReadonlyMap<ObjectId, RelatedObjectRef> | undefined,
): ValidationBatch {
  return validateReferenceIds(
    area,
    SHEATHING_RULE_IDS.coveredObjectsResolved,
    area.coveredObjectIds,
    relatedObjectsById,
    {
      skipExplanation:
        "Covered object validation was skipped because no related artifacts were provided.",
      emptyExplanation: `Sheathing area ${area.id} has no covered object references to validate.`,
      passExplanation: `Sheathing area ${area.id} references existing covered objects.`,
      relationshipLabel: "covered objects",
      targetProperty: "coveredObjectIds",
      actionInstruction:
        "Confirm the walls, floors, or roofs covered by this sheathing area.",
    },
  );
}

function validateOpeningReferencesResolved(
  area: SheathingArea,
  openingsById: ReadonlyMap<ObjectId, RelatedObjectRef> | undefined,
): ValidationBatch {
  return validateReferenceIds(
    area,
    SHEATHING_RULE_IDS.openingReferencesResolved,
    area.openingIds,
    openingsById,
    {
      skipExplanation:
        "Opening reference validation was skipped because no opening artifacts were provided.",
      emptyExplanation: `Sheathing area ${area.id} has no opening references to validate.`,
      passExplanation: `Sheathing area ${area.id} references existing openings.`,
      relationshipLabel: "openings",
      targetProperty: "openingIds",
      actionInstruction:
        "Confirm the openings associated with this sheathing area.",
    },
  );
}

export function validateSheathing(
  input: SheathingValidationInput,
): ValidationBatch {
  const systemsById = new Map(
    input.payload.systems.map((system) => [system.id, system]),
  );
  const areasById = new Map(
    input.payload.areas.map((area) => [area.id, area]),
  );

  const batches: ValidationBatch[] = [];

  for (const system of input.payload.systems) {
    batches.push(validateSystemAreasConsistent(system, areasById));
    batches.push(validateApplicationResolved(system));
    batches.push(validatePanelTypeResolved(system));
    batches.push(validateThicknessResolved(system));
  }

  for (const area of input.payload.areas) {
    batches.push(validateAreaParentSystemResolved(area, systemsById));
    batches.push(validateAreaSquareFeetResolved(area));
    batches.push(
      validateCoveredObjectsResolved(area, input.relatedObjectsById),
    );
    batches.push(
      validateOpeningReferencesResolved(area, input.openingsById),
    );
  }

  return mergeValidationBatches(...batches);
}
