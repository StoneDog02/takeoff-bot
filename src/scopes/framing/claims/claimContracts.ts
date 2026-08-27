import {
  FLOOR_QUANTITY_KEYS,
  OPENING_QUANTITY_KEYS,
  ROOF_QUANTITY_KEYS,
  SHEATHING_QUANTITY_KEYS,
  STRUCTURAL_MEMBER_QUANTITY_KEYS,
  WALL_QUANTITY_KEYS,
  CONNECTORS_HARDWARE_QUANTITY_KEYS,
} from "../validators/rule-ids.js";
import type { MaterialQuantityUnit } from "../schemas/material.schema.js";

/**
 * Claim-critical input contract for one quantityKey.
 *
 * reviewOnlyPropertyPaths must not set canCalculate:false for this key.
 * absence of a property from identity/arithmetic/applicability means it is
 * not claim-critical for admission of this quantity.
 */
export type ClaimCriticalInputContract = {
  quantityKey: string;
  unit: MaterialQuantityUnit | null;
  calculatorOwner:
    | "wall"
    | "opening"
    | "structural"
    | "floor"
    | "roof"
    | "sheathing"
    | "fastener"
    | "unwired";
  identityPropertyPaths: readonly string[];
  arithmeticPropertyPaths: readonly string[];
  applicabilityPropertyPaths: readonly string[];
  reviewOnlyPropertyPaths: readonly string[];
};

const CONTRACTS: readonly ClaimCriticalInputContract[] = [
  {
    quantityKey: WALL_QUANTITY_KEYS.studs,
    unit: "each",
    calculatorOwner: "wall",
    identityPropertyPaths: ["assembly.studSize"],
    arithmeticPropertyPaths: ["lengthFeet", "assembly.studSpacingInches"],
    applicabilityPropertyPaths: [],
    reviewOnlyPropertyPaths: ["assembly.heightFeet"],
  },
  {
    quantityKey: WALL_QUANTITY_KEYS.plates,
    unit: "linear-foot",
    calculatorOwner: "wall",
    identityPropertyPaths: ["assembly.studSize"],
    arithmeticPropertyPaths: ["lengthFeet", "assembly.plateCount"],
    applicabilityPropertyPaths: [],
    reviewOnlyPropertyPaths: ["assembly.heightFeet"],
  },
  {
    quantityKey: OPENING_QUANTITY_KEYS.kingStuds,
    unit: "each",
    calculatorOwner: "opening",
    identityPropertyPaths: ["assembly.studSize"],
    arithmeticPropertyPaths: ["kingStudCount", "quantity"],
    applicabilityPropertyPaths: ["category", "parentObjectId"],
    // Height is claim-irrelevant for king COUNT (length claims may need it later).
    reviewOnlyPropertyPaths: ["assembly.heightFeet"],
  },
  {
    quantityKey: OPENING_QUANTITY_KEYS.jackStuds,
    unit: "each",
    calculatorOwner: "opening",
    identityPropertyPaths: ["assembly.studSize"],
    arithmeticPropertyPaths: ["jackStudCount", "quantity"],
    applicabilityPropertyPaths: ["category", "parentObjectId"],
    reviewOnlyPropertyPaths: ["assembly.heightFeet"],
  },
  {
    quantityKey: OPENING_QUANTITY_KEYS.roughSill,
    unit: "linear-foot",
    calculatorOwner: "opening",
    identityPropertyPaths: ["assembly.studSize"],
    arithmeticPropertyPaths: ["dimensions.roughWidthFeet", "quantity"],
    applicabilityPropertyPaths: ["category", "parentObjectId"],
    reviewOnlyPropertyPaths: ["assembly.heightFeet"],
  },
  {
    quantityKey: OPENING_QUANTITY_KEYS.cripplesAbove,
    unit: "each",
    calculatorOwner: "opening",
    identityPropertyPaths: ["assembly.studSize"],
    arithmeticPropertyPaths: [
      "dimensions.roughWidthFeet",
      "assembly.studSpacingInches",
      "quantity",
    ],
    applicabilityPropertyPaths: ["category", "parentObjectId"],
    reviewOnlyPropertyPaths: ["assembly.heightFeet"],
  },
  {
    quantityKey: OPENING_QUANTITY_KEYS.cripplesBelow,
    unit: "each",
    calculatorOwner: "opening",
    identityPropertyPaths: ["assembly.studSize"],
    arithmeticPropertyPaths: [
      "dimensions.roughWidthFeet",
      "assembly.studSpacingInches",
      "quantity",
    ],
    applicabilityPropertyPaths: ["category", "parentObjectId"],
    reviewOnlyPropertyPaths: ["assembly.heightFeet"],
  },
  {
    quantityKey: STRUCTURAL_MEMBER_QUANTITY_KEYS.material,
    unit: "linear-foot",
    calculatorOwner: "structural",
    identityPropertyPaths: ["category", "materialType", "size"],
    arithmeticPropertyPaths: ["lengthFeet", "quantity", "plyCount"],
    applicabilityPropertyPaths: [],
    reviewOnlyPropertyPaths: [],
  },
  {
    quantityKey: FLOOR_QUANTITY_KEYS.joists,
    unit: "each",
    calculatorOwner: "floor",
    identityPropertyPaths: ["assembly.joistSize", "assembly.joistType"],
    arithmeticPropertyPaths: [
      "joistLayoutLengthFeet",
      "assembly.joistSpacingInches",
    ],
    applicabilityPropertyPaths: ["parentSystemId"],
    reviewOnlyPropertyPaths: ["joistMemberLengthFeet", "areaSquareFeet"],
  },
  {
    quantityKey: FLOOR_QUANTITY_KEYS.joistLinearFeet,
    unit: "linear-foot",
    calculatorOwner: "floor",
    identityPropertyPaths: ["assembly.joistSize", "assembly.joistType"],
    arithmeticPropertyPaths: [
      "joistLayoutLengthFeet",
      "assembly.joistSpacingInches",
      "joistMemberLengthFeet",
    ],
    applicabilityPropertyPaths: ["parentSystemId"],
    reviewOnlyPropertyPaths: ["areaSquareFeet"],
  },
  {
    quantityKey: ROOF_QUANTITY_KEYS.commonRafters,
    unit: "each",
    calculatorOwner: "roof",
    identityPropertyPaths: ["assembly.memberSize", "assembly.framingType"],
    arithmeticPropertyPaths: [
      "rafterLayoutLengthFeet",
      "assembly.memberSpacingInches",
    ],
    applicabilityPropertyPaths: ["parentSystemId", "spanDirection"],
    reviewOnlyPropertyPaths: ["pitch", "areaSquareFeet"],
  },
  {
    quantityKey: SHEATHING_QUANTITY_KEYS.area,
    unit: "square-foot",
    calculatorOwner: "sheathing",
    identityPropertyPaths: ["application", "panelType", "thickness"],
    arithmeticPropertyPaths: ["areaSquareFeet"],
    applicabilityPropertyPaths: ["parentSystemId"],
    reviewOnlyPropertyPaths: [],
  },
  {
    quantityKey: CONNECTORS_HARDWARE_QUANTITY_KEYS.fastenerMaterial,
    unit: "each",
    calculatorOwner: "fastener",
    identityPropertyPaths: ["fastenerType"],
    arithmeticPropertyPaths: ["quantity"],
    applicabilityPropertyPaths: [],
    reviewOnlyPropertyPaths: ["diameter", "length", "coating"],
  },
];

const CONTRACTS_BY_KEY = new Map(
  CONTRACTS.map((contract) => [contract.quantityKey, contract]),
);

export function listClaimCriticalInputContracts(): readonly ClaimCriticalInputContract[] {
  return CONTRACTS;
}

export function getClaimCriticalInputContract(
  quantityKey: string,
): ClaimCriticalInputContract | undefined {
  return CONTRACTS_BY_KEY.get(quantityKey);
}

export function isReviewOnlyPropertyForQuantity(
  quantityKey: string,
  propertyPath: string,
): boolean {
  const contract = CONTRACTS_BY_KEY.get(quantityKey);
  if (!contract) {
    return false;
  }
  return contract.reviewOnlyPropertyPaths.includes(propertyPath);
}

export function isClaimCriticalPropertyForQuantity(
  quantityKey: string,
  propertyPath: string,
): boolean {
  const contract = CONTRACTS_BY_KEY.get(quantityKey);
  if (!contract) {
    return false;
  }
  return (
    contract.identityPropertyPaths.includes(propertyPath) ||
    contract.arithmeticPropertyPaths.includes(propertyPath) ||
    contract.applicabilityPropertyPaths.includes(propertyPath)
  );
}
