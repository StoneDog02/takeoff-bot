import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";

import type Anthropic from "@anthropic-ai/sdk";
import type {
  ContentBlockParam,
  Message,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/messages.js";

import {
  EPHEMERAL_PROMPT_CACHE_CONTROL,
  applyEphemeralCacheToStableUserPrefix,
  buildClaudeJsonRequestParams,
  runClaudeJson,
  usageSnapshotFromMessage,
} from "../../src/ai/anthropic/runClaudeJson.js";
import { ClaudeCallLedgerRecorder } from "../../src/framing/read/claudeCallLedger.js";

function pngImageBlock(): ContentBlockParam {
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: "image/png",
      data: "aaaa",
    },
  };
}

function assistantMessage(input: {
  text: string;
  cacheCreationInputTokens?: number | null;
  cacheReadInputTokens?: number | null;
}): Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-6",
    stop_reason: "end_turn",
    stop_sequence: null,
    content: [{ type: "text", text: input.text }],
    usage: {
      input_tokens: 80_000,
      output_tokens: 40,
      cache_creation_input_tokens: input.cacheCreationInputTokens ?? null,
      cache_read_input_tokens: input.cacheReadInputTokens ?? null,
    },
  };
}

function mockAnthropicClient(
  onCreate: (params: MessageCreateParamsNonStreaming) => Message,
): Anthropic {
  return {
    messages: {
      create: async (params: MessageCreateParamsNonStreaming) => onCreate(params),
      stream: () => ({
        finalMessage: async () => {
          throw new Error("prompt-cache tests must use the non-streaming create path");
        },
      }),
    },
  } as unknown as Anthropic;
}

describe("Anthropic prompt cache (ephemeral cache_control)", () => {
  it("marks the system/brain block with ephemeral cache_control", () => {
    const params = buildClaudeJsonRequestParams({
      systemPrompt: "Construction Brain + extract rules",
      messages: [{ role: "user", content: "page text only" }],
      maxTokens: 2048,
    });
    assert.deepEqual(params.system, [
      {
        type: "text",
        text: "Construction Brain + extract rules",
        cache_control: EPHEMERAL_PROMPT_CACHE_CONTROL,
      },
    ]);
    assert.equal(params.messages[0]?.content, "page text only");
  });

  it("marks the last same-page image, not the trailing follow-up text", () => {
    const userContent: ContentBlockParam[] = [
      { type: "text", text: "## Page 3" },
      pngImageBlock(),
      pngImageBlock(),
      {
        type: "text",
        text: "This is a required-input follow-up on the SAME sheet/bundle.",
      },
    ];
    const params = buildClaudeJsonRequestParams({
      systemPrompt: "brain",
      messages: [{ role: "user", content: userContent }],
      maxTokens: 2048,
    });
    const content = params.messages[0]?.content;
    assert.ok(Array.isArray(content));
    assert.equal(content[1]?.type, "image");
    assert.equal(
      content[1] && content[1].type === "image" ? content[1].cache_control : "missing",
      undefined,
    );
    assert.equal(content[2]?.type, "image");
    assert.deepEqual(
      content[2] && content[2].type === "image" ? content[2].cache_control : undefined,
      EPHEMERAL_PROMPT_CACHE_CONTROL,
    );
    assert.equal(content[3]?.type, "text");
    assert.equal(
      content[3] && content[3].type === "text" ? content[3].cache_control : "missing",
      undefined,
    );
  });

  it("does not attach cache_control to text-only user content", () => {
    const cached = applyEphemeralCacheToStableUserPrefix("text only");
    assert.equal(cached, "text only");
    const blocks = applyEphemeralCacheToStableUserPrefix([
      { type: "text", text: "instructions" },
    ]);
    assert.ok(Array.isArray(blocks));
    assert.equal(blocks[0] && blocks[0].type === "text" ? blocks[0].cache_control : "missing", undefined);
  });

  it("mocked client request includes cache_control; usage maps cache tokens onto the ledger", async () => {
    const captured: MessageCreateParamsNonStreaming[] = [];
    const client = mockAnthropicClient((params) => {
      captured.push(params);
      return assistantMessage({
        text: '{"ok":true}',
        cacheCreationInputTokens: 50_000,
        cacheReadInputTokens: 10_000,
      });
    });

    const ledger = new ClaudeCallLedgerRecorder({
      inputUsdPerMtok: 3,
      outputUsdPerMtok: 15,
      cacheReadUsdPerMtok: 0.3,
      cacheWriteUsdPerMtok: 3.75,
    });
    const hooks = ledger.bind("extract:floor-framing");

    const result = await runClaudeJson({
      systemPrompt: "stable brain",
      userContent: [
        { type: "text", text: "## Page 3" },
        pngImageBlock(),
        { type: "text", text: "follow-up completeness instructions" },
      ],
      schema: z.object({ ok: z.boolean() }),
      label: "prompt-cache mock",
      maxTokens: 1024,
      client,
      onApiCall: hooks.onApiCall,
      onUsage: hooks.onUsage,
    });

    assert.deepEqual(result, { ok: true });
    assert.equal(captured.length, 1);

    const request = captured[0];
    assert.ok(request);
    assert.deepEqual(request.system, [
      {
        type: "text",
        text: "stable brain",
        cache_control: EPHEMERAL_PROMPT_CACHE_CONTROL,
      },
    ]);
    const content = request.messages[0]?.content;
    assert.ok(Array.isArray(content));
    const image = content.find((block) => block.type === "image");
    assert.equal(image?.type, "image");
    assert.deepEqual(
      image && image.type === "image" ? image.cache_control : undefined,
      EPHEMERAL_PROMPT_CACHE_CONTROL,
    );

    const snapshot = ledger.snapshot();
    assert.equal(snapshot.calls[0]?.cacheCreationInputTokens, 50_000);
    assert.equal(snapshot.calls[0]?.cacheReadInputTokens, 10_000);
    assert.equal(snapshot.totals.cacheCreationInputTokens, 50_000);
    assert.equal(snapshot.totals.cacheReadInputTokens, 10_000);
  });

  it("maps cache_creation_input_tokens / cache_read_input_tokens on the usage snapshot", () => {
    const usage = usageSnapshotFromMessage(
      assistantMessage({
        text: "{}",
        cacheCreationInputTokens: 72_000,
        cacheReadInputTokens: 0,
      }),
    );
    assert.equal(usage.cacheCreationInputTokens, 72_000);
    assert.equal(usage.cacheReadInputTokens, 0);
  });
});
