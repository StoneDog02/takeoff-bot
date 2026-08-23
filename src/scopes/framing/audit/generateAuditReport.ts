import type { AuditSummary } from "./auditMetrics.schema.js";
import type { AutomationCoverage } from "./auditMetrics.schema.js";
import type { FailureTaxonomy } from "./auditMetrics.schema.js";
import type { GeometrySummary } from "./auditMetrics.schema.js";
import type { MaterialOutputSummary } from "./auditMetrics.schema.js";
import type { ScopeCoverage } from "./auditMetrics.schema.js";
import type { SemanticsSummary } from "./auditMetrics.schema.js";
import { pickTopBlocker } from "./buildFailureTaxonomy.js";

export function generateAuditReportMarkdown(input: {
  summaries: AuditSummary[];
  scopeByMode: ScopeCoverage[];
  failureTaxonomy: FailureTaxonomy;
  geometry: GeometrySummary | null;
  materials: MaterialOutputSummary | null;
  automation: AutomationCoverage | null;
  semantics: SemanticsSummary | null;
  reviewWorkspace?: { activeReviewItems: number; resolvedByDecision: number } | null;
}): string {
  const topBlocker = pickTopBlocker(input.failureTaxonomy, input.automation);

  const lines: string[] = [
    "# B2.2M — Full Framing Takeoff Audit #1",
    "",
    "## Executive summary",
    "",
    "> If we sold this today, how much of Beckstead's framing takeoff would actually work?",
    "",
    "This audit measures the **production framing pipeline** against Beckstead (`beckstead-residence-plans.pdf`). It does **not** require a complete correct takeoff to pass.",
    "",
    "### Run modes",
    "",
    "| Mode | Description |",
    "|------|-------------|",
    "| A0 | Customer default: no compiler flags; mock W-001 if no API key |",
    "| A | Max deterministic: all compiler/orientation flags; compiler-only evidence |",
    "| A+ | Diagnostic: A + unwired definition/dereference evidence builders |",
    "| B | Live Claude extraction (optional, capped) |",
    "",
  ];

  if (topBlocker) {
    lines.push(
      "### Highest-impact blocker",
      "",
      `- **${topBlocker.failureClass}**: ${topBlocker.summary}`,
      `- Unlock: ${topBlocker.productImpact}`,
      `- Ranking: ${topBlocker.rankingMethod}`,
      "",
    );
  }

  lines.push(
    "## Scorecard",
    "",
    "| Scope | Status | What works | What blocks completion |",
    "|-------|--------|------------|------------------------|",
  );

  const primaryScope =
    input.scopeByMode.find((s) => s.runMode === "A") ??
    input.scopeByMode[0];
  if (primaryScope) {
    for (const row of primaryScope.rows) {
      if (row.category.startsWith("Pipeline baseline")) continue;
      lines.push(
        `| ${row.category} | ${row.class} | ${row.whatWorks} | ${row.whatBlocks} |`,
      );
    }
  }

  lines.push("", "## Run results", "");
  for (const s of input.summaries) {
    lines.push(
      `### ${s.runMode}`,
      `- Pipeline success: ${s.pipelineSuccess}`,
      `- Failed stages: ${s.failedStages.join(", ") || "none"}`,
      `- Top blocker: ${s.topBlocker?.summary ?? "none identified"}`,
      "",
    );
  }

  if (input.reviewWorkspace) {
    lines.push(
      "## Unresolved / review",
      `- Active review items: ${input.reviewWorkspace.activeReviewItems}`,
      `- Resolved by user decision: ${input.reviewWorkspace.resolvedByDecision}`,
      "",
    );
  }

  const allGroundTruth = [
    ...(input.geometry?.groundTruthChecks ?? []),
    ...(input.semantics?.groundTruthChecks ?? []),
  ];
  if (allGroundTruth.length > 0) {
    lines.push("## Ground truth checks", "");
    for (const c of allGroundTruth) {
      lines.push(`- **${c.checkId}**: ${c.label} — ${c.detail}`);
    }
    lines.push("");
  }

  if (input.materials) {
    lines.push(
      "## Material output",
      `- Line items: ${input.materials.lineItemCount}`,
      `- Categories present: ${Object.keys(input.materials.byCategory).join(", ") || "none"}`,
      "",
    );
  }

  if (input.automation) {
    lines.push(
      "## Automation coverage (explainable)",
      `- ${input.automation.denominatorExplanation}`,
      `- Segments with length: ${input.automation.segmentsWithLength}`,
      `- Segments calculable (studs): ${input.automation.segmentsCalculableStuds}`,
      "",
    );
  }

  if (input.semantics) {
    lines.push(
      "## Semantics",
      `- Schedule defs on compile: ${input.semantics.scheduleDefinitionsOnCompile}`,
      `- Dictionary bindings: ${input.semantics.projectDictionaryBindings}`,
      `- Walls with semanticTypeKey: ${input.semantics.wallsWithSemanticTypeKey}`,
      "",
    );
  }

  lines.push("## Top failure taxonomy entries", "");
  for (const e of input.failureTaxonomy.entries.slice(0, 8)) {
    lines.push(
      `### ${e.failureClass}: ${e.whatTryingToDetermine}`,
      `- Stopped at: ${e.whereChainStopped}`,
      `- Why: ${e.why}`,
      `- Unlock: ${e.unlockCapability}`,
      "",
    );
  }

  lines.push(
    "## Audit #1 GREEN criteria",
    "",
    "1. What the system produces — documented per run mode",
    "2. Verified correct outputs — geometry truth checks where available",
    "3. Unresolved — review items and null resolutions",
    "4. Missing capabilities — blocking/connectors, unwired evidence bridges",
    "5. Blocked calculations — stud/plate when assembly missing",
    "6. Material list today — line item summary",
    "7. Highest-impact blocker — top failure taxonomy entry",
    "8. Next build target — see unlockCapability on top blocker",
    "",
    "## Recommended next milestone",
    "",
    "Address the top **NOT_WIRED** or **MISSING_PRIMITIVE** blocker before opening another isolated semantic micro-milestone. Use Research Escalation SOP on that primitive only.",
  );

  return lines.join("\n");
}
