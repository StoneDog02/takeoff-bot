import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ClaudeCallLedgerRecorder,
  DEFAULT_CLAUDE_INPUT_USD_PER_MTOK,
  DEFAULT_CLAUDE_OUTPUT_USD_PER_MTOK,
  estimateClaudeCostUsd,
} from "../../src/framing/read/claudeCallLedger.js";

describe("ClaudeCallLedgerRecorder", () => {
  it("records purpose, tokens, and estimated cost from onUsage", () => {
    const ledger = new ClaudeCallLedgerRecorder({
      inputUsdPerMtok: DEFAULT_CLAUDE_INPUT_USD_PER_MTOK,
      outputUsdPerMtok: DEFAULT_CLAUDE_OUTPUT_USD_PER_MTOK,
      cacheReadUsdPerMtok: 0.3,
      cacheWriteUsdPerMtok: 3.75,
    });
    const hooks = ledger.bind("extract:floor-framing");
    hooks.onApiCall();
    hooks.onUsage({
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheCreationInputTokens: null,
      cacheReadInputTokens: null,
    });

    const snapshot = ledger.snapshot();
    assert.equal(snapshot.totals.callCount, 1);
    assert.equal(snapshot.calls[0]?.purpose, "extract:floor-framing");
    assert.equal(snapshot.calls[0]?.ok, true);
    assert.equal(
      snapshot.calls[0]?.estimatedCostUsd,
      DEFAULT_CLAUDE_INPUT_USD_PER_MTOK + DEFAULT_CLAUDE_OUTPUT_USD_PER_MTOK,
    );
  });

  it("records cacheCreationInputTokens / cacheReadInputTokens on the snapshot", () => {
    const ledger = new ClaudeCallLedgerRecorder({
      inputUsdPerMtok: DEFAULT_CLAUDE_INPUT_USD_PER_MTOK,
      outputUsdPerMtok: DEFAULT_CLAUDE_OUTPUT_USD_PER_MTOK,
      cacheReadUsdPerMtok: 0.3,
      cacheWriteUsdPerMtok: 3.75,
    });
    const hooks = ledger.bind("extract:required-input-followup");
    hooks.onApiCall();
    hooks.onUsage({
      inputTokens: 72_000,
      outputTokens: 100,
      cacheCreationInputTokens: 60_000,
      cacheReadInputTokens: 12_000,
    });

    const snapshot = ledger.snapshot();
    assert.equal(snapshot.calls[0]?.cacheCreationInputTokens, 60_000);
    assert.equal(snapshot.calls[0]?.cacheReadInputTokens, 12_000);
    assert.equal(snapshot.totals.cacheCreationInputTokens, 60_000);
    assert.equal(snapshot.totals.cacheReadInputTokens, 12_000);
  });

  it("records failures without requiring Anthropic", () => {
    const ledger = new ClaudeCallLedgerRecorder();
    ledger.recordFailure("visual-classification", new Error("Connection error."));
    const snapshot = ledger.snapshot();
    assert.equal(snapshot.totals.failures, 1);
    assert.equal(snapshot.calls[0]?.ok, false);
    assert.match(snapshot.calls[0]?.error ?? "", /Connection error/);
  });
});

describe("estimateClaudeCostUsd", () => {
  it("uses uncached input plus cache write/read rates", () => {
    const cost = estimateClaudeCostUsd(
      {
        inputTokens: 1_200_000,
        outputTokens: 0,
        cacheCreationInputTokens: 200_000,
        cacheReadInputTokens: 100_000,
      },
      {
        inputUsdPerMtok: 3,
        outputUsdPerMtok: 15,
        cacheReadUsdPerMtok: 0.3,
        cacheWriteUsdPerMtok: 3.75,
      },
    );
    // 0.9M uncached * 3 + 0.2M write * 3.75 + 0.1M read * 0.3
    assert.equal(cost, 0.9 * 3 + 0.2 * 3.75 + 0.1 * 0.3);
  });
});
