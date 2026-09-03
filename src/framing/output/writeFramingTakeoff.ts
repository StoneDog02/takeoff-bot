import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Assumption } from "../../core/schemas/assumption.schema.js";
import type { FramingMaterialLineItem } from "../schemas/material.schema.js";
import type { FramingConstruction } from "../schemas/framingConstruction.schema.js";
import {
  framingTakeoffSchema,
  type FramingAssumptionDebug,
  type FramingMaterialDomain,
  type FramingMaterialLine,
  type FramingTakeoff,
} from "../schemas/framingTakeoff.schema.js";

export const FRAMING_TAKEOFF_FILENAME = "framing-takeoff.json";

function domainFromQuantityKey(
  quantityKey: string | undefined,
): FramingMaterialDomain | undefined {
  if (!quantityKey) {
    return undefined;
  }
  if (quantityKey.startsWith("wall.")) return "wall";
  if (quantityKey.startsWith("opening.")) return "opening";
  if (quantityKey.startsWith("member.")) return "structural";
  if (quantityKey.startsWith("floor.")) return "floor";
  if (quantityKey.startsWith("roof.")) return "roof";
  if (quantityKey.startsWith("sheathing.")) return "sheathing";
  if (quantityKey.startsWith("fastener.")) return "fastener";
  return undefined;
}

function assumptionNoteForIds(
  assumptionIds: readonly string[],
  assumptionsById: ReadonlyMap<string, Assumption>,
): string | undefined {
  const notes: string[] = [];
  for (const id of assumptionIds) {
    const assumption = assumptionsById.get(id);
    if (!assumption) {
      continue;
    }
    const pathLabel = assumption.target.propertyPath;
    notes.push(`${pathLabel}=${String(assumption.assumedValue)}`);
  }
  return notes.length > 0 ? notes.join("; ") : undefined;
}

export function buildFramingTakeoff(input: {
  projectId: string;
  pdfPath: string;
  createdAt?: string;
  construction: FramingConstruction;
  materials: readonly FramingMaterialLineItem[];
  assumptions?: readonly Assumption[];
}): FramingTakeoff {
  const assumptionsById = new Map(
    (input.assumptions ?? []).map((assumption) => [assumption.id, assumption]),
  );

  const materials: FramingMaterialLine[] = input.materials.map((line) => {
    const assumptionIds = line.assumptionIds ?? [];
    const assumptionUsed = assumptionIds.length > 0;
    const row: FramingMaterialLine = {
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      category: line.category,
      domain: domainFromQuantityKey(line.quantityKey),
      quantityKey: line.quantityKey,
      debugSourceIds: [...line.sourceObjectIds],
    };
    if (assumptionUsed) {
      row.assumptionUsed = true;
      const note = assumptionNoteForIds(assumptionIds, assumptionsById);
      if (note) {
        row.assumptionNote = note;
      }
    }
    return row;
  });

  const assumptionDebug: FramingAssumptionDebug[] = (input.assumptions ?? []).map(
    (assumption) => ({
      id: assumption.id,
      summary: `${assumption.target.propertyPath}=${String(assumption.assumedValue)}`,
      quantityKeys: [...assumption.materialImpact.affectedQuantityKeys],
    }),
  );

  const { construction } = input;
  return framingTakeoffSchema.parse({
    schemaVersion: 1,
    projectId: input.projectId,
    pdfPath: input.pdfPath,
    createdAt: input.createdAt ?? new Date().toISOString(),
    materials,
    assumptions: assumptionDebug.length > 0 ? assumptionDebug : undefined,
    meta: {
      wallCount: construction.walls.walls.length,
      openingCount: construction.openings.openings.length,
      structuralMemberCount:
        construction.structuralMembers.structuralMembers.length,
      floorSystemCount: construction.floorFraming.systems.length,
      floorAreaCount: construction.floorFraming.areas.length,
      roofSystemCount: construction.roofFraming.systems.length,
      roofPlaneCount: construction.roofFraming.planes.length,
      sheathingSystemCount: construction.sheathing.systems.length,
      sheathingAreaCount: construction.sheathing.areas.length,
      materialCount: materials.length,
    },
  });
}

export async function writeFramingTakeoff(input: {
  projectId: string;
  scopeName?: string;
  artifactsRoot?: string;
  takeoff: FramingTakeoff;
}): Promise<string> {
  const scopeName = input.scopeName ?? "framing";
  const root = input.artifactsRoot ?? "artifacts";
  const directory = path.resolve(root, input.projectId, scopeName);
  await mkdir(directory, { recursive: true });
  const artifactPath = path.join(directory, FRAMING_TAKEOFF_FILENAME);
  await writeFile(
    artifactPath,
    `${JSON.stringify(input.takeoff, null, 2)}\n`,
    "utf8",
  );
  return artifactPath;
}
