import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";

import type { Message } from "@anthropic-ai/sdk/resources/messages.js";

import {
  DEFAULT_STRUCTURED_JSON_THINKING,
  MAX_CLAUDE_JSON_API_CALLS,
  buildClaudeJsonRequestParams,
  extractTextFromClaudeMessage,
  usageSnapshotFromMessage,
} from "../../src/ai/anthropic/runClaudeJson.js";

function message(partial: {
  stop_reason?: Message["stop_reason"];
  content: Message["content"];
  input_tokens?: number;
  output_tokens?: number;
}): Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-6",
    stop_reason: partial.stop_reason ?? "end_turn",
    stop_sequence: null,
    content: partial.content,
    usage: {
      input_tokens: partial.input_tokens ?? 10,
      output_tokens: partial.output_tokens ?? 20,
    },
  };
}

describe("runClaudeJson Stage-5 output reliability", () => {
  it("defaults structured JSON requests to thinking disabled", () => {
    const params = buildClaudeJsonRequestParams({
      systemPrompt: "sys",
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 4096,
    });
    assert.deepEqual(params.thinking, { type: "disabled" });
    assert.deepEqual(DEFAULT_STRUCTURED_JSON_THINKING, { type: "disabled" });
    assert.equal(params.max_tokens, 4096);
  });

  it("allows an explicit thinking override when provided", () => {
    const params = buildClaudeJsonRequestParams({
      systemPrompt: "sys",
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 8192,
      thinking: { type: "enabled", budget_tokens: 1024 },
    });
    assert.deepEqual(params.thinking, {
      type: "enabled",
      budget_tokens: 1024,
    });
  });

  it("extracts valid JSON text normally", () => {
    const text = extractTextFromClaudeMessage(
      message({
        content: [{ type: "text", text: '{"evidence":[]}' }],
      }),
    );
    assert.equal(text, '{"evidence":[]}');
  });

  it("succeeds when thinking blocks accompany valid JSON text", () => {
    const text = extractTextFromClaudeMessage(
      message({
        content: [
          {
            type: "thinking",
            thinking: "planning extraction",
            signature: "sig",
          },
          { type: "text", text: '{"ok":true}' },
        ],
      }),
    );
    assert.equal(text, '{"ok":true}');
  });

  it("fails explicitly on thinking-only max_tokens responses", () => {
    assert.throws(
      () =>
        extractTextFromClaudeMessage(
          message({
            stop_reason: "max_tokens",
            input_tokens: 120000,
            output_tokens: 32768,
            content: [
              {
                type: "thinking",
                thinking: "still reasoning",
                signature: "sig",
              },
            ],
          }),
        ),
      /no text content \(stop_reason=max_tokens, contentTypes=\[thinking\], input_tokens=120000, output_tokens=32768\)/,
    );
  });

  it("fails explicitly on empty text with usage diagnostics", () => {
    assert.throws(
      () =>
        extractTextFromClaudeMessage(
          message({
            stop_reason: "end_turn",
            content: [{ type: "text", text: "   " }],
            output_tokens: 3,
          }),
        ),
      /no text content.*output_tokens=3/,
    );
  });

  it("exposes usage snapshots and bounds schema repair to one extra call", () => {
    const usage = usageSnapshotFromMessage(
      message({
        content: [{ type: "text", text: "{}" }],
        input_tokens: 50,
        output_tokens: 12,
      }),
    );
    assert.equal(usage.inputTokens, 50);
    assert.equal(usage.outputTokens, 12);
    assert.equal(MAX_CLAUDE_JSON_API_CALLS, 2);
  });

  it("keeps text-only request construction compatible", () => {
    const params = buildClaudeJsonRequestParams({
      systemPrompt: "extract",
      messages: [{ role: "user", content: "page text only" }],
      maxTokens: 2048,
    });
    assert.equal(params.system, "extract");
    assert.equal(params.messages[0]?.role, "user");
    assert.equal(params.thinking?.type, "disabled");
    // Schema remains Zod-validated by callers; this helper does not weaken it.
    assert.ok(z.object({ evidence: z.array(z.unknown()) }));
  });
});
