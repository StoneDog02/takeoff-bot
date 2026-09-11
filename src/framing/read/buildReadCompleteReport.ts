import { z } from "zod";

import type { PropertyResolutionTrace } from "../../core/schemas/resolved-object.schema.js";
import type { FramingConstruction } from "../schemas/framingConstruction.schema.js";
import {
  requiredFieldsForIntents,
  type CalculatorRequiredField,
} from "./calculatorRequiredInputs.js";
import {
  isNonWoodFloorTakeoffAreaFromTraces,
  layoutTextIndicatesExplicitConcreteSlab,
} from "../resolve/floorAreaMaterialCompatibility.js";

/**
 * Resolution methods that represent project-source-backed values.
 * Per V1 spec §13.5: ReadComplete established status requires value backed by
 * project sources, not by assumptions or approved-defaults.
 */
const PROJECT_SOURCE_BACKED_METHODS: readonly string[] = [
  "explicit-project-value",
  "deterministic-calculation",
  "supported-inference",
  "identity-binding-merge",
  "user-override",
];

export const readCompleteFieldStatusSchema = z.enum([
  "established",
  "unresolved-after-read",
  "unattempted",
  "not-applicable",
]);

export type ReadCompleteFieldStatus = z.infer<
  typeof readCompleteFieldStatusSchema
>;

export const attemptedPathSchema = z.object({
  pathKind: z.string().trim().min(1),
  wasAttempted: z.boolean(),
});

export type AttemptedPath = z.infer<typeof attemptedPathSchema>;

export const readCompleteFieldSchema = z.object({
  propertyPath: z.string().trim().min(1),
  label: z.string().trim().min(1),
  status: readCompleteFieldStatusSchema,
  attemptedPaths: z.array(attemptedPathSchema).default([]),
});

export type ReadCompleteField = z.infer<typeof readCompleteFieldSchema>;

export const readCompleteConditionSchema = z.object({
  conditionId: z.string().trim().min(1),
  conditionKind: z.string().trim().min(1),
  name: z.string().trim().min(1),
  fields: z.array(readCompleteFieldSchema),
});

export const readCompleteReportSchema = z.object({
  generatedAt: z.string(),
  conditions: z.array(readCompleteConditionSchema),
});

export type ReadCompleteReport = z.infer<typeof readCompleteReportSchema>;

/**
 * Determines whether a trace represents a project-source-backed value.
 * Assumptions and approved-defaults do not count as source exhaustion.
 *
 * Per S2-RC-1 contract: A value with assumptionIds is NOT project-source-backed
 * even if the method is otherwise source-backed.
 */
function isProjectSourceBacked(trace: PropertyResolutionTrace): boolean {
  if ((trace.assumptionIds?.length ?? 0) > 0) {
    return false;
  }
  return PROJECT_SOURCE_BACKED_METHODS.includes(trace.method);
}

/**
 * Derives attempted paths from resolution traces.
 * A path is considered "attempted" if there is a trace for this property,
 * regardless of method (including unresolved traces indicating attempted extraction).
 */
function deriveAttemptedPaths(
  traces: readonly PropertyResolutionTrace[],
  propertyPath: string,
): AttemptedPath[] {
  const matchingTraces = traces.filter((t) => t.propertyPath === propertyPath);
  if (matchingTraces.length === 0) {
    return [];
  }
  const pathKinds = new Set<string>();
  for (const trace of matchingTraces) {
    pathKinds.add(trace.method);
  }
  return Array.from(pathKinds).map((pathKind) => ({
    pathKind,
    wasAttempted: true,
  }));
}

/**
 * Determines field status per S2-RC-1 contract:
 * - established: value present AND backed by project-source (not assumption/approved-default)
 * - unresolved-after-read: value missing but paths were attempted
 * - unattempted: required field with no attempted paths
 *
 * Assumptions do not count as source exhaustion per V1 spec §13.5.
 */
function fieldStatus(
  value: unknown,
  traces: readonly PropertyResolutionTrace[],
  propertyPath: string,
): { status: ReadCompleteFieldStatus; attemptedPaths: AttemptedPath[] } {
  const attemptedPaths = deriveAttemptedPaths(traces, propertyPath);
  const hasAttemptedPaths = attemptedPaths.length > 0;

  const matchingTrace = traces.find((t) => t.propertyPath === propertyPath);

  if (value !== null && value !== undefined) {
    if (matchingTrace?.method === "unresolved") {
      return {
        status: hasAttemptedPaths ? "unresolved-after-read" : "unattempted",
        attemptedPaths,
      };
    }
    if (matchingTrace && isProjectSourceBacked(matchingTrace)) {
      return { status: "established", attemptedPaths };
    }
    if (matchingTrace?.method === "approved-default") {
      return {
        status: hasAttemptedPaths ? "unresolved-after-read" : "unattempted",
        attemptedPaths,
      };
    }
    if (
      matchingTrace &&
      (matchingTrace.assumptionIds?.length ?? 0) > 0 &&
      !isProjectSourceBacked(matchingTrace)
    ) {
      return {
        status: hasAttemptedPaths ? "unresolved-after-read" : "unattempted",
        attemptedPaths,
      };
    }
    if (!matchingTrace) {
      return { status: "unattempted", attemptedPaths };
    }
    return { status: "established", attemptedPaths };
  }

  if (hasAttemptedPaths) {
    return { status: "unresolved-after-read", attemptedPaths };
  }
  return { status: "unattempted", attemptedPaths };
}

function fieldsFor(
  specs: readonly CalculatorRequiredField[],
  lookup: (propertyPath: string) => {
    value: unknown;
    traces: readonly PropertyResolutionTrace[];
    notApplicable?: boolean;
  },
): ReadCompleteField[] {
  return specs.map((spec) => {
    const resolved = lookup(spec.propertyPath);
    if (resolved.notApplicable) {
      return {
        propertyPath: spec.propertyPath,
        label: spec.label,
        status: "not-applicable" as const,
        attemptedPaths: [],
      };
    }
    const result = fieldStatus(resolved.value, resolved.traces, spec.propertyPath);
    return {
      propertyPath: spec.propertyPath,
      label: spec.label,
      status: result.status,
      attemptedPaths: result.attemptedPaths,
    };
  });
}

/**
 * READ-complete checklist for construction conditions the plans identified.
 * Does not walk taxonomy rows for absent house systems.
 */
export function buildReadCompleteReport(
  construction: FramingConstruction,
): ReadCompleteReport {
  const conditions: ReadCompleteReport["conditions"] = [];

  for (const segment of construction.walls.segments) {
    const wall = construction.walls.walls.find((entry) => entry.id === segment.parentWallId);
    const traces = [...segment.resolutionTraces, ...(wall?.resolutionTraces ?? [])];
    conditions.push({
      conditionId: segment.id,
      conditionKind: "wall-segment",
      name: wall?.name ?? segment.id,
      fields: fieldsFor(requiredFieldsForIntents(["wall-framing"]), (propertyPath) => {
        if (propertyPath === "lengthFeet") {
          return { value: segment.lengthFeet, traces };
        }
        if (propertyPath === "assembly.heightFeet") {
          return { value: wall?.assembly.heightFeet ?? null, traces };
        }
        if (propertyPath === "assembly.studSize") {
          return { value: wall?.assembly.studSize ?? null, traces };
        }
        if (propertyPath === "assembly.studSpacingInches") {
          return { value: wall?.assembly.studSpacingInches ?? null, traces };
        }
        if (propertyPath === "assembly.plateCount") {
          return { value: wall?.assembly.plateCount ?? null, traces };
        }
        return { value: null, traces };
      }),
    });
  }

  for (const area of construction.floorFraming.areas) {
    const system = construction.floorFraming.systems.find(
      (entry) => entry.id === area.parentSystemId,
    );
    const traces = [
      ...area.resolutionTraces,
      ...(system?.resolutionTraces ?? []),
    ];
    const joistInputsNotApplicable =
      isNonWoodFloorTakeoffAreaFromTraces(area) ||
      layoutTextIndicatesExplicitConcreteSlab(area.layout ?? "");
    conditions.push({
      conditionId: area.id,
      conditionKind: "floor-framing-area",
      name: system?.name ?? area.id,
      fields: fieldsFor(requiredFieldsForIntents(["floor-framing"]), (propertyPath) => {
        if (propertyPath === "assembly.joistType") {
          return {
            value: system?.assembly.joistType ?? null,
            traces,
            notApplicable: joistInputsNotApplicable,
          };
        }
        if (propertyPath === "assembly.joistSize") {
          return {
            value: system?.assembly.joistSize ?? null,
            traces,
            notApplicable: joistInputsNotApplicable,
          };
        }
        if (propertyPath === "assembly.joistSpacingInches") {
          return {
            value: system?.assembly.joistSpacingInches ?? null,
            traces,
            notApplicable: joistInputsNotApplicable,
          };
        }
        if (propertyPath === "joistLayoutLengthFeet") {
          return {
            value: area.joistLayoutLengthFeet,
            traces,
            notApplicable: joistInputsNotApplicable,
          };
        }
        if (propertyPath === "joistMemberLengthFeet") {
          return {
            value: area.joistMemberLengthFeet,
            traces,
            notApplicable: joistInputsNotApplicable,
          };
        }
        return { value: null, traces, notApplicable: joistInputsNotApplicable };
      }),
    });
  }

  for (const plane of construction.roofFraming.planes) {
    const system = construction.roofFraming.systems.find(
      (entry) => entry.id === plane.parentSystemId,
    );
    const traces = [
      ...plane.resolutionTraces,
      ...(system?.resolutionTraces ?? []),
    ];
    conditions.push({
      conditionId: plane.id,
      conditionKind: "roof-plane",
      name: system?.name ?? plane.id,
      fields: fieldsFor(requiredFieldsForIntents(["roof-framing"]), (propertyPath) => {
        if (propertyPath === "assembly.framingType") {
          return { value: system?.assembly.framingType ?? null, traces };
        }
        if (propertyPath === "assembly.memberSize") {
          return { value: system?.assembly.memberSize ?? null, traces };
        }
        if (propertyPath === "assembly.memberSpacingInches") {
          return { value: system?.assembly.memberSpacingInches ?? null, traces };
        }
        if (propertyPath === "rafterLayoutLengthFeet") {
          return { value: plane.rafterLayoutLengthFeet, traces };
        }
        if (propertyPath === "spanDirection") {
          return { value: plane.spanDirection, traces };
        }
        return { value: null, traces };
      }),
    });
  }

  for (const opening of construction.openings.openings) {
    const traces = opening.resolutionTraces;
    conditions.push({
      conditionId: opening.id,
      conditionKind: "opening",
      name: opening.id,
      fields: fieldsFor(requiredFieldsForIntents(["openings"]), (propertyPath) => {
        if (propertyPath === "openingType") {
          return { value: opening.category, traces };
        }
        if (propertyPath === "quantity") {
          return { value: opening.quantity, traces };
        }
        if (propertyPath === "dimensions.roughWidthFeet") {
          return { value: opening.dimensions.roughWidthFeet, traces };
        }
        if (propertyPath === "dimensions.roughHeightFeet") {
          return { value: opening.dimensions.roughHeightFeet, traces };
        }
        if (propertyPath === "parentWallTag") {
          return {
            value: opening.parentWallId ?? opening.parentObjectId,
            traces,
          };
        }
        return { value: null, traces };
      }),
    });
  }

  for (const member of construction.structuralMembers.structuralMembers) {
    const traces = member.resolutionTraces;
    conditions.push({
      conditionId: member.id,
      conditionKind: "structural-member",
      name: member.id,
      fields: fieldsFor(
        requiredFieldsForIntents(["structural-members"]),
        (propertyPath) => {
          if (propertyPath === "category") {
            return { value: member.category, traces };
          }
          if (propertyPath === "size") {
            return { value: member.size, traces };
          }
          if (propertyPath === "lengthFeet") {
            return { value: member.lengthFeet, traces };
          }
          return { value: null, traces };
        },
      ),
    });
  }

  for (const area of construction.sheathing.areas) {
    const traces = area.resolutionTraces;
    conditions.push({
      conditionId: area.id,
      conditionKind: "sheathing-area",
      name: area.id,
      fields: fieldsFor(requiredFieldsForIntents(["sheathing"]), (propertyPath) => {
        if (propertyPath === "areaSquareFeet") {
          return { value: area.areaSquareFeet, traces };
        }
        return { value: null, traces };
      }),
    });
  }

  return readCompleteReportSchema.parse({
    generatedAt: new Date().toISOString(),
    conditions,
  });
}
