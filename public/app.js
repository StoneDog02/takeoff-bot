/** @typedef {import('../src/ui/framingTakeoffService.js').TakeoffViewState} TakeoffViewState */

/** @type {TakeoffViewState | null} */
let currentState = null;
/** @type {string | null} */
let selectedReviewItemId = null;

const runButton = document.querySelector("#run-takeoff-btn");
const statusBanner = document.querySelector("#status-banner");
const workspace = document.querySelector("#workspace");
const emptyState = document.querySelector("#empty-state");
const runMeta = document.querySelector("#run-meta");
const materialSummary = document.querySelector("#material-summary");
const materialsTableBody = document.querySelector("#materials-table tbody");
const reviewSummary = document.querySelector("#review-summary");
const reviewList = document.querySelector("#review-list");
const reviewDetail = document.querySelector("#review-detail");

runButton?.addEventListener("click", async () => {
  await startTakeoff();
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
    renderState();
    showBanner("Run 1 complete. Review items are loaded from the engine projection.");
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
  appendMeta("Active Run", String(state.activeRun));
  appendMeta("Pipeline Run", state.pipelineRunId);
  appendMeta("Run 1 ID", state.run1PipelineRunId);
  if (state.run2PipelineRunId) {
    appendMeta("Run 2 ID", state.run2PipelineRunId);
  }

  const summary = state.takeoff.summary;
  materialSummary.textContent = `${summary.materialLineItemCount} material lines · ${summary.openingCount} openings · ${summary.wallCount} walls`;
  renderMaterials(state);
  renderReviewItems(state);
  renderReviewDetail(state);
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
 */
function renderReviewItems(state) {
  const workspaceSummary = state.reviewWorkspace.summary;
  reviewSummary.textContent = `${workspaceSummary.activeReviewItemCount} active · ${workspaceSummary.calculatedUnderAssumptionCount} under assumption · ${workspaceSummary.resolvedByUserDecisionCount} resolved`;

  reviewList.innerHTML = "";
  for (const item of state.reviewWorkspace.items) {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = selectedReviewItemId === item.reviewItemId ? "selected" : "";
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

  if (item.calculationImpact.materialLines.length > 0) {
    const lines = item.calculationImpact.materialLines
      .map(
        (line) =>
          `${line.description}: ${line.quantity ?? "—"} ${line.unit ?? ""}`.trim(),
      )
      .join("; ");
    appendDetailBlock(reviewDetail, "Affected Materials", lines);
  }

  if (item.action.type === "provide-value" && state.activeRun === 1) {
    renderCorrectionForm(reviewDetail, item);
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
  const form = document.createElement("form");
  form.className = "correction-form";
  form.innerHTML = `
    <h3>Provide Correction</h3>
    <p>${escapeHtml(item.action.instruction)}</p>
    <label>
      Value for ${escapeHtml(item.targetProperty ?? "property")}
      <input name="value" type="number" min="1" step="1" required />
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
    const value = Number(rawValue);

    if (!Number.isFinite(value)) {
      showBanner("Enter a numeric value.", true);
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
      showBanner(
        `Run 2 complete. ${changedCount} material line(s) changed. O-002 king stud review resolved.`,
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
