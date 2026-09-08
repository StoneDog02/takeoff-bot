import { z } from "zod";

import type { ClaudeUsageSnapshot } from "../../ai/anthropic/runClaudeJson.js";

/**
 * Illustrative Sonnet-class USD per million tokens for ledger estimates.
 * Override with TAKEOFF_CLAUDE_*_USD_PER_MTOK. Not an invoice.
 */
export const DEFAULT_CLAUDE_INPUT_USD_PER_MTOK = 3;
export const DEFAULT_CLAUDE_OUTPUT_USD_PER_MTOK = 15;
export const DEFAULT_CLAUDE_CACHE_READ_USD_PER_MTOK = 0.3;
export const DEFAULT_CLAUDE_CACHE_WRITE_USD_PER_MTOK = 3.75;

export const claudeCallPurposeSchema = z.string().trim().min(1);

export const claudeCallLedgerEntrySchema = z.object({
  purpose: claudeCallPurposeSchema,
  startedAt: z.string(),
  elapsedMs: z.number().nonnegative(),
  ok: z.boolean(),
  error: z.string().trim().min(1).nullable(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheCreationInputTokens: z.number().int().nonnegative().nullable(),
  cacheReadInputTokens: z.number().int().nonnegative().nullable(),
  estimatedCostUsd: z.number().nonnegative().nullable(),
});

export const claudeCallLedgerSchema = z.object({
  generatedAt: z.string(),
  rateSource:
    z.string().trim().min(1),
  calls: z.array(claudeCallLedgerEntrySchema),
  totals: z.object({
    callCount: z.number().int().nonnegative(),
    failures: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    cacheCreationInputTokens: z.number().int().nonnegative(),
    cacheReadInputTokens: z.number().int().nonnegative(),
    estimatedCostUsd: z.number().nonnegative().nullable(),
    elapsedMs: z.number().nonnegative(),
  }),
});

export type ClaudeCallLedgerEntry = z.infer<typeof claudeCallLedgerEntrySchema>;
export type ClaudeCallLedger = z.infer<typeof claudeCallLedgerSchema>;

export type ClaudeTokenRates = {
  inputUsdPerMtok: number;
  outputUsdPerMtok: number;
  cacheReadUsdPerMtok: number;
  cacheWriteUsdPerMtok: number;
};

function parseRateEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function resolveClaudeTokenRates(): ClaudeTokenRates {
  return {
    inputUsdPerMtok: parseRateEnv(
      "TAKEOFF_CLAUDE_INPUT_USD_PER_MTOK",
      DEFAULT_CLAUDE_INPUT_USD_PER_MTOK,
    ),
    outputUsdPerMtok: parseRateEnv(
      "TAKEOFF_CLAUDE_OUTPUT_USD_PER_MTOK",
      DEFAULT_CLAUDE_OUTPUT_USD_PER_MTOK,
    ),
    cacheReadUsdPerMtok: parseRateEnv(
      "TAKEOFF_CLAUDE_CACHE_READ_USD_PER_MTOK",
      DEFAULT_CLAUDE_CACHE_READ_USD_PER_MTOK,
    ),
    cacheWriteUsdPerMtok: parseRateEnv(
      "TAKEOFF_CLAUDE_CACHE_WRITE_USD_PER_MTOK",
      DEFAULT_CLAUDE_CACHE_WRITE_USD_PER_MTOK,
    ),
  };
}

export function estimateClaudeCostUsd(
  usage: ClaudeUsageSnapshot,
  rates: ClaudeTokenRates = resolveClaudeTokenRates(),
): number {
  const cacheWrite = usage.cacheCreationInputTokens ?? 0;
  const cacheRead = usage.cacheReadInputTokens ?? 0;
  const uncachedInput = Math.max(0, usage.inputTokens - cacheWrite - cacheRead);
  return (
    (uncachedInput / 1_000_000) * rates.inputUsdPerMtok +
    (usage.outputTokens / 1_000_000) * rates.outputUsdPerMtok +
    (cacheRead / 1_000_000) * rates.cacheReadUsdPerMtok +
    (cacheWrite / 1_000_000) * rates.cacheWriteUsdPerMtok
  );
}

type OpenCall = {
  purpose: string;
  startedMs: number;
};

export type ClaudeCallHooks = {
  onApiCall: () => void;
  onUsage: (usage: ClaudeUsageSnapshot) => void;
};

/**
 * Collects per-Anthropic-call purpose, tokens, latency, and estimated cost.
 */
export class ClaudeCallLedgerRecorder {
  private readonly entries: ClaudeCallLedgerEntry[] = [];
  private readonly openCalls: OpenCall[] = [];
  private readonly rates: ClaudeTokenRates;
  private readonly rateSource: string;

  constructor(rates: ClaudeTokenRates = resolveClaudeTokenRates()) {
    this.rates = rates;
    const usingEnv =
      Boolean(process.env.TAKEOFF_CLAUDE_INPUT_USD_PER_MTOK) ||
      Boolean(process.env.TAKEOFF_CLAUDE_OUTPUT_USD_PER_MTOK);
    this.rateSource = usingEnv
      ? "env TAKEOFF_CLAUDE_*_USD_PER_MTOK (illustrative estimate, not an invoice)"
      : "default illustrative Sonnet-class USD/MTok (not an invoice)";
  }

  bind(purpose: string): ClaudeCallHooks {
    return {
      onApiCall: () => {
        this.openCalls.push({ purpose, startedMs: Date.now() });
      },
      onUsage: (usage) => {
        const open = this.openCalls.shift() ?? {
          purpose,
          startedMs: Date.now(),
        };
        this.entries.push(
          claudeCallLedgerEntrySchema.parse({
            purpose: open.purpose,
            startedAt: new Date(open.startedMs).toISOString(),
            elapsedMs: Math.max(0, Date.now() - open.startedMs),
            ok: true,
            error: null,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            cacheCreationInputTokens: usage.cacheCreationInputTokens,
            cacheReadInputTokens: usage.cacheReadInputTokens,
            estimatedCostUsd: estimateClaudeCostUsd(usage, this.rates),
          }),
        );
      },
    };
  }

  recordFailure(purpose: string, error: unknown, elapsedMs = 0): void {
    const message = error instanceof Error ? error.message : String(error);
    this.entries.push(
      claudeCallLedgerEntrySchema.parse({
        purpose,
        startedAt: new Date().toISOString(),
        elapsedMs,
        ok: false,
        error: message.slice(0, 500),
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationInputTokens: null,
        cacheReadInputTokens: null,
        estimatedCostUsd: 0,
      }),
    );
  }

  snapshot(): ClaudeCallLedger {
    const failures = this.entries.filter((entry) => !entry.ok).length;
    const inputTokens = this.entries.reduce(
      (sum, entry) => sum + entry.inputTokens,
      0,
    );
    const outputTokens = this.entries.reduce(
      (sum, entry) => sum + entry.outputTokens,
      0,
    );
    const cacheCreationInputTokens = this.entries.reduce(
      (sum, entry) => sum + (entry.cacheCreationInputTokens ?? 0),
      0,
    );
    const cacheReadInputTokens = this.entries.reduce(
      (sum, entry) => sum + (entry.cacheReadInputTokens ?? 0),
      0,
    );
    const estimatedCostUsd = this.entries.reduce(
      (sum, entry) => sum + (entry.estimatedCostUsd ?? 0),
      0,
    );
    const elapsedMs = this.entries.reduce(
      (sum, entry) => sum + entry.elapsedMs,
      0,
    );

    return claudeCallLedgerSchema.parse({
      generatedAt: new Date().toISOString(),
      rateSource: this.rateSource,
      calls: this.entries,
      totals: {
        callCount: this.entries.length,
        failures,
        inputTokens,
        outputTokens,
        cacheCreationInputTokens,
        cacheReadInputTokens,
        estimatedCostUsd,
        elapsedMs,
      },
    });
  }
}
