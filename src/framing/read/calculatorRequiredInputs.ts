import type { FramingExtractionIntent } from "../../pdf/deriveRoleAssignmentsFromPageClassification.js";

export type CalculatorRequiredField = {
  propertyPath: string;
  label: string;
};

const WALL_SEGMENT_FIELDS: readonly CalculatorRequiredField[] = [
  { propertyPath: "lengthFeet", label: "segment length" },
  { propertyPath: "assembly.heightFeet", label: "wall height" },
  { propertyPath: "assembly.studSize", label: "stud size" },
  { propertyPath: "assembly.studSpacingInches", label: "stud spacing" },
  { propertyPath: "assembly.plateCount", label: "plate count" },
];

const FLOOR_AREA_FIELDS: readonly CalculatorRequiredField[] = [
  { propertyPath: "assembly.joistType", label: "joist type" },
  { propertyPath: "assembly.joistSize", label: "joist size" },
  { propertyPath: "assembly.joistSpacingInches", label: "joist spacing" },
  { propertyPath: "joistLayoutLengthFeet", label: "joist layout length" },
  { propertyPath: "joistMemberLengthFeet", label: "joist member length" },
];

const ROOF_PLANE_FIELDS: readonly CalculatorRequiredField[] = [
  { propertyPath: "assembly.framingType", label: "roof framing type" },
  { propertyPath: "assembly.memberSize", label: "rafter/member size" },
  { propertyPath: "assembly.memberSpacingInches", label: "member spacing" },
  { propertyPath: "rafterLayoutLengthFeet", label: "rafter layout length" },
  { propertyPath: "spanDirection", label: "span direction" },
];

const OPENING_FIELDS: readonly CalculatorRequiredField[] = [
  { propertyPath: "openingType", label: "opening type" },
  { propertyPath: "quantity", label: "opening quantity" },
  { propertyPath: "dimensions.roughWidthFeet", label: "rough width" },
  { propertyPath: "dimensions.roughHeightFeet", label: "rough height" },
  { propertyPath: "parentWallTag", label: "parent wall" },
];

const STRUCTURAL_MEMBER_FIELDS: readonly CalculatorRequiredField[] = [
  { propertyPath: "category", label: "member category" },
  { propertyPath: "size", label: "member size" },
  { propertyPath: "lengthFeet", label: "member length" },
];

const SHEATHING_FIELDS: readonly CalculatorRequiredField[] = [
  { propertyPath: "areaSquareFeet", label: "sheathing area" },
];

const INTENT_REQUIRED_FIELDS: Record<
  FramingExtractionIntent,
  readonly CalculatorRequiredField[]
> = {
  "wall-framing": WALL_SEGMENT_FIELDS,
  "floor-framing": FLOOR_AREA_FIELDS,
  "roof-framing": ROOF_PLANE_FIELDS,
  openings: OPENING_FIELDS,
  "structural-members": STRUCTURAL_MEMBER_FIELDS,
  sheathing: SHEATHING_FIELDS,
  "framing-general": [
    ...WALL_SEGMENT_FIELDS,
    ...FLOOR_AREA_FIELDS,
    ...OPENING_FIELDS,
    ...STRUCTURAL_MEMBER_FIELDS,
  ],
};

export function requiredFieldsForIntents(
  intents: readonly FramingExtractionIntent[],
): CalculatorRequiredField[] {
  const seen = new Set<string>();
  const fields: CalculatorRequiredField[] = [];
  for (const intent of intents) {
    for (const field of INTENT_REQUIRED_FIELDS[intent] ?? []) {
      if (seen.has(field.propertyPath)) {
        continue;
      }
      seen.add(field.propertyPath);
      fields.push(field);
    }
  }
  return fields;
}

export function requiredInputPathsForIntents(
  intents: readonly FramingExtractionIntent[],
): string[] {
  return requiredFieldsForIntents(intents).map((field) => field.propertyPath);
}
