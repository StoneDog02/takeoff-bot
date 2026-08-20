import type { PropertyResolutionTrace } from "../../../core/schemas/resolved-object.schema.js";
import type {
  FloorFramingArea,
  FloorFramingSystem,
} from "../schemas/floor-framing.schema.js";
import type { Opening } from "../schemas/opening.schema.js";
import type {
  RoofFramingSystem,
  RoofPlane,
} from "../schemas/roof-framing.schema.js";
import type { StructuralMember } from "../schemas/structural-member.schema.js";
import type { BuildingWall, WallSegment } from "../schemas/wall.schema.js";

export type FramingResolvedObject =
  | { objectDomain: "opening"; object: Opening }
  | { objectDomain: "structural-member"; object: StructuralMember }
  | { objectDomain: "wall-segment"; object: WallSegment }
  | { objectDomain: "building-wall"; object: BuildingWall }
  | { objectDomain: "floor-framing-system"; object: FloorFramingSystem }
  | { objectDomain: "floor-framing-area"; object: FloorFramingArea }
  | { objectDomain: "roof-framing-system"; object: RoofFramingSystem }
  | { objectDomain: "roof-plane"; object: RoofPlane };

function readNestedValue(
  record: Record<string, unknown>,
  segments: readonly string[],
): unknown {
  let current: unknown = record;

  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== "object") {
      return null;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current ?? null;
}

export function readFramingPropertyValue(
  resolved: FramingResolvedObject,
  propertyPath: string,
): unknown {
  switch (resolved.objectDomain) {
    case "opening": {
      const opening = resolved.object;
      if (propertyPath === "kingStudCount") {
        return opening.kingStudCount;
      }
      if (propertyPath === "jackStudCount") {
        return opening.jackStudCount;
      }
      if (propertyPath === "roughSillSize") {
        return null;
      }
      if (propertyPath === "quantity") {
        return opening.quantity;
      }
      if (propertyPath === "category") {
        return opening.category;
      }
      if (propertyPath.startsWith("dimensions.")) {
        return readNestedValue(
          opening.dimensions as unknown as Record<string, unknown>,
          propertyPath.slice("dimensions.".length).split("."),
        );
      }
      return null;
    }
    case "structural-member": {
      const member = resolved.object;
      if (propertyPath in member) {
        return member[propertyPath as keyof StructuralMember] ?? null;
      }
      return null;
    }
    case "wall-segment": {
      const segment = resolved.object;
      if (propertyPath === "lengthFeet") {
        return segment.lengthFeet;
      }
      return null;
    }
    case "building-wall": {
      const wall = resolved.object;
      if (propertyPath.startsWith("assembly.")) {
        return readNestedValue(
          wall.assembly as unknown as Record<string, unknown>,
          propertyPath.slice("assembly.".length).split("."),
        );
      }
      if (propertyPath in wall) {
        return wall[propertyPath as keyof BuildingWall] ?? null;
      }
      return null;
    }
    case "floor-framing-system": {
      const system = resolved.object;
      if (propertyPath.startsWith("assembly.")) {
        return readNestedValue(
          system.assembly as unknown as Record<string, unknown>,
          propertyPath.slice("assembly.".length).split("."),
        );
      }
      if (propertyPath in system) {
        return system[propertyPath as keyof FloorFramingSystem] ?? null;
      }
      return null;
    }
    case "floor-framing-area": {
      const area = resolved.object;
      if (propertyPath in area) {
        return area[propertyPath as keyof FloorFramingArea] ?? null;
      }
      return null;
    }
    case "roof-framing-system": {
      const system = resolved.object;
      if (propertyPath.startsWith("assembly.")) {
        return readNestedValue(
          system.assembly as unknown as Record<string, unknown>,
          propertyPath.slice("assembly.".length).split("."),
        );
      }
      if (propertyPath in system) {
        return system[propertyPath as keyof RoofFramingSystem] ?? null;
      }
      return null;
    }
    case "roof-plane": {
      const plane = resolved.object;
      if (propertyPath in plane) {
        return plane[propertyPath as keyof RoofPlane] ?? null;
      }
      return null;
    }
  }
}

export function findPropertyResolutionTrace(
  traces: readonly PropertyResolutionTrace[],
  propertyPath: string,
): PropertyResolutionTrace | undefined {
  return traces.find((trace) => trace.propertyPath === propertyPath);
}
