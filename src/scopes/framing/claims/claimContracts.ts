import {
  FLOOR_QUANTITY_KEYS,
  OPENING_QUANTITY_KEYS,
  ROOF_QUANTITY_KEYS,
  SHEATHING_QUANTITY_KEYS,
  STRUCTURAL_MEMBER_QUANTITY_KEYS,
  WALL_QUANTITY_KEYS,
  CONNECTORS_HARDWARE_QUANTITY_KEYS,
  BLOCKING_QUANTITY_KEYS,
} from "../validators/rule-ids.js";
import type { MaterialQuantityUnit } from "../schemas/material.schema.js";
import {
  OPENING_CRIPPLES_ABOVE_ELIGIBLE_CATEGORIES,
  OPENING_CRIPPLES_BELOW_ELIGIBLE_CATEGORIES,
  OPENING_ROUGH_SILL_ELIGIBLE_CATEGORIES,
  OPENING_WALL_FRAMING_ELIGIBLE_CATEGORIES,
} from "./openingClaimApplicability.js";

/**
 * Product role of a quantityKey for candidacy / pending admission.
 *
 * emit — may become a material line or pending material claim
 * aggregate_gate — internal calculator/validation gate only
 * companion_input — blocks an emit key; not its own takeoff row
 * unsupported_capability — package/family summary, not per-object pending
 */
export type MaterialClaimRole =
  | "emit"
  | "aggregate_gate"
  | "companion_input"
  | "unsupported_capability";

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
  /** Product role for candidacy admission. */
  claimRole: MaterialClaimRole;
  /** Canonical quantity-owner objectType values. */
  quantityOwnerObjectTypes: readonly string[];
  /**
   * Assembly/system types that contribute inputs and may fan out to child
   * quantity owners, but must not themselves own product pending claims.
   */
  assemblyContributorObjectTypes: readonly string[];
  identityPropertyPaths: readonly string[];
  arithmeticPropertyPaths: readonly string[];
  applicabilityPropertyPaths: readonly string[];
  reviewOnlyPropertyPaths: readonly string[];
  /** When set, opening.category must be in this set for candidacy. */
  eligibleOpeningCategories?: readonly string[];
};

const CONTRACTS: readonly ClaimCriticalInputContract[] = [
  {
    quantityKey: WALL_QUANTITY_KEYS.studs,
    unit: "each",
    calculatorOwner: "wall",
    claimRole: "emit",
    quantityOwnerObjectTypes: ["wall-segment"],
    assemblyContributorObjectTypes: ["building-wall"],
    identityPropertyPaths: ["assembly.studSize"],
    arithmeticPropertyPaths: ["lengthFeet", "assembly.studSpacingInches"],
    applicabilityPropertyPaths: [],
    reviewOnlyPropertyPaths: ["assembly.heightFeet"],
  },
  {
    quantityKey: WALL_QUANTITY_KEYS.plates,
    unit: "linear-foot",
    calculatorOwner: "wall",
    claimRole: "emit",
    quantityOwnerObjectTypes: ["wall-segment"],
    assemblyContributorObjectTypes: ["building-wall"],
    identityPropertyPaths: ["assembly.studSize"],
    arithmeticPropertyPaths: ["lengthFeet", "assembly.plateCount"],
    applicabilityPropertyPaths: [],
    reviewOnlyPropertyPaths: ["assembly.heightFeet"],
  },
  {
    quantityKey: OPENING_QUANTITY_KEYS.kingStuds,
    unit: "each",
    calculatorOwner: "opening",
    claimRole: "emit",
    quantityOwnerObjectTypes: ["opening"],
    assemblyContributorObjectTypes: [],
    identityPropertyPaths: ["assembly.studSize"],
    arithmeticPropertyPaths: ["kingStudCount", "quantity"],
    applicabilityPropertyPaths: ["category", "parentObjectId"],
    reviewOnlyPropertyPaths: ["assembly.heightFeet"],
    eligibleOpeningCategories: OPENING_WALL_FRAMING_ELIGIBLE_CATEGORIES,
  },
  {
    quantityKey: OPENING_QUANTITY_KEYS.jackStuds,
    unit: "each",
    calculatorOwner: "opening",
    claimRole: "emit",
    quantityOwnerObjectTypes: ["opening"],
    assemblyContributorObjectTypes: [],
    identityPropertyPaths: ["assembly.studSize"],
    arithmeticPropertyPaths: ["jackStudCount", "quantity"],
    applicabilityPropertyPaths: ["category", "parentObjectId"],
    reviewOnlyPropertyPaths: ["assembly.heightFeet"],
    eligibleOpeningCategories: OPENING_WALL_FRAMING_ELIGIBLE_CATEGORIES,
  },
  {
    quantityKey: OPENING_QUANTITY_KEYS.roughSill,
    unit: "linear-foot",
    calculatorOwner: "opening",
    claimRole: "emit",
    quantityOwnerObjectTypes: ["opening"],
    assemblyContributorObjectTypes: [],
    identityPropertyPaths: ["assembly.studSize"],
    arithmeticPropertyPaths: ["dimensions.roughWidthFeet", "quantity"],
    applicabilityPropertyPaths: ["category", "parentObjectId"],
    reviewOnlyPropertyPaths: ["assembly.heightFeet"],
    eligibleOpeningCategories: OPENING_ROUGH_SILL_ELIGIBLE_CATEGORIES,
  },
  {
    quantityKey: OPENING_QUANTITY_KEYS.cripplesAbove,
    unit: "each",
    calculatorOwner: "opening",
    claimRole: "emit",
    quantityOwnerObjectTypes: ["opening"],
    assemblyContributorObjectTypes: [],
    identityPropertyPaths: ["assembly.studSize"],
    arithmeticPropertyPaths: [
      "dimensions.roughWidthFeet",
      "assembly.studSpacingInches",
      "quantity",
    ],
    applicabilityPropertyPaths: ["category", "parentObjectId"],
    reviewOnlyPropertyPaths: ["assembly.heightFeet"],
    eligibleOpeningCategories: OPENING_CRIPPLES_ABOVE_ELIGIBLE_CATEGORIES,
  },
  {
    quantityKey: OPENING_QUANTITY_KEYS.cripplesBelow,
    unit: "each",
    calculatorOwner: "opening",
    claimRole: "emit",
    quantityOwnerObjectTypes: ["opening"],
    assemblyContributorObjectTypes: [],
    identityPropertyPaths: ["assembly.studSize"],
    arithmeticPropertyPaths: [
      "dimensions.roughWidthFeet",
      "assembly.studSpacingInches",
      "quantity",
    ],
    applicabilityPropertyPaths: ["category", "parentObjectId"],
    reviewOnlyPropertyPaths: ["assembly.heightFeet"],
    eligibleOpeningCategories: OPENING_CRIPPLES_BELOW_ELIGIBLE_CATEGORIES,
  },
  {
    quantityKey: STRUCTURAL_MEMBER_QUANTITY_KEYS.material,
    unit: "linear-foot",
    calculatorOwner: "structural",
    claimRole: "emit",
    quantityOwnerObjectTypes: ["structural-member"],
    assemblyContributorObjectTypes: [],
    identityPropertyPaths: ["category", "materialType", "size"],
    arithmeticPropertyPaths: ["lengthFeet", "quantity", "plyCount"],
    applicabilityPropertyPaths: [],
    reviewOnlyPropertyPaths: [],
  },
  {
    quantityKey: FLOOR_QUANTITY_KEYS.joists,
    unit: "each",
    calculatorOwner: "floor",
    claimRole: "emit",
    quantityOwnerObjectTypes: ["floor-framing-area"],
    assemblyContributorObjectTypes: ["floor-framing-system"],
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
    claimRole: "emit",
    quantityOwnerObjectTypes: ["floor-framing-area"],
    assemblyContributorObjectTypes: ["floor-framing-system"],
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
    claimRole: "emit",
    quantityOwnerObjectTypes: ["roof-plane"],
    assemblyContributorObjectTypes: ["roof-framing-system"],
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
    claimRole: "emit",
    quantityOwnerObjectTypes: ["sheathing-area"],
    assemblyContributorObjectTypes: ["sheathing-system"],
    identityPropertyPaths: ["application", "panelType", "thickness"],
    arithmeticPropertyPaths: ["areaSquareFeet"],
    applicabilityPropertyPaths: ["parentSystemId"],
    reviewOnlyPropertyPaths: [],
  },
  {
    quantityKey: CONNECTORS_HARDWARE_QUANTITY_KEYS.fastenerMaterial,
    unit: "each",
    calculatorOwner: "fastener",
    claimRole: "emit",
    quantityOwnerObjectTypes: ["fastener"],
    assemblyContributorObjectTypes: [],
    identityPropertyPaths: ["fastenerType"],
    arithmeticPropertyPaths: ["quantity"],
    applicabilityPropertyPaths: [],
    reviewOnlyPropertyPaths: ["diameter", "length", "coating"],
  },
];

/**
 * Non-emit quantity keys that appear in validation impacts.
 * Documented here so admission can suppress product pending deterministically.
 */
const NON_EMIT_KEY_ROLES: ReadonlyMap<string, MaterialClaimRole> = new Map([
  [OPENING_QUANTITY_KEYS.framing, "aggregate_gate"],
  [OPENING_QUANTITY_KEYS.header, "unsupported_capability"],
  [WALL_QUANTITY_KEYS.sheathing, "unsupported_capability"],
  [STRUCTURAL_MEMBER_QUANTITY_KEYS.length, "companion_input"],
  [SHEATHING_QUANTITY_KEYS.material, "companion_input"],
  [BLOCKING_QUANTITY_KEYS.quantity, "unsupported_capability"],
  [BLOCKING_QUANTITY_KEYS.material, "unsupported_capability"],
  [CONNECTORS_HARDWARE_QUANTITY_KEYS.connectorMaterial, "unsupported_capability"],
  [CONNECTORS_HARDWARE_QUANTITY_KEYS.hardwareMaterial, "unsupported_capability"],
]);

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

export function getMaterialClaimRole(
  quantityKey: string,
): MaterialClaimRole | undefined {
  const contract = CONTRACTS_BY_KEY.get(quantityKey);
  if (contract) {
    return contract.claimRole;
  }
  return NON_EMIT_KEY_ROLES.get(quantityKey);
}

export function isEmitCapableQuantityKey(quantityKey: string): boolean {
  return getMaterialClaimRole(quantityKey) === "emit";
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
