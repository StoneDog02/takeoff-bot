import type { ObjectId } from "../../../core/schemas/identity.schema.js";
import type {
  Connector,
  Fastener,
  Hardware,
} from "../schemas/connectors-hardware.schema.js";
import type { ConnectorsHardwarePayload } from "../schemas/framing-artifacts.schema.js";
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
  CONNECTORS_HARDWARE_QUANTITY_KEYS,
  CONNECTORS_HARDWARE_RULE_IDS,
} from "./rule-ids.js";
import type { RelatedObjectRef, ValidationBatch } from "./types.js";

export type ConnectorsHardwareValidationInput = {
  payload: ConnectorsHardwarePayload;
  relatedObjectsById?: ReadonlyMap<ObjectId, RelatedObjectRef>;
};

type ReferencableObject = {
  id: ObjectId;
  objectType: string;
  evidenceIds: Connector["evidenceIds"];
  associatedObjectIds?: ObjectId[];
};

function isConnectorTypeResolved(connector: Connector): boolean {
  return (
    connector.connectorType !== null ||
    isPropertyResolved(connector.resolutionTraces, "connectorType")
  );
}

function isHardwareTypeResolved(hardware: Hardware): boolean {
  return (
    hardware.hardwareType !== null ||
    isPropertyResolved(hardware.resolutionTraces, "hardwareType")
  );
}

function isFastenerTypeResolved(fastener: Fastener): boolean {
  return (
    fastener.fastenerType !== null ||
    isPropertyResolved(fastener.resolutionTraces, "fastenerType")
  );
}

function validateTypeResolved(
  object: ReferencableObject,
  ruleId: string,
  isResolved: boolean,
  options: {
    passExplanation: string;
    failExplanation: string;
    ruleViolated: string;
    recommendedUserAction: string;
    title: string;
    instruction: string;
    targetProperty: string;
    quantityKey: string;
    materialDescription: string;
  },
): ValidationBatch {
  const target = createObjectTarget(object.id, object.objectType);
  const evidenceIds = collectEvidenceIds(object);

  if (isResolved) {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      options.passExplanation,
      evidenceIds,
    );
  }

  const quantityImpacts = [
    {
      quantityKey: options.quantityKey,
      description: options.materialDescription,
      canCalculate: false,
    },
  ];

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "critical",
      ruleViolated: options.ruleViolated,
      explanation: options.failExplanation,
      target,
      recommendedUserAction: options.recommendedUserAction,
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: options.title,
      description: options.failExplanation,
      action: {
        type: "provide-value",
        instruction: options.instruction,
        targetProperty: options.targetProperty,
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [
        { objectId: object.id, objectType: object.objectType },
      ],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateReferenceIds(
  object: ReferencableObject,
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
    quantityKey: string;
    quantityDescription: string;
  },
): ValidationBatch {
  const target = createObjectTarget(object.id, object.objectType);
  const evidenceIds = collectEvidenceIds(object);

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
      quantityKey: options.quantityKey,
      description: options.quantityDescription,
      canCalculate: true,
    },
  ];
  const explanation = `${object.objectType} ${object.id} references missing ${options.relationshipLabel}: ${missingIds.join(", ")}.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "relationship",
      severity: "warning",
      ruleViolated: `${object.objectType} ${options.relationshipLabel} must reference existing objects.`,
      explanation,
      target,
      recommendedUserAction: options.actionInstruction,
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve ${options.relationshipLabel} for ${object.objectType} ${object.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction: options.actionInstruction,
        targetProperty: options.targetProperty,
      },
      reviewStatus: "review-recommended",
      blockingStatus: "not-blocked",
      affectedObjects: [
        { objectId: object.id, objectType: object.objectType },
      ],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateConnectorType(connector: Connector): ValidationBatch {
  return validateTypeResolved(
    connector,
    CONNECTORS_HARDWARE_RULE_IDS.connectorTypeResolved,
    isConnectorTypeResolved(connector),
    {
      passExplanation: `Connector ${connector.id} has a resolved type.`,
      failExplanation: `Connector ${connector.id} has unresolved type classification.`,
      ruleViolated: "Connector type must be resolved.",
      recommendedUserAction:
        "Confirm the connector type from details, schedules, or notes.",
      title: `Resolve type for connector ${connector.id}`,
      instruction: "Provide the connector type.",
      targetProperty: "connectorType",
      quantityKey: CONNECTORS_HARDWARE_QUANTITY_KEYS.connectorMaterial,
      materialDescription:
        "Connector material takeoff requires a resolved connector type.",
    },
  );
}

function validateHardwareType(hardware: Hardware): ValidationBatch {
  return validateTypeResolved(
    hardware,
    CONNECTORS_HARDWARE_RULE_IDS.hardwareTypeResolved,
    isHardwareTypeResolved(hardware),
    {
      passExplanation: `Hardware ${hardware.id} has a resolved type.`,
      failExplanation: `Hardware ${hardware.id} has unresolved type classification.`,
      ruleViolated: "Hardware type must be resolved.",
      recommendedUserAction:
        "Confirm the hardware type from details, schedules, or notes.",
      title: `Resolve type for hardware ${hardware.id}`,
      instruction: "Provide the hardware type.",
      targetProperty: "hardwareType",
      quantityKey: CONNECTORS_HARDWARE_QUANTITY_KEYS.hardwareMaterial,
      materialDescription:
        "Hardware material takeoff requires a resolved hardware type.",
    },
  );
}

function validateFastenerType(fastener: Fastener): ValidationBatch {
  return validateTypeResolved(
    fastener,
    CONNECTORS_HARDWARE_RULE_IDS.fastenerTypeResolved,
    isFastenerTypeResolved(fastener),
    {
      passExplanation: `Fastener ${fastener.id} has a resolved type.`,
      failExplanation: `Fastener ${fastener.id} has unresolved type classification.`,
      ruleViolated: "Fastener type must be resolved.",
      recommendedUserAction:
        "Confirm the fastener type from details, schedules, or notes.",
      title: `Resolve type for fastener ${fastener.id}`,
      instruction: "Provide the fastener type.",
      targetProperty: "fastenerType",
      quantityKey: CONNECTORS_HARDWARE_QUANTITY_KEYS.fastenerMaterial,
      materialDescription:
        "Fastener material takeoff requires a resolved fastener type.",
    },
  );
}

function validateAssociatedObjects(
  object: ReferencableObject,
  ruleId: string,
  payloadObjectsById: ReadonlyMap<ObjectId, RelatedObjectRef>,
  relatedObjectsById: ReadonlyMap<ObjectId, RelatedObjectRef> | undefined,
  quantityKey: string,
): ValidationBatch {
  const target = createObjectTarget(object.id, object.objectType);
  const evidenceIds = collectEvidenceIds(object);
  const referenceIds = object.associatedObjectIds ?? [];

  if (referenceIds.length === 0) {
    return buildPassedBatch(
      ruleId,
      "relationship",
      target,
      `${object.objectType} ${object.id} has no associated object references to validate.`,
      evidenceIds,
    );
  }

  const combinedById = new Map(payloadObjectsById);
  if (relatedObjectsById) {
    for (const [objectId, relatedObject] of relatedObjectsById) {
      combinedById.set(objectId, relatedObject);
    }
  }

  const missingIds = referenceIds.filter((id) => !combinedById.has(id));

  if (missingIds.length === 0) {
    return buildPassedBatch(
      ruleId,
      "relationship",
      target,
      `${object.objectType} ${object.id} references existing associated objects.`,
      evidenceIds,
    );
  }

  if (relatedObjectsById === undefined) {
    return buildSkippedBatch(
      ruleId,
      "relationship",
      target,
      "Associated object validation was skipped because no related artifacts were provided.",
      evidenceIds,
    );
  }

  const quantityImpacts = [
    {
      quantityKey,
      description: "Material takeoff may still proceed from the resolved type.",
      canCalculate: true,
    },
  ];
  const explanation = `${object.objectType} ${object.id} references missing associated objects: ${missingIds.join(", ")}.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "relationship",
      severity: "warning",
      ruleViolated: `${object.objectType} associated objects must reference existing objects.`,
      explanation,
      target,
      recommendedUserAction:
        "Confirm the members or assemblies associated with this object.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve associated objects for ${object.objectType} ${object.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction:
          "Confirm the members or assemblies associated with this object.",
        targetProperty: "associatedObjectIds",
      },
      reviewStatus: "review-recommended",
      blockingStatus: "not-blocked",
      affectedObjects: [{ objectId: object.id, objectType: object.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateConnectorHardware(
  connector: Connector,
  hardwareById: ReadonlyMap<ObjectId, RelatedObjectRef>,
): ValidationBatch {
  return validateReferenceIds(
    connector,
    CONNECTORS_HARDWARE_RULE_IDS.connectorHardwareResolved,
    connector.hardwareIds,
    hardwareById,
    {
      skipExplanation:
        "Hardware reference validation was skipped because no hardware objects were provided.",
      emptyExplanation: `Connector ${connector.id} has no hardware references to validate.`,
      passExplanation: `Connector ${connector.id} references existing hardware.`,
      relationshipLabel: "hardware",
      targetProperty: "hardwareIds",
      actionInstruction: "Confirm the hardware associated with this connector.",
      quantityKey: CONNECTORS_HARDWARE_QUANTITY_KEYS.connectorMaterial,
      quantityDescription:
        "Connector material takeoff may still proceed from connector type.",
    },
  );
}

function validateConnectorFasteners(
  connector: Connector,
  fastenersById: ReadonlyMap<ObjectId, RelatedObjectRef>,
): ValidationBatch {
  return validateReferenceIds(
    connector,
    CONNECTORS_HARDWARE_RULE_IDS.connectorFastenersResolved,
    connector.fastenerIds,
    fastenersById,
    {
      skipExplanation:
        "Fastener reference validation was skipped because no fastener objects were provided.",
      emptyExplanation: `Connector ${connector.id} has no fastener references to validate.`,
      passExplanation: `Connector ${connector.id} references existing fasteners.`,
      relationshipLabel: "fasteners",
      targetProperty: "fastenerIds",
      actionInstruction: "Confirm the fasteners associated with this connector.",
      quantityKey: CONNECTORS_HARDWARE_QUANTITY_KEYS.connectorMaterial,
      quantityDescription:
        "Connector material takeoff may still proceed from connector type.",
    },
  );
}

export function validateConnectorsHardware(
  input: ConnectorsHardwareValidationInput,
): ValidationBatch {
  const payloadObjectsById = new Map<ObjectId, RelatedObjectRef>();
  const hardwareById = new Map<ObjectId, RelatedObjectRef>();
  const fastenersById = new Map<ObjectId, RelatedObjectRef>();

  for (const connector of input.payload.connectors) {
    payloadObjectsById.set(connector.id, {
      objectId: connector.id,
      objectType: connector.objectType,
    });
  }
  for (const hardware of input.payload.hardware) {
    const ref = { objectId: hardware.id, objectType: hardware.objectType };
    payloadObjectsById.set(hardware.id, ref);
    hardwareById.set(hardware.id, ref);
  }
  for (const fastener of input.payload.fasteners) {
    const ref = { objectId: fastener.id, objectType: fastener.objectType };
    payloadObjectsById.set(fastener.id, ref);
    fastenersById.set(fastener.id, ref);
  }

  const batches: ValidationBatch[] = [];

  for (const connector of input.payload.connectors) {
    batches.push(
      validateConnectorType(connector),
      validateAssociatedObjects(
        connector,
        CONNECTORS_HARDWARE_RULE_IDS.connectorAssociatedObjectsResolved,
        payloadObjectsById,
        input.relatedObjectsById,
        CONNECTORS_HARDWARE_QUANTITY_KEYS.connectorMaterial,
      ),
      validateConnectorHardware(connector, hardwareById),
      validateConnectorFasteners(connector, fastenersById),
    );
  }

  for (const hardware of input.payload.hardware) {
    batches.push(
      validateHardwareType(hardware),
      validateAssociatedObjects(
        hardware,
        CONNECTORS_HARDWARE_RULE_IDS.hardwareAssociatedObjectsResolved,
        payloadObjectsById,
        input.relatedObjectsById,
        CONNECTORS_HARDWARE_QUANTITY_KEYS.hardwareMaterial,
      ),
    );
  }

  for (const fastener of input.payload.fasteners) {
    batches.push(
      validateFastenerType(fastener),
      validateAssociatedObjects(
        fastener,
        CONNECTORS_HARDWARE_RULE_IDS.fastenerAssociatedObjectsResolved,
        payloadObjectsById,
        input.relatedObjectsById,
        CONNECTORS_HARDWARE_QUANTITY_KEYS.fastenerMaterial,
      ),
    );
  }

  return mergeValidationBatches(...batches);
}
