import type { PbgRun } from "../pbg/consolidatePhysicalRuns.js";
import type { TypeMarkOwnershipAssociation } from "../schemas/semanticBinding.schema.js";
import type { TypeIdentifierPrimitive } from "./detectTypeIdentifierPrimitives.js";
import { scoreMarkAgainstRuns } from "./spatialScoring.js";

export const TYPE_OWNERSHIP_UNIQUENESS_MIN = 1.5;

export function rankTypeMarkOwnership(input: {
  marks: readonly TypeIdentifierPrimitive[];
  pbgRuns: readonly PbgRun[];
}): {
  associations: TypeMarkOwnershipAssociation[];
  assignedUnique: number;
  ambiguous: number;
  rejectedCategory: number;
} {
  const associations: TypeMarkOwnershipAssociation[] = [];
  let assignedUnique = 0;
  let ambiguous = 0;
  let rejectedCategory = 0;

  for (const mark of input.marks) {
    if (mark.semanticTextCategory !== "type-or-assembly-identifier") {
      rejectedCategory++;
      associations.push({
        textPrimitiveId: mark.id,
        semanticSubjectKey: mark.semanticSubjectKey,
        semanticTextCategory: mark.semanticTextCategory,
        status: "rejected-category",
        rawText: mark.rawText,
      });
      continue;
    }

    if (mark.leaderTargetRunKey) {
      const run = input.pbgRuns.find(
        (r) => r.physicalRunKey === mark.leaderTargetRunKey,
      );
      if (run) {
        assignedUnique++;
        associations.push({
          textPrimitiveId: mark.id,
          semanticSubjectKey: mark.semanticSubjectKey,
          semanticTextCategory: mark.semanticTextCategory,
          runId: run.id,
          physicalRunKey: run.physicalRunKey,
          orientation: run.orientation,
          status: "associated",
          spatialScore: 100,
          uniquenessMargin: 2,
          normalDist: 0,
          rawText: mark.rawText,
        });
        continue;
      }
    }

    const candidates = scoreMarkAgainstRuns(mark, input.pbgRuns);
    const best = candidates[0];
    const second = candidates[1];

    if (!best) {
      associations.push({
        textPrimitiveId: mark.id,
        semanticSubjectKey: mark.semanticSubjectKey,
        semanticTextCategory: mark.semanticTextCategory,
        status: "unassociated",
        rawText: mark.rawText,
      });
      continue;
    }

    const margin = second ? best.score / Math.max(1e-6, second.score) : 99;
    const unique = margin >= TYPE_OWNERSHIP_UNIQUENESS_MIN;
    const status = unique ? ("associated" as const) : ("ambiguous" as const);
    if (unique) assignedUnique++;
    else ambiguous++;

    associations.push({
      textPrimitiveId: mark.id,
      semanticSubjectKey: mark.semanticSubjectKey,
      semanticTextCategory: mark.semanticTextCategory,
      runId: best.run.id,
      physicalRunKey: best.run.physicalRunKey,
      orientation: best.run.orientation,
      status,
      spatialScore: best.score,
      uniquenessMargin: margin,
      normalDist: best.normalDist,
      rawText: mark.rawText,
    });
  }

  return { associations, assignedUnique, ambiguous, rejectedCategory };
}
