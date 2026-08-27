/** @typedef {import('../src/ui/framingTakeoffService.js').TakeoffViewState} TakeoffViewState */

/** @type {TakeoffViewState | null} */
let currentState = null;
/** @type {string | null} */
let selectedReviewItemId = null;
/** @type {string | null} */
let selectedPackageName = null;

const runButton = document.querySelector("#run-takeoff-btn");
const exportButton = document.querySelector("#export-csv-btn");
const statusBanner = document.querySelector("#status-banner");
const workspace = document.querySelector("#workspace");
const emptyState = document.querySelector("#empty-state");
const runMeta = document.querySelector("#run-meta");
const runLineage = document.querySelector("#run-lineage");
const limitationsList = document.querySelector("#limitations");
const packageSummary = document.querySelector("#package-summary");
const packageDashboard = document.querySelector("#package-dashboard");
const materialSummary = document.querySelector("#material-summary");
const materialsTableBody = document.querySelector("#materials-table tbody");
const reviewSummary = document.querySelector("#review-summary");
const reviewList = document.querySelector("#review-list");
const reviewDetail = document.querySelector("#review-detail");

runButton?.addEventListener("click", async () => {
  await startTakeoff();
});

exportButton?.addEventListener("click", () => {
  exportTakeoffCsv();
});

async function startTakeoff() {
  setBusy(true);
  hideBanner();
  try {
    const response = await fetch("/api/sessions", { method: "POST" });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? "Failed to start takeoff.");
    }
    currentState = payload;
    selectedReviewItemId = null;
    selectedPackageName = null;
    renderState();
    const runLabel =
      currentState.sessionSource === "artifact-load"
        ? "Artifact-loaded Run 1 ready."
        : "Demo Run 1 complete.";
    showBanner(`${runLabel} Review items are loaded from the engine projection.`);
  } catch (error) {
    showBanner(error instanceof Error ? error.message : String(error), true);
  } finally {
    setBusy(false);
  }
}

/**
 * @param {TakeoffViewState} state
 */
function renderState(state = currentState) {
  if (!state) {
    return;
  }

  workspace?.classList.remove("hidden");
  emptyState?.classList.add("hidden");

  runMeta.innerHTML = "";
  appendMeta("Session", state.sessionId);
  appendMeta("Project", state.projectId);
  appendMeta("Source", state.sessionSource);
  appendMeta("Active Run", String(state.activeRun));
  appendMeta("Pipeline Run", state.pipelineRunId);
  appendMeta("Run 1 ID", state.run1PipelineRunId);
  if (state.run2PipelineRunId) {
    appendMeta("Run 2 ID", state.run2PipelineRunId);
  }
  appendMeta("Replay capable", state.replayCapable ? "yes" : "no");
  if (state.sourceArtifactDir) {
    appendMeta("Loaded from", state.sourceArtifactDir);
  }

  renderRunLineage(state);
  renderLimitations(state);
  renderPackages(state);

  const summary = state.takeoff.summary;
  materialSummary.textContent = `${summary.materialLineItemCount} material lines · ${summary.openingCount} openings · ${summary.wallCount} walls`;
  renderMaterials(state);
  renderReviewItems(state);
  renderReviewDetail(state);
  setExportEnabled(true);
}

/**
 * @param {TakeoffViewState} state
 */
function renderRunLineage(state) {
  if (!runLineage) {
    return;
  }

  runLineage.innerHTML = "<h3>Run lineage</h3>";
  const list = document.createElement("ul");
  for (const run of state.runLineage.runs) {
    const li = document.createElement("li");
    li.textContent = `Run ${run.runNumber} (${run.label}): ${run.pipelineRunId}`;
    list.append(li);
  }
  runLineage.append(list);

  if (state.userDecisions.length > 0) {
    const decisions = document.createElement("p");
    decisions.textContent = `User decisions: ${state.userDecisions
      .map((decision) => `${decision.id} → review ${decision.reviewItemId}`)
      .join("; ")}`;
    runLineage.append(decisions);
  }
}

/**
 * @param {TakeoffViewState} state
 */
function renderLimitations(state) {
  if (!limitationsList) {
    return;
  }
  limitationsList.innerHTML = "";
  for (const limitation of state.limitations) {
    const li = document.createElement("li");
    li.textContent = limitation;
    limitationsList.append(li);
  }
}

/**
 * @param {TakeoffViewState} state
 */
function renderPackages(state) {
  if (!packageDashboard || !packageSummary) {
    return;
  }

  packageDashboard.innerHTML = "";

  if (state.packages.length === 0) {
    packageSummary.textContent =
      "Package product-state companion not available for this run.";
    return;
  }

  const wiredCount = state.packages.filter(
    (pkg) => pkg.productionState === "WIRED",
  ).length;
  packageSummary.textContent = `${wiredCount} wired packages · ${state.packages.length} total tracked`;

  for (const pkg of state.packages) {
    const card = document.createElement("article");
    card.className = `package-card${selectedPackageName === pkg.package ? " selected" : ""}`;
    card.innerHTML = `
      <h3>${escapeHtml(pkg.package)}</h3>
      <div class="package-badges">
        <span class="badge ${escapeHtml(pkg.displayState)}">${escapeHtml(formatDisplayState(pkg.displayState))}</span>
        ${pkg.reviewRequired ? '<span class="badge review-required">review required</span>' : ""}
      </div>
      <div class="package-stats">
        <span>Materials: ${formatCount(pkg.stage16Lines)}</span>
        <span>Objects: ${formatCount(pkg.materialized)}</span>
        <span>Resolved: ${formatCount(pkg.resolved)}</span>
        <span>Calc eligible: ${formatCount(pkg.calcEligible)}</span>
        <span>Review items: ${formatCount(pkg.review)}</span>
        <span>Blocker: ${escapeHtml(pkg.firstBrokenHandoff ?? "—")}</span>
      </div>
    `;
    card.addEventListener("click", () => {
      selectedPackageName =
        selectedPackageName === pkg.package ? null : pkg.package;
      renderPackages(state);
      renderReviewItems(state);
    });
    packageDashboard.append(card);
  }
}

function formatDisplayState(value) {
  return String(value).replaceAll("-", " ");
}

/**
 * @param {number | "N/A"} value
 */
function formatCount(value) {
  return value === "N/A" ? "N/A" : String(value);
}

function appendMeta(label, value) {
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.textContent = value;
  runMeta?.append(dt, dd);
}

/**
 * @param {TakeoffViewState} state
 */
function renderMaterials(state) {
  materialsTableBody.innerHTML = "";
  const changedIds = new Set(
    (state.materialComparison ?? []).map((entry) => entry.materialLineId),
  );

  for (const material of state.takeoff.materials) {
    const row = document.createElement("tr");
    if (changedIds.has(material.id)) {
      row.classList.add("changed");
    }

    const comparison = state.materialComparison?.find(
      (entry) => entry.materialLineId === material.id,
    );

    row.innerHTML = `
      <td>${escapeHtml(material.description)}</td>
      <td>${formatQuantity(material.quantity, comparison)}</td>
      <td>${escapeHtml(material.unit ?? "—")}</td>
      <td>${escapeHtml(material.sourceObjectIds.join(", "))}</td>
    `;
    materialsTableBody?.append(row);
  }
}

/**
 * @param {number | null | undefined} quantity
 * @param {{ run1Quantity: number | null, run2Quantity: number | null } | undefined} comparison
 */
function formatQuantity(quantity, comparison) {
  if (comparison) {
    return `${comparison.run1Quantity ?? "—"} → ${comparison.run2Quantity ?? "—"}`;
  }
  return quantity == null ? "—" : String(quantity);
}

/**
 * @param {TakeoffViewState} state
 * @param {import('../src/ui/projectProductState.js').ProductPackageViewRow} pkg
 */
function reviewItemInPackage(item, pkg) {
  const prefixes = {
    Walls: ["WALL-", "SEG-"],
    Openings: ["O-"],
    Floor: ["FFA-", "FFS-"],
    Structural: ["SM-"],
    Sheathing: ["SHA-", "SHS-"],
    Roof: ["RFP-", "RFS-"],
  }[pkg.package];
  if (!prefixes) {
    return false;
  }
  return prefixes.some((prefix) => item.objectId.startsWith(prefix));
}

/**
 * @param {TakeoffViewState} state
 */
function renderReviewItems(state) {
  const workspaceSummary = state.reviewWorkspace.summary;
  const primaryCount =
    workspaceSummary.contractorPrimaryQueueCount ??
    state.reviewWorkspace.primaryQueue?.length;
  const rawCount = workspaceSummary.activeReviewItemCount;
  const queueLabel =
    primaryCount == null
      ? `${rawCount} active`
      : `${primaryCount} primary · ${rawCount} raw`;
  const packageFilter = selectedPackageName
    ? ` · filtered: ${selectedPackageName}`
    : "";
  reviewSummary.textContent = `${queueLabel} · ${workspaceSummary.calculatedUnderAssumptionCount} under assumption · ${workspaceSummary.resolvedByUserDecisionCount} resolved${packageFilter}`;

  reviewList.innerHTML = "";

  const selectedPackage = selectedPackageName
    ? state.packages.find((pkg) => pkg.package === selectedPackageName)
    : null;

  const primaryQueue = state.reviewWorkspace.primaryQueue ?? [];
  if (primaryQueue.length > 0) {
    for (const entry of primaryQueue) {
      if (entry.kind === "governing-issue") {
        const li = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        const selected =
          selectedReviewItemId === `governing:${entry.governingGroupId}`;
        button.className = selected ? "selected" : "";
        button.innerHTML = `
          <strong>${escapeHtml(entry.title)}</strong><br />
          <span>governing · ${escapeHtml(entry.decisionReadiness)} · ${entry.affectedObjectCount} objects · ${entry.dependentReviewItemCount} reviews</span>
        `;
        button.addEventListener("click", () => {
          selectedReviewItemId = `governing:${entry.governingGroupId}`;
          renderReviewItems(state);
          renderReviewDetail(state);
        });
        li.append(button);
        reviewList?.append(li);
        continue;
      }

      if (
        selectedPackage &&
        !reviewItemInPackage(entry, selectedPackage)
      ) {
        continue;
      }

      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      const selected = selectedReviewItemId === entry.reviewItemId;
      button.className = selected ? "selected" : "";
      button.innerHTML = `
        <strong>${escapeHtml(entry.title)}</strong><br />
        <span>${escapeHtml(entry.objectId)} · ${escapeHtml(entry.targetProperty ?? "—")}</span><br />
        <span>object-specific · ${escapeHtml(entry.blockingStatus)}</span>
      `;
      button.addEventListener("click", () => {
        selectedReviewItemId = entry.reviewItemId;
        renderReviewItems(state);
        renderReviewDetail(state);
      });
      li.append(button);
      reviewList?.append(li);
    }
  } else {
    for (const item of state.reviewWorkspace.items) {
      if (selectedPackage && !reviewItemInPackage(item, selectedPackage)) {
        continue;
      }

      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className =
        selectedReviewItemId === item.reviewItemId ? "selected" : "";
      button.innerHTML = `
        <strong>${escapeHtml(item.title)}</strong><br />
        <span>${escapeHtml(item.objectId)} · ${escapeHtml(item.targetProperty ?? "—")}</span><br />
        <span>${escapeHtml(item.status.reviewStatus)} · ${escapeHtml(item.currentState.valueSource)}</span>
      `;
      button.addEventListener("click", () => {
        selectedReviewItemId = item.reviewItemId;
        renderReviewItems(state);
        renderReviewDetail(state);
      });
      li.append(button);
      reviewList?.append(li);
    }
  }

  if (state.reviewWorkspace.resolvedItems.length > 0) {
    const resolved = document.createElement("div");
    resolved.className = "resolved-list";
    resolved.innerHTML = `<h3>Resolved by User Decision</h3>`;
    const list = document.createElement("ul");
    for (const item of state.reviewWorkspace.resolvedItems) {
      const li = document.createElement("li");
      li.textContent = `${item.title} (${item.objectId}) → ${formatValue(item.calculationValueUsed)} via ${item.userDecisionId}`;
      list.append(li);
    }
    resolved.append(list);
    reviewList?.append(resolved);
  }
}

/**
 * @param {TakeoffViewState} state
 */
function renderReviewDetail(state) {
  if (!selectedReviewItemId) {
    reviewDetail.className = "review-detail empty";
    reviewDetail.textContent =
      "Select a review item to inspect provenance and impact.";
    return;
  }

  if (selectedReviewItemId.startsWith("governing:")) {
    const groupId = selectedReviewItemId.slice("governing:".length);
    const rootCause = (state.reviewWorkspace.rootCauses ?? []).find((cause) =>
      cause.governingGroups.some((group) => group.id === groupId),
    );
    const group = rootCause?.governingGroups.find((entry) => entry.id === groupId);
    if (!rootCause || !group) {
      reviewDetail.className = "review-detail empty";
      reviewDetail.textContent = "Selected governing issue is no longer active.";
      return;
    }
    reviewDetail.className = "review-detail";
    reviewDetail.innerHTML = "";
    appendDetailBlock(reviewDetail, "Governing issue", group.contractorSummary);
    appendDetailBlock(
      reviewDetail,
      "Decision readiness",
      group.decisionReadiness,
    );
    appendDetailBlock(
      reviewDetail,
      "Grouping authority",
      `${rootCause.groupingAuthority.strength} · ${rootCause.groupingAuthority.kind} · ${rootCause.groupingAuthority.key}`,
    );
    appendDetailBlock(
      reviewDetail,
      "Affected objects",
      `${group.affectedObjectCount}: ${group.affectedObjectIds.join(", ")}`,
    );
    appendDetailBlock(
      reviewDetail,
      "Dependent review items",
      group.affectedReviewItemIds.join(", "),
    );
    return;
  }

  const item = state.reviewWorkspace.items.find(
    (entry) => entry.reviewItemId === selectedReviewItemId,
  );

  if (!item) {
    reviewDetail.className = "review-detail empty";
    reviewDetail.textContent = "Selected review item is no longer active.";
    return;
  }

  reviewDetail.className = "review-detail";
  reviewDetail.innerHTML = "";

  appendDetailBlock(reviewDetail, "Reason", item.description);
  appendDetailBlock(
    reviewDetail,
    "Status",
    `${item.status.reviewStatus} · ${item.status.blockingStatus} · ${item.status.reason}`,
  );
  appendDetailBlock(
    reviewDetail,
    "Current Value",
    `${formatValue(item.currentState.resolvedPropertyValue)} (source: ${item.currentState.valueSource})`,
  );
  appendDetailBlock(
    reviewDetail,
    "Value Used in Calculation",
    formatValue(item.currentState.calculationValueUsed),
  );
  appendDetailBlock(reviewDetail, "Explanation", item.currentState.explanation);

  if (item.evidenceIds.length > 0) {
    appendDetailBlock(
      reviewDetail,
      "Evidence references",
      `${item.evidenceIds.length} record(s): ${item.evidenceIds.slice(0, 3).join(", ")}${item.evidenceIds.length > 3 ? "…" : ""}`,
    );
  }

  if (item.calculationImpact.materialLines.length > 0) {
    const lines = item.calculationImpact.materialLines
      .map(
        (line) =>
          `${line.description}: ${line.quantity ?? "—"} ${line.unit ?? ""}`.trim(),
      )
      .join("; ");
    appendDetailBlock(reviewDetail, "Affected Materials", lines);
  }

  if (item.action.type === "provide-value" && state.activeRun === 1 && state.replayCapable) {
    renderCorrectionForm(reviewDetail, item);
  } else if (item.action.type === "provide-value" && !state.replayCapable) {
    appendDetailBlock(
      reviewDetail,
      "Replay unavailable",
      "This session cannot run deterministic recalculation — replay-required artifacts are missing.",
    );
  } else if (item.action.type !== "provide-value") {
    appendDetailBlock(
      reviewDetail,
      "Action",
      `${item.action.type}: ${item.action.instruction}`,
    );
  }
}

/**
 * @param {HTMLElement} container
 * @param {import('../src/core/schemas/review-workspace.schema.js').ReviewWorkspaceItem} item
 */
function renderCorrectionForm(container, item) {
  const inputType =
    item.targetProperty === "joistLayoutLengthFeet" ||
    typeof item.currentState.resolvedPropertyValue === "number"
      ? "number"
      : "text";

  const form = document.createElement("form");
  form.className = "correction-form";
  form.innerHTML = `
    <h3>Provide Correction</h3>
    <p>${escapeHtml(item.action.instruction)}</p>
    <label>
      Value for ${escapeHtml(item.targetProperty ?? "property")}
      <input name="value" type="${inputType}" ${inputType === "number" ? 'min="0" step="any" required' : "required"} />
    </label>
    <label>
      Rationale
      <textarea name="rationale" rows="3" required></textarea>
    </label>
    <button type="submit">Save Decision &amp; Run 2</button>
  `;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentState) {
      return;
    }

    const formData = new FormData(form);
    const rawValue = formData.get("value");
    const rationale = String(formData.get("rationale") ?? "").trim();
    const value =
      inputType === "number" ? Number(rawValue) : String(rawValue ?? "").trim();

    if (inputType === "number" && !Number.isFinite(value)) {
      showBanner("Enter a valid numeric value.", true);
      return;
    }

    setBusy(true);
    hideBanner();
    try {
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(currentState.sessionId)}/decisions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reviewItemId: item.reviewItemId,
            value,
            rationale,
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to submit decision.");
      }

      currentState = payload;
      selectedReviewItemId = null;
      renderState();
      const changedCount = currentState.materialComparison?.length ?? 0;
      const floorPkg = currentState.packages.find((pkg) => pkg.package === "Floor");
      const floorLines =
        floorPkg && typeof floorPkg.stage16Lines === "number"
          ? floorPkg.stage16Lines
          : 0;
      showBanner(
        `Run 2 complete. ${changedCount} material line(s) changed. Floor package now shows ${floorLines} material line(s).`,
      );
    } catch (error) {
      showBanner(error instanceof Error ? error.message : String(error), true);
    } finally {
      setBusy(false);
    }
  });

  container.append(form);
}

function appendDetailBlock(container, title, text) {
  const block = document.createElement("div");
  block.className = "detail-block";
  block.innerHTML = `<h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p>`;
  container.append(block);
}

function setBusy(isBusy) {
  if (runButton instanceof HTMLButtonElement) {
    runButton.disabled = isBusy;
    runButton.textContent = isBusy ? "Running…" : "Run Takeoff";
  }
  if (exportButton instanceof HTMLButtonElement) {
    exportButton.disabled = isBusy || !currentState;
  }
}

function setExportEnabled(enabled) {
  if (exportButton instanceof HTMLButtonElement) {
    exportButton.disabled = !enabled;
  }
}

function exportTakeoffCsv() {
  if (!currentState) {
    showBanner("Run a takeoff before exporting.", true);
    return;
  }

  const csv = buildTakeoffExportCsv(currentState);
  downloadTextFile(
    csv,
    buildExportFilename(currentState),
    "text/csv;charset=utf-8",
  );
  showBanner("CSV export downloaded.");
}

/**
 * @param {TakeoffViewState} state
 */
function buildExportFilename(state) {
  const safeProject = state.projectId.replace(/[^a-zA-Z0-9._-]+/g, "-");
  return `${safeProject}-run${state.activeRun}-takeoff-export.csv`;
}

/**
 * @param {string} content
 * @param {string} filename
 * @param {string} mimeType
 */
function downloadTextFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * @param {unknown} value
 */
function csvCell(value) {
  if (value == null) {
    return "";
  }
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

/**
 * @param {readonly unknown[]} values
 */
function csvRow(values) {
  return values.map(csvCell).join(",");
}

/**
 * @param {TakeoffViewState} state
 */
function buildTakeoffExportCsv(state) {
  const lines = [];
  const header = [
    "section",
    "record_id",
    "title",
    "description",
    "quantity",
    "unit",
    "status",
    "blocking_status",
    "property",
    "object_id",
    "value",
    "details",
  ];
  lines.push(csvRow(header));

  const runFields = [
    ["session_id", state.sessionId],
    ["project_id", state.projectId],
    ["session_source", state.sessionSource],
    ["active_run", state.activeRun],
    ["pipeline_run_id", state.pipelineRunId],
    ["run1_pipeline_run_id", state.run1PipelineRunId],
    ["run2_pipeline_run_id", state.run2PipelineRunId ?? ""],
    ["replay_capable", state.replayCapable ? "yes" : "no"],
    ["source_artifact_dir", state.sourceArtifactDir ?? ""],
    ["pdf_path", state.pdfPath],
  ];
  for (const [name, value] of runFields) {
    lines.push(
      csvRow(["run", "", name, "", "", "", "", "", "", "", String(value), ""]),
    );
  }

  const summary = state.takeoff.summary;
  lines.push(
    csvRow([
      "summary",
      "",
      "takeoff_summary",
      "",
      summary.materialLineItemCount,
      "",
      "",
      "",
      "",
      "",
      "",
      `openings=${summary.openingCount}; walls=${summary.wallCount}`,
    ]),
  );

  const workspaceSummary = state.reviewWorkspace.summary;
  lines.push(
    csvRow([
      "review_summary",
      "",
      "review_workspace_summary",
      "",
      workspaceSummary.activeReviewItemCount,
      "",
      "",
      "",
      "",
      "",
      "",
      `primary=${workspaceSummary.contractorPrimaryQueueCount ?? ""}; under_assumption=${workspaceSummary.calculatedUnderAssumptionCount}; resolved=${workspaceSummary.resolvedByUserDecisionCount}`,
    ]),
  );

  for (const text of state.limitations) {
    lines.push(csvRow(["limitation", "", "", text, "", "", "", "", "", "", "", ""]));
  }

  for (const run of state.runLineage.runs) {
    lines.push(
      csvRow([
        "lineage",
        run.pipelineRunId,
        `run_${run.runNumber}`,
        run.label,
        run.runNumber,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ]),
    );
  }

  for (const pkg of state.packages) {
    lines.push(
      csvRow([
        "package",
        pkg.package,
        pkg.package,
        pkg.firstBrokenHandoff ?? "",
        pkg.stage16Lines,
        "",
        pkg.displayState,
        pkg.productionState,
        "",
        "",
        pkg.reviewRequired ? "yes" : "no",
        `materialized=${formatCount(pkg.materialized)}; resolved=${formatCount(pkg.resolved)}; calc_eligible=${formatCount(pkg.calcEligible)}; review=${formatCount(pkg.review)}`,
      ]),
    );
  }

  for (const material of state.takeoff.materials) {
    lines.push(
      csvRow([
        "material",
        material.id,
        "",
        material.description,
        material.quantity,
        material.unit ?? "",
        material.category,
        "",
        "",
        material.sourceObjectIds.join("; "),
        "",
        "",
      ]),
    );
  }

  for (const entry of state.materialComparison ?? []) {
    lines.push(
      csvRow([
        "comparison",
        entry.materialLineId,
        "",
        entry.description,
        entry.run2Quantity ?? "",
        entry.unit ?? "",
        "",
        "",
        "",
        "",
        `run1=${entry.run1Quantity ?? ""}; run2=${entry.run2Quantity ?? ""}`,
      ]),
    );
  }

  for (const entry of state.reviewWorkspace.primaryQueue ?? []) {
    if (entry.kind !== "governing-issue") {
      continue;
    }
    lines.push(
      csvRow([
        "governing_review",
        entry.governingGroupId,
        entry.title,
        "",
        entry.affectedObjectCount,
        "",
        entry.decisionReadiness,
        "",
        "",
        "",
        "",
        `dependent_reviews=${entry.dependentReviewItemCount}`,
      ]),
    );
  }

  for (const item of state.reviewWorkspace.items) {
    lines.push(
      csvRow([
        "review",
        item.reviewItemId,
        item.title,
        item.description,
        "",
        "",
        item.status.reviewStatus,
        item.status.blockingStatus,
        item.targetProperty ?? "",
        item.objectId,
        formatValue(item.currentState.calculationValueUsed),
        `reason=${item.status.reason}; value_source=${item.currentState.valueSource}; explanation=${item.currentState.explanation}`,
      ]),
    );
  }

  for (const item of state.reviewWorkspace.resolvedItems) {
    lines.push(
      csvRow([
        "resolved_review",
        item.reviewItemId,
        item.title,
        "",
        "",
        "",
        "resolved",
        "",
        "",
        item.objectId,
        formatValue(item.calculationValueUsed),
        `user_decision=${item.userDecisionId}`,
      ]),
    );
  }

  for (const decision of state.userDecisions) {
    const result = decision.result;
    let value = "";
    let details = result.type;
    if ("value" in result) {
      value = formatValue(result.value);
    }
    if ("rationale" in result && result.rationale) {
      details += `; rationale=${result.rationale}`;
    }
    lines.push(
      csvRow([
        "decision",
        decision.id,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        decision.reviewItemId,
        value,
        details,
      ]),
    );
  }

  return `${lines.join("\n")}\n`;
}

function showBanner(message, isError = false) {
  statusBanner?.classList.remove("hidden", "error");
  if (isError) {
    statusBanner?.classList.add("error");
  } else {
    statusBanner?.classList.remove("error");
  }
  if (statusBanner) {
    statusBanner.textContent = message;
  }
}

function hideBanner() {
  statusBanner?.classList.add("hidden");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatValue(value) {
  if (value == null) {
    return "—";
  }
  return String(value);
}
