const runButton = document.getElementById("run-takeoff-btn");
const exportButton = document.getElementById("export-csv-btn");
const exportDeveloperButton = document.getElementById(
  "export-developer-run-btn",
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

/** @type {null | object} */
let currentState = null;
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

function syncDeveloperExportButton() {
  const isDeveloper = accessMode === "developer";
  exportDeveloperButton.classList.toggle("hidden", !isDeveloper);
  if (!isDeveloper) {
    exportDeveloperButton.disabled = true;
  }
}

function renderState(state) {
  currentState = state;
  workspace.classList.remove("hidden");
  emptyState.classList.add("hidden");
  exportButton.disabled = false;
  syncDeveloperExportButton();
  exportDeveloperButton.disabled = accessMode !== "developer";
  renderContractorTable(state);
  renderAssumptions(state);
  renderDeveloperDiagnostics(state);
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

void loadAccessMode();
