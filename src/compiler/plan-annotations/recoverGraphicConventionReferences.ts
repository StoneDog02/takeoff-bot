import type { Segment } from "../sgg/extractSegments.js";
import type { PbgRun } from "../pbg/consolidatePhysicalRuns.js";
import type { SemanticReferenceInstance } from "../semantic-dereference/dereferenceSemanticBindings.js";
import type { ReferenceMechanism } from "../semantic-dereference/referenceMechanism.schema.js";
import type { ProjectOrientationContext } from "../../project-reading/projectOrientationContext.js";
import { isGraphicConventionAuthorized } from "../../project-reading/projectOrientationContext.js";
import { auditPlanLineStyles } from "./auditPlanLineStyles.js";

const SHEAR_WALL_CLASS_KEY = "shear-wall";

/**
 * Legend-gated graphic convention reference recovery.
 * Emits class-level references only when orientation context authorizes graphic rules.
 */
export function recoverGraphicConventionReferences(input: {
  segments: readonly Segment[];
  pbgRuns: readonly PbgRun[];
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  orientationContext?: ProjectOrientationContext;
  referenceMechanism: ReferenceMechanism;
  maxReferences?: number;
}): {
  references: SemanticReferenceInstance[];
  metrics: {
    heavyLineNearRunCount: number;
    referencesEmitted: number;
    classLevelOnly: boolean;
  };
} {
  if (
    input.referenceMechanism !== "GRAPHIC_CONVENTION" &&
    input.referenceMechanism !== "MIXED"
  ) {
    return {
      references: [],
      metrics: {
        heavyLineNearRunCount: 0,
        referencesEmitted: 0,
        classLevelOnly: true,
      },
    };
  }

  if (!isGraphicConventionAuthorized(input.orientationContext)) {
    return {
      references: [],
      metrics: {
        heavyLineNearRunCount: 0,
        referencesEmitted: 0,
        classLevelOnly: true,
      },
    };
  }

  const audit = auditPlanLineStyles({
    segments: input.segments,
    pbgRuns: input.pbgRuns,
    pageNumber: input.pageNumber,
  });

  const runKeysSeen = new Set<string>();
  const references: SemanticReferenceInstance[] = [];
  const maxRefs = input.maxReferences ?? 8;

  for (const entry of audit.entries) {
    if (!entry.isHeavyLine || !entry.nearRunKey || entry.distancePt == null) {
      continue;
    }
    if (entry.distancePt >= 25) continue;
    if (runKeysSeen.has(entry.nearRunKey)) continue;
    runKeysSeen.add(entry.nearRunKey);

    references.push({
      referenceId: `gcref-p${input.pageNumber}-${entry.nearRunKey}`,
      referenceKey: SHEAR_WALL_CLASS_KEY,
      referenceMechanism: "GRAPHIC_CONVENTION",
      conventionClass: "heavy-linework",
      sourcePageNumber: input.pageNumber,
      sourceRegion: {
        x0: 0,
        y0: 0,
        x1: input.pageWidth,
        y1: input.pageHeight,
      },
      observationKind: "graphic-convention",
      legendProvenance: "orientation-established-rule",
      ownership: {
        physicalRunKey: entry.nearRunKey,
        authorityGrade: "B",
        method: "heavy-line-coincidence",
      },
      provenance: {
        observationId: entry.id,
        conventionEntryIds: [entry.id],
      },
    });

    if (references.length >= maxRefs) break;
  }

  return {
    references,
    metrics: {
      heavyLineNearRunCount: audit.heavyLineNearRunCount,
      referencesEmitted: references.length,
      classLevelOnly: true,
    },
  };
}
