const runButton = document.getElementById("run-takeoff-btn");
const exportButton = document.getElementById("export-csv-btn");
const exportDeveloperButton = document.getElementById(
  "export-developer-run-btn",
);
const exportBenchmarkButton = document.getElementById(
  "export-benchmark-csv-btn",
);
const pdfPathInput = document.getElementById("pdf-path-input");
const statusBanner = document.getElementById("status-banner");
const workspace = document.getElementById("workspace");
const emptyState = document.getElementById("empty-state");
const materialsBody = document.querySelector("#materials-table tbody");
const materialSummary = document.getElementById("material-summary");
const assumptionFootnote = document.getElementById("assumption-footnote");
const assumptionsPanel = document.getElementById("assumptions-panel");
const assumptionsList = document.getElementById("assumptions-list");
const developerPanel = document.getElementById("developer-panel");
const completenessSummary = document.getElementById("completeness-summary");
const runMeta = document.getElementById("run-meta");
const limitationsList = document.getElementById("limitations");
const gapMapBody = document.querySelector("#gap-map-table tbody");
const accessSubtitle = document.getElementById("access-subtitle");
const benchmarkRunMeta = document.getElementById("benchmark-run-meta");
const benchmarkError = document.getElementById("benchmark-error");
const benchmarkSummary = document.getElementById("benchmark-summary");
const benchmarkCoverage = document.querySelector("#benchmark-coverage dl");
const benchmarkAgreement = document.querySelector("#benchmark-agreement dl");
const benchmarkAgreementNote = document.querySelector(
  "#benchmark-agreement .benchmark-agreement-note",
);
const benchmarkExplainability = document.querySelector(
  "#benchmark-explainability dl",
);
const benchmarkTableBody = document.querySelector("#benchmark-table tbody");
const benchmarkRowDetail = document.getElementById("benchmark-row-detail");

/** @type {null | object} */
let currentState = null;
/** @type {null | object} */
let currentBenchmark = null;
/** @type {number} */
let selectedBenchmarkRow = -1;
/** @type {"customer" | "developer"} */
let accessMode = "customer";

function setStatus(message, isError = false) {
  statusBanner.textContent = message;
  statusBanner.classList.remove("hidden");
  statusBanner.classList.toggle("error", isError);
}

function formatUnit(unit) {
  if (unit === "each") return "pcs";
  if (unit === "linear-foot") return "LF";
  if (unit === "square-foot") return "SF";
  if (unit === "sheet") return "sheets";
  return unit;
}

function formatQuantity(quantity, unit) {
  const rounded =
    typeof quantity === "number" && Number.isFinite(quantity)
      ? Number(quantity.toFixed(4))
      : quantity;
  return `${rounded} ${formatUnit(unit)}`;
}

/**
 * Aggregate identical contractor rows for display.
 * @param {Array<object>} materials
 */
function aggregateContractorRows(materials) {
  /** @type {Map<string, { material: string, lengthOrType: string | null, quantity: number, unit: string, assumptionUsed: boolean }>} */
  const groups = new Map();
  for (const line of materials) {
    const material = line.material ?? line.description ?? "";
    const lengthOrType = line.lengthOrType ?? null;
    const unit = line.unit ?? "";
    const key = `${material}\u0000${lengthOrType ?? ""}\u0000${unit}`;
    const existing = groups.get(key);
    if (existing) {
      existing.quantity += Number(line.quantity) || 0;
      existing.assumptionUsed =
        existing.assumptionUsed || Boolean(line.assumptionUsed);
    } else {
      groups.set(key, {
        material,
        lengthOrType,
        quantity: Number(line.quantity) || 0,
        unit,
        assumptionUsed: Boolean(line.assumptionUsed),
      });
    }
  }
  return [...groups.values()].sort((a, b) => {
    const byMaterial = a.material.localeCompare(b.material);
    if (byMaterial !== 0) return byMaterial;
    return String(a.lengthOrType ?? "").localeCompare(String(b.lengthOrType ?? ""));
  });
}

function renderContractorTable(state) {
  const rows = aggregateContractorRows(state.takeoff?.materials ?? []);
  materialsBody.replaceChildren();
  let anyAssumption = false;
  for (const row of rows) {
    const tr = document.createElement("tr");
    if (row.assumptionUsed) {
      anyAssumption = true;
      tr.classList.add("assumption-row");
    }
    const materialCell = document.createElement("td");
    materialCell.textContent = row.assumptionUsed
      ? `${row.material} *`
      : row.material;
    const lengthCell = document.createElement("td");
    lengthCell.textContent = row.lengthOrType ?? "";
    const qtyCell = document.createElement("td");
    qtyCell.textContent = formatQuantity(row.quantity, row.unit);
    tr.append(materialCell, lengthCell, qtyCell);
    materialsBody.append(tr);
  }
  materialSummary.textContent = `${rows.length} contractor line${
    rows.length === 1 ? "" : "s"
  } (${state.materialCount ?? 0} source lines)`;
  assumptionFootnote.classList.toggle("hidden", !anyAssumption);
}

function renderAssumptions(state) {
  const assumptions = state.takeoff?.assumptions ?? [];
  assumptionsList.replaceChildren();
  if (assumptions.length === 0) {
    assumptionsPanel.classList.add("hidden");
    return;
  }
  assumptionsPanel.classList.remove("hidden");
  for (const assumption of assumptions) {
    const li = document.createElement("li");
    li.textContent = assumption.summary;
    assumptionsList.append(li);
  }
}

function renderDeveloperDiagnostics(state) {
  if (state.accessMode !== "developer") {
    developerPanel.classList.add("hidden");
    return;
  }
  developerPanel.classList.remove("hidden");

  const summary = state.accounting?.summary;
  if (summary) {
    completenessSummary.textContent = `Checklist ${summary.checklistItemCount}: ${summary.calculatedCount} calculated, ${summary.unaccountedCount} unaccounted (unestablished ${summary.byGapClass.applicability_unestablished}, read/input ${summary.byGapClass.read_or_input_gap}, calculator ${summary.byGapClass.calculator_gap})`;
  } else {
    completenessSummary.textContent = "No accounting summary.";
  }

  runMeta.replaceChildren();
  const metaEntries = [
    ["Project", state.projectId],
    ["PDF", state.pdfPath],
    ["Takeoff artifact", state.takeoffPath ?? "—"],
    ["Accounting artifact", state.accountingPath ?? "—"],
    ["Walls", state.takeoff?.meta?.wallCount ?? "—"],
    ["Openings", state.takeoff?.meta?.openingCount ?? "—"],
    ["Floor areas", state.takeoff?.meta?.floorAreaCount ?? "—"],
    ["Roof planes", state.takeoff?.meta?.roofPlaneCount ?? "—"],
    ["Sheathing areas", state.takeoff?.meta?.sheathingAreaCount ?? "—"],
  ];
  for (const [label, value] of metaEntries) {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = String(value);
    runMeta.append(dt, dd);
  }

  limitationsList.replaceChildren();
  for (const note of state.limitations ?? []) {
    const li = document.createElement("li");
    li.textContent = note;
    limitationsList.append(li);
  }

  gapMapBody.replaceChildren();
  const entries = state.accounting?.entries ?? [];
  for (const entry of entries) {
    const tr = document.createElement("tr");
    tr.classList.add(
      entry.status === "calculated" ? "gap-calculated" : "gap-unaccounted",
    );
    const cells = [
      entry.taxonomySectionTitle,
      entry.label,
      entry.status,
      entry.gapClass ?? "",
      entry.notes ?? entry.domainSignalSummary ?? "",
    ];
    for (const value of cells) {
      const td = document.createElement("td");
      td.textContent = value;
      tr.append(td);
    }
    gapMapBody.append(tr);
  }
}

const AGREEMENT_UNAVAILABLE_LABEL = "unavailable / not yet comparable";
const EVIDENCE_NOT_JOINED_LABEL = "unavailable / not joined";
const RELATED_NOT_COMPARED_LABEL = "related / not compared";

function formatAgreementPercent(value) {
  if (value === null || value === undefined) {
    return AGREEMENT_UNAVAILABLE_LABEL;
  }
  return `${value}%`;
}

function formatQuantityCell(value) {
  if (value === null || value === undefined) {
    return "unavailable";
  }
  return String(value);
}

function formatNullableText(value) {
  if (value === null || value === undefined || value === "") {
    return "unavailable";
  }
  return String(value);
}

function statusTone(status) {
  if (status === "MATCH") return "match";
  if (String(status).startsWith("WITHIN TARGET")) return "within";
  if (String(status).startsWith("OUTSIDE TOLERANCE")) return "outside";
  if (status === "OURS ONLY") return "ours-only";
  if (status === "NOT COMPARABLE") return "not-comparable";
  if (status === "MISSING OURS") return "missing-ours";
  return "unresolved";
}

function formatEvidencePages(pages, hop) {
  const list = Array.isArray(pages) ? pages : [];
  if (hop === "joined" && list.length > 0) {
    return list.join(" | ");
  }
  if (hop === "partial" && list.length > 0) {
    return `${list.join(" | ")} (incomplete)`;
  }
  return EVIDENCE_NOT_JOINED_LABEL;
}

function fillDl(dl, entries) {
  dl.replaceChildren();
  for (const [label, value] of entries) {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = String(value);
    dl.append(dt, dd);
  }
}

function renderBenchmarkDetail(row) {
  if (!row) {
    benchmarkRowDetail.replaceChildren();
    const p = document.createElement("p");
    p.textContent = "Select a comparison row to inspect OUR-side provenance.";
    benchmarkRowDetail.append(p);
    return;
  }
  const explanation = row.explanationRef ?? {};
  const hops = explanation.hops ?? {};
  benchmarkRowDetail.replaceChildren();
  if (explanation.relatedNotCompared) {
    const banner = document.createElement("p");
    banner.className = "benchmark-related";
    banner.textContent = RELATED_NOT_COMPARED_LABEL;
    benchmarkRowDetail.append(banner);
  }
  const heading = document.createElement("h4");
  heading.textContent = "Row provenance";
  benchmarkRowDetail.append(heading);
  const dl = document.createElement("dl");
  dl.className = "run-meta";
  fillDl(dl, [
    ["Our returned", explanation.whatWeReturned ?? "unavailable"],
    ["Burton compare", explanation.burtonCompare ?? "unavailable"],
    ["quantityKey / calcIdentity", formatNullableText(explanation.calcIdentity)],
    ["calcStatus", formatNullableText(explanation.calcStatus)],
    ["S5 status", row.s5Status ?? "unavailable"],
    ["debugSourceIds", (explanation.debugSourceIds ?? []).join(" | ") || "unavailable"],
    ["physicalIds", (explanation.physicalIds ?? []).join(" | ") || "unavailable"],
    [
      "Project pages",
      formatEvidencePages(explanation.evidencePages, hops.evidencePages),
    ],
    ["ReadComplete", hops.readComplete ?? "unavailable"],
    [
      "ReadComplete fields",
      (explanation.readCompleteFields ?? [])
        .map((field) => `${field.conditionId}:${field.propertyPath}=${field.status}`)
        .join(" | ") || "unavailable",
    ],
    [
      "HOUSE trace methods",
      (explanation.houseTraceMethods ?? []).join(" | ") || "unavailable",
    ],
    [
      "Assumption IDs",
      (explanation.assumptionIds ?? []).join(" | ") || "unavailable",
    ],
    [
      "Unresolved",
      hops.unresolved === "unavailable"
        ? "unavailable"
        : (explanation.unresolvedRecords ?? [])
            .map((record) => `${record.physicalId}:${record.propertyPath}:${record.reasonCode}`)
            .join(" | ") || "none on joined physicalIds",
    ],
    [
      "quantityLineageComplete",
      String(explanation.quantityLineageComplete ?? false),
    ],
    [
      "defensibilityEvidenceComplete",
      String(explanation.defensibilityEvidenceComplete ?? false),
    ],
    [
      "Provenance",
      explanation.provenanceIncomplete
        ? "incomplete"
        : "joined",
    ],
  ]);
  benchmarkRowDetail.append(dl);
  const hopsTitle = document.createElement("p");
  hopsTitle.textContent = `Hops: takeoffLine=${hops.takeoffLine ?? "unavailable"}; construction=${hops.construction ?? "unavailable"}; physicalId=${hops.physicalId ?? "unavailable"}; traces=${hops.traces ?? "unavailable"}; evidencePages=${hops.evidencePages ?? "unavailable"}; readComplete=${hops.readComplete ?? "unavailable"}; unresolved=${hops.unresolved ?? "unavailable"}; quantityLineage=${hops.quantityLineage ?? "unavailable"}; defensibility=${hops.defensibility ?? "unavailable"}`;
  benchmarkRowDetail.append(hopsTitle);
  const text = document.createElement("p");
  text.textContent = explanation.explanationText ?? "";
  benchmarkRowDetail.append(text);
}

function renderBenchmark(result) {
  currentBenchmark = result;
  if (!result) {
    benchmarkSummary.classList.add("hidden");
    benchmarkRunMeta.textContent =
      "Run a takeoff to load the canonical CMP + XPL grade sheet.";
    benchmarkTableBody.replaceChildren();
    renderBenchmarkDetail(null);
    return;
  }
  const coverage = result.gradeSheet.coverage;
  const agreement = result.gradeSheet.quantityAgreement;
  const explain = result.gradeSheet.explainability;
  benchmarkRunMeta.textContent = `${result.benchmarkId} ${result.benchmarkVersion} — run ${result.runId} (${result.runKind}). Three independent dimensions; no combined accuracy score.`;
  benchmarkSummary.classList.remove("hidden");
  fillDl(benchmarkCoverage, [
    ["Burton items", coverage.burtonItemCount],
    ["Burton framing families", coverage.burtonFramingFamilies.join(", ") || "unavailable"],
    ["Our Takeoff lines", coverage.ourLineCount],
    ["Missing Ours", coverage.missingOurs],
    ["Unresolved", coverage.unresolved],
    ["Ours Only", coverage.oursOnly],
    ["Not Comparable", coverage.notComparable],
  ]);
  benchmarkAgreementNote.textContent = agreement.note;
  fillDl(benchmarkAgreement, [
    ["Eligible items", agreement.eligibleItemCount],
    ["Numeric compared", agreement.numericComparedCount],
    ["Match", agreement.match],
    ["Within ±3%", agreement.withinInner3],
    ["Within ±5%", agreement.withinOuter5],
    ["Outside tolerance", agreement.outside],
    ["Match %", formatAgreementPercent(agreement.matchPercent)],
    ["Within ±3% %", formatAgreementPercent(agreement.withinInner3Percent)],
    ["Within ±5% %", formatAgreementPercent(agreement.withinOuter5Percent)],
    ["Outside %", formatAgreementPercent(agreement.outsidePercent)],
  ]);
  fillDl(benchmarkExplainability, [
    ["Rows with provenance join", explain.rowsWithProvenanceJoin],
    ["Provenance incomplete", explain.provenanceIncompleteCount],
    ["S5 not implemented", explain.s5NotImplementedCount],
    [
      "Evidence join",
      explain.evidenceJoin === "not_joined"
        ? "not joined"
        : explain.evidenceJoin,
    ],
  ]);

  benchmarkTableBody.replaceChildren();
  result.rows.forEach((row, index) => {
    const tr = document.createElement("tr");
    tr.classList.add("benchmark-row", `status-${statusTone(row.status)}`);
    if (index === selectedBenchmarkRow) {
      tr.classList.add("selected");
    }
    tr.addEventListener("click", () => {
      selectedBenchmarkRow = index;
      renderBenchmark(currentBenchmark);
    });
    const delta =
      row.absDelta === null || row.pctDelta === null
        ? "unavailable"
        : `${row.absDelta} / ${row.pctDelta}%`;
    const cells = [
      [
        row.burton?.normalizedFamily ?? "unavailable",
        row.burton?.normalizedSpec ?? row.ours?.material ?? "",
      ]
        .filter(Boolean)
        .join(" / "),
      `${formatQuantityCell(row.ours?.quantity ?? null)}${
        row.ours?.unit ? ` ${row.ours.unit}` : ""
      }`.trim(),
      row.burton
        ? `${row.burton.originalQuantity} ${row.burton.originalUnit}`
        : "unavailable",
      delta,
      row.status,
      row.diagnosticClass ?? "unavailable",
      row.explanationRef?.provenanceIncomplete
        ? "incomplete"
        : "joined",
    ];
    for (const value of cells) {
      const td = document.createElement("td");
      td.textContent = value;
      tr.append(td);
    }
    benchmarkTableBody.append(tr);
  });
  const selected = result.rows[selectedBenchmarkRow] ?? null;
  renderBenchmarkDetail(selected);
}

async function loadBenchmark(sessionId) {
  currentBenchmark = null;
  selectedBenchmarkRow = -1;
  benchmarkError.classList.add("hidden");
  if (accessMode !== "developer" || !sessionId) {
    renderBenchmark(null);
    return;
  }
  try {
    const response = await fetch(
      `/api/sessions/${encodeURIComponent(sessionId)}/beckstead-benchmark`,
    );
    if (!response.ok) {
      throw new Error(`Benchmark load failed (${response.status})`);
    }
    const result = await response.json();
    renderBenchmark(result);
  } catch (error) {
    renderBenchmark(null);
    benchmarkError.classList.remove("hidden");
    benchmarkError.textContent =
      error instanceof Error ? error.message : String(error);
  }
}

function syncDeveloperExportButton() {
  const isDeveloper = accessMode === "developer";
  exportDeveloperButton.classList.toggle("hidden", !isDeveloper);
  exportBenchmarkButton.classList.toggle("hidden", !isDeveloper);
  if (!isDeveloper) {
    exportDeveloperButton.disabled = true;
    exportBenchmarkButton.disabled = true;
  }
}

function renderState(state) {
  currentState = state;
  workspace.classList.remove("hidden");
  emptyState.classList.add("hidden");
  exportButton.disabled = false;
  syncDeveloperExportButton();
  exportDeveloperButton.disabled = accessMode !== "developer";
  exportBenchmarkButton.disabled = accessMode !== "developer";
  renderContractorTable(state);
  renderAssumptions(state);
  renderDeveloperDiagnostics(state);
  void loadBenchmark(state.sessionId);
}

function exportCsv() {
  if (!currentState?.takeoff?.materials) {
    return;
  }
  const rows = aggregateContractorRows(currentState.takeoff.materials);
  const lines = [
    "Material,Length / Type,Quantity,Unit",
    ...rows.map((row) => {
      const material = `"${String(row.material).replaceAll('"', '""')}"`;
      const lengthOrType = `"${String(row.lengthOrType ?? "").replaceAll('"', '""')}"`;
      return `${material},${lengthOrType},${row.quantity},${formatUnit(row.unit)}`;
    }),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${currentState.projectId ?? "framing"}-takeoff.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function exportDeveloperRun() {
  if (accessMode !== "developer" || !currentState) {
    setStatus("Developer export is only available in developer mode.", true);
    return;
  }
  if (!currentState.accounting || !currentState.takeoff) {
    setStatus(
      "Developer diagnostics are not loaded in this session; re-run takeoff in developer mode.",
      true,
    );
    return;
  }
  exportDeveloperButton.disabled = true;
  try {
    // Prefer in-browser developer view-state (already returned by the access-gated API).
    // Falls back to the developer-export endpoint when present (e.g. after server restart).
    let payload = null;
    if (currentState.sessionId) {
      try {
        const response = await fetch(
          `/api/sessions/${encodeURIComponent(currentState.sessionId)}/developer-export`,
        );
        if (response.ok) {
          payload = await response.json();
        }
      } catch {
        // Use local view-state below.
      }
    }
    if (!payload) {
      payload = {
        exportKind: "framing-developer-run",
        exportVersion: 1,
        exportedAt: new Date().toISOString(),
        accessMode: "developer",
        sessionId: currentState.sessionId,
        projectId: currentState.projectId,
        pdfPath: currentState.pdfPath,
        materialCount: currentState.materialCount,
        takeoffPath: currentState.takeoffPath ?? null,
        accountingPath: currentState.accountingPath ?? null,
        limitations: currentState.limitations ?? [],
        takeoff: currentState.takeoff,
        accounting: currentState.accounting,
      };
    }
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${payload.projectId ?? currentState.projectId}-developer-run.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus("Developer run export downloaded.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    exportDeveloperButton.disabled = accessMode !== "developer";
  }
}

async function exportBenchmarkCsv() {
  if (accessMode !== "developer" || !currentState?.sessionId) {
    setStatus("Benchmark CSV is only available in developer mode.", true);
    return;
  }
  exportBenchmarkButton.disabled = true;
  try {
    const response = await fetch(
      `/api/sessions/${encodeURIComponent(currentState.sessionId)}/beckstead-benchmark.csv`,
    );
    if (!response.ok) {
      throw new Error(`Benchmark CSV failed (${response.status})`);
    }
    const csv = await response.text();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "beckstead-burton-benchmark.csv";
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus("Benchmark diagnostic CSV downloaded.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    exportBenchmarkButton.disabled = accessMode !== "developer";
  }
}

async function loadAccessMode() {
  try {
    const response = await fetch("/api/access");
    if (!response.ok) {
      throw new Error(`Access probe failed (${response.status})`);
    }
    const body = await response.json();
    accessMode = body.accessMode === "developer" ? "developer" : "customer";
    accessSubtitle.textContent =
      accessMode === "developer"
        ? "Developer mode — contractor takeoff + taxonomy gap diagnostics"
        : "Customer mode — contractor takeoff only";
    syncDeveloperExportButton();
  } catch (error) {
    accessMode = "customer";
    accessSubtitle.textContent = "Customer mode (access probe unavailable)";
    syncDeveloperExportButton();
    console.warn(error);
  }
}

async function startTakeoff() {
  runButton.disabled = true;
  setStatus("Running framing takeoff…");
  try {
    const pdfPath = pdfPathInput.value.trim();
    const body = pdfPath ? { pdfPath } : {};
    const response = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? `Request failed (${response.status})`);
    }
    accessMode = payload.accessMode === "developer" ? "developer" : "customer";
    accessSubtitle.textContent =
      accessMode === "developer"
        ? "Developer mode — contractor takeoff + taxonomy gap diagnostics"
        : "Customer mode — contractor takeoff only";
    renderState(payload);
    setStatus(
      `Takeoff ready — ${payload.materialCount ?? 0} material lines (${payload.accessMode}).`,
    );
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    runButton.disabled = false;
  }
}

runButton.addEventListener("click", () => {
  void startTakeoff();
});
exportButton.addEventListener("click", exportCsv);
exportDeveloperButton.addEventListener("click", () => {
  void exportDeveloperRun();
});
exportBenchmarkButton.addEventListener("click", () => {
  void exportBenchmarkCsv();
});

void loadAccessMode();
