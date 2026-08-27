import type {
  StructuralMembersPayload,
  ValidationPayload,
} from "../schemas/framing-artifacts.schema.js";
import type { StructuralMember } from "../schemas/structural-member.schema.js";
import { isQuantityBlocked } from "../calculators/isQuantityBlocked.js";
import { isQuantityInputResolved } from "../calculators/isQuantityInputResolved.js";
import { STRUCTURAL_MEMBER_QUANTITY_KEYS } from "../validators/rule-ids.js";
import type { FramingMaterialLineItem } from "../schemas/material.schema.js";

const LENGTH_PROPERTY_PATH = "lengthFeet";
const QUANTITY_PROPERTY_PATH = "quantity";
const CATEGORY_PROPERTY_PATH = "category";
const MATERIAL_TYPE_PROPERTY_PATH = "materialType";
const SIZE_PROPERTY_PATH = "size";
const PLY_COUNT_PROPERTY_PATH = "plyCount";

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/g, "-");
}

function isExplicitlyBuiltUp(member: StructuralMember): boolean {
  return member.category === "built-up-member";
}

/**
 * Same eligibility gates as `calculateStructuralMembers` material LF emission.
 */
export function isStructuralMemberCalculatorReady(
  member: StructuralMember,
  validation: ValidationPayload | undefined,
): boolean {
  if (
    isQuantityBlocked(
      validation,
      [member.id],
      STRUCTURAL_MEMBER_QUANTITY_KEYS.material,
    ) ||
    isQuantityBlocked(
      validation,
      [member.id],
      STRUCTURAL_MEMBER_QUANTITY_KEYS.length,
    )
  ) {
    return false;
  }

  if (
    member.category === "unknown" ||
    !isQuantityInputResolved(
      member.category,
      member.resolutionTraces,
      CATEGORY_PROPERTY_PATH,
    ) ||
    !isQuantityInputResolved(
      member.materialType,
      member.resolutionTraces,
      MATERIAL_TYPE_PROPERTY_PATH,
    ) ||
    !isQuantityInputResolved(
      member.size,
      member.resolutionTraces,
      SIZE_PROPERTY_PATH,
    ) ||
    !isQuantityInputResolved(
      member.lengthFeet,
      member.resolutionTraces,
      LENGTH_PROPERTY_PATH,
    ) ||
    !isQuantityInputResolved(
      member.quantity,
      member.resolutionTraces,
      QUANTITY_PROPERTY_PATH,
    )
  ) {
    return false;
  }

  if (normalizeToken(member.materialType ?? "") === "unknown") {
    return false;
  }

  if (isExplicitlyBuiltUp(member)) {
    return isQuantityInputResolved(
      member.plyCount,
      member.resolutionTraces,
      PLY_COUNT_PROPERTY_PATH,
    );
  }

  return true;
}

export function isStructuralMemberIdentityResolved(
  member: StructuralMember,
): boolean {
  return (
    member.category !== null &&
    member.category !== "unknown" &&
    isQuantityInputResolved(
      member.category,
      member.resolutionTraces,
      CATEGORY_PROPERTY_PATH,
    ) &&
    isQuantityInputResolved(
      member.materialType,
      member.resolutionTraces,
      MATERIAL_TYPE_PROPERTY_PATH,
    ) &&
    isQuantityInputResolved(
      member.size,
      member.resolutionTraces,
      SIZE_PROPERTY_PATH,
    ) &&
    normalizeToken(member.materialType ?? "") !== "unknown"
  );
}

export function countStructuralMembersWithMaterialLines(
  materials: readonly FramingMaterialLineItem[],
  structuralMembers: StructuralMembersPayload,
): number {
  const memberIds = new Set(
    structuralMembers.structuralMembers.map((member) => member.id),
  );
  const calculated = new Set<string>();

  for (const line of materials) {
    for (const sourceId of line.sourceObjectIds) {
      if (memberIds.has(sourceId)) {
        calculated.add(sourceId);
      }
    }
  }

  return calculated.size;
}

export type StructuralProductFunnel = {
  kind: "structural";
  members: number;
  resolvedIdentity: number;
  calculatorReady: number;
  calculatedMembers: number;
  stage14MaterialLines: number;
  stage16MaterialLines: number;
};

export function buildStructuralProductFunnel(input: {
  structuralMembers: StructuralMembersPayload;
  validation?: ValidationPayload;
  materials?: readonly FramingMaterialLineItem[];
  stage16StructuralLines?: number;
}): StructuralProductFunnel {
  const members = input.structuralMembers.structuralMembers;

  let resolvedIdentity = 0;
  let calculatorReady = 0;

  for (const member of members) {
    if (isStructuralMemberIdentityResolved(member)) {
      resolvedIdentity += 1;
    }
    if (isStructuralMemberCalculatorReady(member, input.validation)) {
      calculatorReady += 1;
    }
  }

  const memberIds = new Set(members.map((member) => member.id));
  const structuralMaterials =
    input.materials?.filter((line) =>
      line.sourceObjectIds.some((sourceId) => memberIds.has(sourceId)),
    ) ?? [];

  return {
    kind: "structural",
    members: members.length,
    resolvedIdentity,
    calculatorReady,
    calculatedMembers: countStructuralMembersWithMaterialLines(
      input.materials ?? [],
      input.structuralMembers,
    ),
    stage14MaterialLines: structuralMaterials.length,
    stage16MaterialLines:
      input.stage16StructuralLines ?? structuralMaterials.length,
  };
}

export function sortStructuralMaterialLines(
  materials: readonly FramingMaterialLineItem[],
  structuralMembers: StructuralMembersPayload,
): FramingMaterialLineItem[] {
  const memberIds = new Set(
    structuralMembers.structuralMembers.map((member) => member.id),
  );
  return [...materials]
    .filter((line) =>
      line.sourceObjectIds.some((sourceId) => memberIds.has(sourceId)),
    )
    .sort((left, right) => compareIds(left.id, right.id));
}
