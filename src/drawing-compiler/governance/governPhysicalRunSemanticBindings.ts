import type { PageRoleResultRecord } from "../schemas/governance.schema.js";
import type {
  PhysicalRunSemanticBinding,
  TypeMarkOwnershipAssociation,
} from "../schemas/semanticBinding.schema.js";
import type { PbgRun } from "../pbg/consolidatePhysicalRuns.js";

export const TYPE_OWNERSHIP_UNIQUENESS_MIN = 1.5;

type GovernableMarkAssoc = TypeMarkOwnershipAssociation & {
  spatialScore?: number;
  uniquenessMargin?: number;
};

function bindingId(pageNumber: number, physicalRunKey: string, markId: string): string {
  return `bind-p${pageNumber}-${physicalRunKey.replace(/[^A-Za-z0-9._:-]/g, "-")}-${markId}`;
}

/**
 * Govern DIRECT mark→run semantic bindings only. No propagation emit in B2.2L.
 */
export function governPhysicalRunSemanticBindings(input: {
  pageNumber: number;
  pageRole: PageRoleResultRecord;
  associations: readonly GovernableMarkAssoc[];
  pbgRuns: readonly PbgRun[];
}): {
  bindings: PhysicalRunSemanticBinding[];
  emitBindingIds: string[];
  ambiguousCount: number;
  conflictCount: number;
  rejectedCategoryCount: number;
} {
  const runByKey = new Map(input.pbgRuns.map((r) => [r.physicalRunKey, r]));
  const bindings: PhysicalRunSemanticBinding[] = [];
  const emitBindingIds: string[] = [];
  let ambiguousCount = 0;
  let conflictCount = 0;
  let rejectedCategoryCount = 0;

  const byRun = new Map<string, GovernableMarkAssoc[]>();
  for (const assoc of input.associations) {
    if (assoc.status === "rejected-category") {
      rejectedCategoryCount++;
      continue;
    }
    if (assoc.status !== "associated" || !assoc.physicalRunKey) continue;
    const list = byRun.get(assoc.physicalRunKey) ?? [];
    list.push(assoc);
    byRun.set(assoc.physicalRunKey, list);
  }

  for (const [physicalRunKey, assocs] of byRun) {
    const run = runByKey.get(physicalRunKey);
    const competingCandidates = assocs.map((a) => ({
      semanticSubjectKey: a.semanticSubjectKey,
      score: a.spatialScore ?? 0,
      reason: a.status,
    }));

    if (assocs.length > 1) {
      conflictCount++;
      for (const a of assocs) {
        bindings.push({
          bindingId: bindingId(input.pageNumber, physicalRunKey, a.textPrimitiveId),
          physicalRunKey,
          semanticSubjectKey: a.semanticSubjectKey,
          semanticTextCategory: "type-or-assembly-identifier",
          relationship: "direct-mark",
          authorityMethod: "mark-spatial-ownership",
          authorityGrade: "A",
          status: "conflict",
          emit: false,
          sourcePageNumber: input.pageNumber,
          sourceTextPrimitiveId: a.textPrimitiveId,
          spatialScore: a.spatialScore ?? null,
          uniquenessMargin: a.uniquenessMargin ?? null,
          competingCandidates,
          notes: ["multiple type identifiers on same physical run"],
        });
      }
      continue;
    }

    const assoc = assocs[0]!;
    if (!input.pageRole.allowsWallPlanLengthEvidence) {
      bindings.push({
        bindingId: bindingId(input.pageNumber, physicalRunKey, assoc.textPrimitiveId),
        physicalRunKey,
        semanticSubjectKey: assoc.semanticSubjectKey,
        semanticTextCategory: "type-or-assembly-identifier",
        relationship: "direct-mark",
        authorityMethod: "mark-spatial-ownership",
        authorityGrade: "A",
        status: "rejected",
        emit: false,
        sourcePageNumber: input.pageNumber,
        sourceTextPrimitiveId: assoc.textPrimitiveId,
        spatialScore: assoc.spatialScore ?? null,
        uniquenessMargin: assoc.uniquenessMargin ?? null,
        competingCandidates: [],
        notes: ["page-role-blocked"],
      });
      continue;
    }

    if (!run || run.wallAuthority === "reject" || run.wallAuthority === "low") {
      bindings.push({
        bindingId: bindingId(input.pageNumber, physicalRunKey, assoc.textPrimitiveId),
        physicalRunKey,
        semanticSubjectKey: assoc.semanticSubjectKey,
        semanticTextCategory: "type-or-assembly-identifier",
        relationship: "direct-mark",
        authorityMethod: "mark-spatial-ownership",
        authorityGrade: "A",
        status: "rejected",
        emit: false,
        sourcePageNumber: input.pageNumber,
        sourceTextPrimitiveId: assoc.textPrimitiveId,
        spatialScore: assoc.spatialScore ?? null,
        uniquenessMargin: assoc.uniquenessMargin ?? null,
        competingCandidates: [],
        notes: [`run-authority-${run?.wallAuthority ?? "missing"}`],
      });
      continue;
    }

    const margin = assoc.uniquenessMargin ?? 0;
    if (margin < TYPE_OWNERSHIP_UNIQUENESS_MIN) {
      ambiguousCount++;
      bindings.push({
        bindingId: bindingId(input.pageNumber, physicalRunKey, assoc.textPrimitiveId),
        physicalRunKey,
        semanticSubjectKey: assoc.semanticSubjectKey,
        semanticTextCategory: "type-or-assembly-identifier",
        relationship: "direct-mark",
        authorityMethod: "mark-spatial-ownership",
        authorityGrade: "A",
        status: "ambiguous",
        emit: false,
        sourcePageNumber: input.pageNumber,
        sourceTextPrimitiveId: assoc.textPrimitiveId,
        spatialScore: assoc.spatialScore ?? null,
        uniquenessMargin: margin,
        competingCandidates: [],
        notes: ["uniqueness-margin-below-floor"],
      });
      continue;
    }

    const grade = margin >= 2 ? "A" : "B";
    const id = bindingId(input.pageNumber, physicalRunKey, assoc.textPrimitiveId);
    bindings.push({
      bindingId: id,
      physicalRunKey,
      semanticSubjectKey: assoc.semanticSubjectKey,
      semanticTextCategory: "type-or-assembly-identifier",
      relationship: "direct-mark",
      authorityMethod:
        grade === "A" ? "mark-spatial-ownership" : "mark-enclosure-unique",
      authorityGrade: grade,
      status: "assigned",
      emit: true,
      sourcePageNumber: input.pageNumber,
      sourceTextPrimitiveId: assoc.textPrimitiveId,
      spatialScore: assoc.spatialScore ?? null,
      uniquenessMargin: margin,
      competingCandidates: [],
      notes: ["direct-governed-mark-ownership"],
    });
    emitBindingIds.push(id);
  }

  for (const assoc of input.associations) {
    if (assoc.status === "ambiguous") ambiguousCount++;
  }

  return {
    bindings,
    emitBindingIds,
    ambiguousCount,
    conflictCount,
    rejectedCategoryCount,
  };
}
