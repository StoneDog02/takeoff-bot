import type {
  AuditRunMode,
  ScopeCoverage,
  ScopeCoverageRow,
} from "./auditMetrics.schema.js";
import type { LoadedAuditArtifacts } from "./collectFramingAuditMetrics.js";
import type { AutomationCoverage } from "./auditMetrics.schema.js";
import type { MaterialOutputSummary } from "./auditMetrics.schema.js";
import type { SemanticsSummary } from "./auditMetrics.schema.js";

function classForWallGeometry(artifacts: LoadedAuditArtifacts): ScopeCoverageRow {
  const segments = artifacts.wallFraming?.segments.length ?? 0;
  const lengthEvidence = artifacts.evidence.filter(
    (e) => e.propertyPath === "lengthFeet",
  ).length;
  if (segments === 0 && lengthEvidence === 0) {
    return {
      category: "Wall geometry",
      class: "E",
      whatWorks: "Nothing attempted",
      whatBlocks: "No compiler pages or no length evidence",
    };
  }
  if (lengthEvidence > 0 && segments > 0) {
    return {
      category: "Wall geometry",
      class: "B",
      whatWorks: `${lengthEvidence} length evidence; ${segments} segments resolved`,
      whatBlocks: "Not all PBG runs bound to segments with length",
    };
  }
  return {
    category: "Wall geometry",
    class: "C",
    whatWorks: `${lengthEvidence} length evidence records`,
    whatBlocks: "Segments not created or lengths unresolved",
  };
}

export function buildScopeCoverage(
  mode: AuditRunMode,
  artifacts: LoadedAuditArtifacts,
  automation: AutomationCoverage,
  materials: MaterialOutputSummary,
  semantics: SemanticsSummary,
): ScopeCoverage {
  const rows: ScopeCoverageRow[] = [
    classForWallGeometry(artifacts),
    {
      category: "Wall assemblies",
      class:
        automation.segmentsWithFullWallAssemblyForStuds > 0 ? "B" : "E",
      whatWorks:
        automation.segmentsWithFullWallAssemblyForStuds > 0
          ? `${automation.segmentsWithFullWallAssemblyForStuds} segments with stud assembly inputs`
          : "None",
      whatBlocks:
        automation.segmentsWithFullWallAssemblyForStuds > 0
          ? "Remaining walls lack thickness-classified stud size or plan-note applicability; openings still block opening framing"
          : "No stud size/spacing/plate evidence (plan notes, thickness legend, schedule, or Claude)",
    },
    {
      category: "Wall type / shear",
      class: (() => {
        const dictEvidence =
          semantics.evidenceByPassId["project-orientation-binding"] ?? 0;
        const wallsWithShear =
          artifacts.wallFraming?.walls.filter(
            (w) => w.isShearOrBraced === true,
          ).length ?? 0;
        if (wallsWithShear > 0 || semantics.wallsWithSemanticTypeKey > 0) {
          return "B";
        }
        if (dictEvidence > 0) return "C";
        return "D";
      })(),
      whatWorks: (() => {
        const dictEvidence =
          semantics.evidenceByPassId["project-orientation-binding"] ?? 0;
        const wallsWithShear =
          artifacts.wallFraming?.walls.filter(
            (w) => w.isShearOrBraced === true,
          ).length ?? 0;
        const parts: string[] = [];
        if (dictEvidence > 0) {
          parts.push(`${dictEvidence} dictionary binding evidence`);
        }
        if (wallsWithShear > 0) {
          parts.push(`${wallsWithShear} walls with shear class`);
        }
        if (semantics.wallsWithSemanticTypeKey > 0) {
          parts.push(
            `${semantics.wallsWithSemanticTypeKey} walls with semanticTypeKey`,
          );
        }
        return parts.length > 0 ? parts.join("; ") : "No governed bindings reach Evidence";
      })(),
      whatBlocks:
        "Subtype schedule properties and dereferenced bindings not wired to segment assembly",
    },
    {
      category: "Openings",
      class: (artifacts.openings?.openings.length ?? 0) > 0 ? "B" : "E",
      whatWorks:
        (artifacts.openings?.openings.length ?? 0) > 0
          ? `${artifacts.openings?.openings.length} openings`
          : "None",
      whatBlocks: "No opening evidence on Beckstead without Claude extraction",
    },
    {
      category: "Headers / structural members",
      class: (artifacts.structuralMembers?.structuralMembers.length ?? 0) > 0 ? "B" : "E",
      whatWorks:
        (artifacts.structuralMembers?.structuralMembers.length ?? 0) > 0
          ? `${artifacts.structuralMembers?.structuralMembers.length} members`
          : "None",
      whatBlocks: "No structural-member evidence",
    },
    {
      category: "Floor framing",
      class: (artifacts.floorFraming?.systems.length ?? 0) > 0 ? "B" : "E",
      whatWorks:
        (artifacts.floorFraming?.systems.length ?? 0) > 0
          ? `${artifacts.floorFraming?.systems.length} systems`
          : "None",
      whatBlocks: "No floor-framing-system evidence",
    },
    {
      category: "Roof framing",
      class: (artifacts.roofFraming?.systems.length ?? 0) > 0 ? "B" : "E",
      whatWorks:
        (artifacts.roofFraming?.systems.length ?? 0) > 0
          ? `${artifacts.roofFraming?.systems.length} systems`
          : "None",
      whatBlocks: "No roof-framing-system evidence",
    },
    {
      category: "Sheathing",
      class: (artifacts.sheathing?.systems.length ?? 0) > 0 ? "B" : "E",
      whatWorks:
        (artifacts.sheathing?.systems.length ?? 0) > 0
          ? `${artifacts.sheathing?.systems.length} systems`
          : "None",
      whatBlocks: "No sheathing-system evidence",
    },
    {
      category: "Blocking / connectors / hardware",
      class: "F",
      whatWorks: "Not in pipeline",
      whatBlocks: "No resolver stage or calculator wiring",
    },
    {
      category: "Final material list",
      class:
        materials.lineItemCount > 0
          ? automation.segmentsCalculableStuds > 0
            ? "B"
            : "C"
          : "C",
      whatWorks:
        materials.lineItemCount > 0
          ? `${materials.lineItemCount} line items (${Object.keys(materials.byCategory).join(", ")})`
          : "Pipeline completed with zero materials",
      whatBlocks:
        materials.lineItemCount === 0
          ? "Required wall assembly properties missing"
          : "Partial categories only; no sheathing/opening materials",
    },
  ];

  if (mode === "A0") {
    rows.unshift({
      category: "Pipeline baseline (A0)",
      class: "D",
      whatWorks: "Stages 1–16 execute",
      whatBlocks: "Compiler off; mock W-001 evidence irrelevant to Beckstead",
    });
  }

  return { runMode: mode, rows };
}
