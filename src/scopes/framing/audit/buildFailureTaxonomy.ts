import type {
  AuditRunMode,
  FailureClass,
  FailureTaxonomy,
  FailureTaxonomyEntry,
} from "./auditMetrics.schema.js";
import type { AutomationCoverage } from "./auditMetrics.schema.js";
import type { LoadedAuditArtifacts } from "./collectFramingAuditMetrics.js";
import type { SemanticsSummary } from "./auditMetrics.schema.js";

function entry(
  partial: Omit<FailureTaxonomyEntry, "id">,
  index: number,
): FailureTaxonomyEntry {
  return { id: `failure-${index + 1}`, ...partial };
}

export function buildFailureTaxonomy(
  mode: AuditRunMode,
  artifacts: LoadedAuditArtifacts,
  automation: AutomationCoverage,
  semantics: SemanticsSummary,
): FailureTaxonomy {
  const entries: FailureTaxonomyEntry[] = [];
  let idx = 0;

  if (mode === "A0") {
    entries.push(
      entry(
        {
          failureClass: "NOT_WIRED",
          whatTryingToDetermine: "Beckstead wall lengths and assemblies",
          whatSystemKnew: "Plan index only; compiler disabled",
          whereChainStopped: "Stage 5 compiledDrawingPages (empty)",
          why: "TAKEOFF_COMPILER not enabled in A0",
          productBlocker: true,
          unlockCapability: "TAKEOFF_COMPILER=1 + TAKEOFF_COMPILER_OCR=1",
        },
        idx++,
      ),
    );
  }

  if (artifacts.compiledPages.pages.length === 0) {
    entries.push(
      entry(
        {
          failureClass: "NOT_WIRED",
          whatTryingToDetermine: "Plan geometry and dimensions",
          whatSystemKnew: "Classification and reading order",
          whereChainStopped: "Stage 5 compile",
          why: "No compiled pages in artifact",
          productBlocker: true,
          unlockCapability: "Drawing compiler with OCR page selection",
        },
        idx++,
      ),
    );
  }

  if (
    semantics.scheduleDefinitionsOnCompile > 0 &&
    semantics.evidenceByPassId["b2.2l.3-definition"] === undefined &&
    mode !== "A+"
  ) {
    entries.push(
      entry(
        {
          failureClass: "NOT_WIRED",
          whatTryingToDetermine: "Schedule row properties → wall resolution",
          whatSystemKnew: `${semantics.scheduleDefinitionsOnCompile} definitions on compiled pages`,
          whereChainStopped: "Stage 6 extractedEvidence",
          why: "buildSemanticDefinitionEvidenceFromCompiledPages not in production merge",
          productBlocker: true,
          unlockCapability: "Wire definition evidence into stage 6",
        },
        idx++,
      ),
    );
  }

  if (
    semantics.projectDictionaryBindings > 0 &&
    (semantics.evidenceByPassId["project-orientation-binding"] ?? 0) === 0
  ) {
    entries.push(
      entry(
        {
          failureClass: "NOT_WIRED",
          whatTryingToDetermine: "Shear-wall class on physical runs",
          whatSystemKnew: `${semantics.projectDictionaryBindings} governed dictionary bindings`,
          whereChainStopped: "Stage 6 → wallFraming resolution",
          why: "Project dictionary bindings do not emit Evidence records",
          productBlocker: true,
          unlockCapability: "Dictionary → Evidence bridge for established_binding",
        },
        idx++,
      ),
    );
  }

  if ((artifacts.openings?.openings.length ?? 0) === 0) {
    entries.push(
      entry(
        {
          failureClass: "MISSING_PRIMITIVE",
          whatTryingToDetermine: "Opening locations and sizes",
          whatSystemKnew: "Wall segments only",
          whereChainStopped: "openings resolver (no subjects)",
          why: "No opening subjectKind evidence without Claude extraction",
          productBlocker: true,
          unlockCapability: "Visual/Claude opening extraction or compiler opening detection",
        },
        idx++,
      ),
    );
  }

  if (automation.segmentsWithLength > 0 && automation.segmentsCalculableStuds === 0) {
    entries.push(
      entry(
        {
          failureClass: "CALCULATION_BLOCKED",
          whatTryingToDetermine: "Stud and plate quantities",
          whatSystemKnew: `${automation.segmentsWithLength} segments with length`,
          whereChainStopped: "calculateWallFraming",
          why: "assembly.studSize / studSpacingInches / plateCount unresolved",
          productBlocker: true,
          unlockCapability: "Wall assembly evidence from schedules or extraction",
        },
        idx++,
      ),
    );
  }

  if ((artifacts.floorFraming?.systems.length ?? 0) === 0) {
    entries.push(
      entry(
        {
          failureClass: "MISSING_PRIMITIVE",
          whatTryingToDetermine: "Floor joist systems and areas",
          whatSystemKnew: "Wall geometry only",
          whereChainStopped: "floorFraming resolver",
          why: "No floor-framing-system evidence",
          productBlocker: false,
          unlockCapability: "Floor framing extraction pass",
        },
        idx++,
      ),
    );
  }

  return { entries };
}

export type TopBlockerPick = {
  failureClass: FailureClass;
  summary: string;
  productImpact: string;
  rankingMethod: "dependency_aware_v1" | "first_product_blocker";
  rankedEntryId: string;
};

/**
 * Rank product blockers by material-output unlock potential when automation
 * context is available. Prefer CALCULATION_BLOCKED stud/plate when length
 * evidence exists but assembly is missing — over openings MISSING_PRIMITIVE.
 */
export function pickTopBlocker(
  taxonomy: FailureTaxonomy,
  automation?: AutomationCoverage | null,
): TopBlockerPick | null {
  const blockers = taxonomy.entries.filter((e) => e.productBlocker);
  if (blockers.length === 0) return null;

  const scored = blockers.map((b, index) => ({
    entry: b,
    index,
    score: scoreProductBlocker(b, automation ?? null),
  }));
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.index - b.index;
  });

  const top = scored[0]!;
  const usedDependency =
    automation != null &&
    automation.segmentsWithLength > 0 &&
    automation.segmentsCalculableStuds === 0;

  return {
    failureClass: top.entry.failureClass,
    summary: top.entry.whatTryingToDetermine,
    productImpact: top.entry.unlockCapability,
    rankingMethod: usedDependency
      ? "dependency_aware_v1"
      : "first_product_blocker",
    rankedEntryId: top.entry.id,
  };
}

function scoreProductBlocker(
  entry: FailureTaxonomyEntry,
  automation: AutomationCoverage | null,
): number {
  // Wiring gaps that prevent any geometry/semantics still win.
  if (entry.failureClass === "NOT_WIRED") return 1000;

  const assemblyBlocked =
    automation != null &&
    automation.segmentsWithLength > 0 &&
    automation.segmentsCalculableStuds === 0;

  if (
    assemblyBlocked &&
    entry.failureClass === "CALCULATION_BLOCKED" &&
    /stud|plate/i.test(entry.whatTryingToDetermine)
  ) {
    return 900;
  }

  if (
    entry.failureClass === "MISSING_PRIMITIVE" &&
    /opening/i.test(entry.whatTryingToDetermine)
  ) {
    // Openings matter, but not when wall lumber is already blocked upstream.
    return assemblyBlocked ? 400 : 700;
  }

  if (entry.failureClass === "CALCULATION_BLOCKED") return 600;
  if (entry.failureClass === "MISSING_PRIMITIVE") return 500;
  return 100;
}
