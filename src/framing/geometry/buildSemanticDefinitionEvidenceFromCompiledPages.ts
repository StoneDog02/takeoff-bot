import type { CompiledDrawingPage } from "../../compiler/schemas/compiledDrawingPage.schema.js";
import type { SemanticDefinition } from "../../compiler/schemas/semanticDefinition.schema.js";
import type { Evidence } from "../../core/schemas/evidence.schema.js";
import type { SourceRegion } from "../../core/schemas/source.schema.js";
import { evidenceSchema } from "../../core/schemas/evidence.schema.js";

function definitionEvidenceId(def: SemanticDefinition, propertyPath: string): string {
  return `E-def-${def.definitionId}-${propertyPath}`.replace(/[^A-Za-z0-9._:-]/g, "-").slice(0, 128);
}

function compilerBboxToSourceRegion(
  bbox: { x0: number; y0: number; x1: number; y1: number } | undefined,
): SourceRegion | null {
  if (!bbox) return null;
  const width = bbox.x1 - bbox.x0;
  const height = bbox.y1 - bbox.y0;
  if (width <= 0 || height <= 0) return null;
  return {
    coordinateSpace: "pdf-points",
    x: bbox.x0,
    y: bbox.y0,
    width,
    height,
  };
}

function scheduleNameForDefinitionKind(kind: string): string {
  switch (kind) {
    case "shear-wall":
      return "SHEAR WALL SCHEDULE";
    case "header":
      return "WOOD BEAM/HEADER SCHEDULE";
    case "holdown":
      return "METAL HOLDOWN SCHEDULE";
    case "wall-type":
      return "WALL LEGEND AND ABBREVIATIONS";
    default:
      return "PROJECT SCHEDULE";
  }
}

function subjectKindForDefinitionKind(
  kind: string,
): "wall" | "structural-member" | "other" {
  if (kind === "header") return "structural-member";
  if (kind === "shear-wall" || kind === "wall-type") return "wall";
  return "other";
}

export function assignSemanticDefinitionEvidence(
  def: SemanticDefinition,
): Evidence[] {
  const records: Evidence[] = [];
  for (const prop of def.properties) {
    const region =
      compilerBboxToSourceRegion(prop.cellBbox) ??
      compilerBboxToSourceRegion(def.sourceRegion);
    records.push(
      evidenceSchema.parse({
        id: definitionEvidenceId(def, prop.propertyPath),
        type: "schedule",
        relationship: "supports",
        description: `Schedule definition ${def.semanticTypeKey} — ${prop.propertyPath}`,
        source: {
          page: {
            documentId: null,
            pageNumber: def.sourcePageNumber,
            sheetId: null,
            sheetTitle: null,
            pageLabel: null,
            revision: null,
          },
          region,
          tileId: null,
          elementLabel: def.semanticTypeKey,
          detailNumber: null,
          sectionNumber: null,
          scheduleName: scheduleNameForDefinitionKind(def.definitionKind),
          noteReference: null,
        },
        originalText: prop.rawText,
        references: [],
        subjectKind: subjectKindForDefinitionKind(def.definitionKind),
        subjectKey: def.semanticTypeKey,
        propertyPath: prop.propertyPath,
        candidateValue: prop.candidateValue,
        extractionPassId: "b2.2l.3-definition",
        bundleId: "b2.2l.3-semantic-definition",
      }),
    );
  }
  return records;
}

type EmitBinding = {
  bindingId: string;
  physicalRunKey: string;
  referenceKey: string;
  emit: boolean;
  status: string;
  sourcePageNumber: number;
};

export function assignDereferencedBindingEvidence(
  binding: EmitBinding,
): Evidence | null {
  if (!binding.emit || binding.status !== "assigned") return null;
  return evidenceSchema.parse({
    id: `E-${binding.bindingId}`.replace(/[^A-Za-z0-9._:-]/g, "-").slice(0, 128),
    type: "tag",
    relationship: "supports",
    description: `Dereferenced semantic binding ${binding.referenceKey} → ${binding.physicalRunKey}`,
    source: {
      page: {
        documentId: null,
        pageNumber: binding.sourcePageNumber,
        sheetId: null,
        sheetTitle: null,
        pageLabel: null,
        revision: null,
      },
      region: null,
      tileId: null,
      elementLabel: binding.referenceKey,
      detailNumber: null,
      sectionNumber: null,
      scheduleName: null,
      noteReference: null,
    },
    originalText: binding.referenceKey,
    references: [
      {
        pageNumber: binding.sourcePageNumber,
        elementLabel: binding.referenceKey,
        relationship: "dereferences-to-definition",
      },
    ],
    subjectKind: "wall",
    subjectKey: binding.physicalRunKey,
    propertyPath: "semanticTypeKey",
    candidateValue: binding.referenceKey,
    extractionPassId: "b2.2l.3-dereference",
    bundleId: "b2.2l.3-semantic-binding",
  });
}

export function buildSemanticDefinitionEvidenceFromCompiledPages(
  pages: readonly CompiledDrawingPage[],
): Evidence[] {
  const evidence: Evidence[] = [];
  for (const page of pages) {
    if (!page.semanticDefinitions) continue;
    for (const def of page.semanticDefinitions.definitions) {
      evidence.push(...assignSemanticDefinitionEvidence(def));
    }
  }
  return evidence;
}

export function buildDereferencedBindingEvidence(
  pages: readonly CompiledDrawingPage[],
): Evidence[] {
  const evidence: Evidence[] = [];
  for (const page of pages) {
    if (!page.semanticDereference) continue;
    for (const binding of page.semanticDereference.bindings) {
      const rec = assignDereferencedBindingEvidence(binding);
      if (rec) evidence.push(rec);
    }
  }
  return evidence;
}
