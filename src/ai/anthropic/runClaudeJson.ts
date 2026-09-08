import type Anthropic from "@anthropic-ai/sdk";
import type {
  CacheControlEphemeral,
  ContentBlockParam,
  Message,
  MessageCreateParamsNonStreaming,
  MessageParam,
  TextBlockParam,
  ThinkingConfigParam,
} from "@anthropic-ai/sdk/resources/messages.js";
import type { z } from "zod";

import { env } from "../../config/env.js";
import { parseJson } from "../../core/utils/parseJson.js";
import { validateWithSchema } from "../../core/validation/validateWithSchema.js";
import { getAnthropicClient } from "./client.js";

/** Anthropic prompt-cache breakpoint on the stable prefix (system/brain, last image). */
export const EPHEMERAL_PROMPT_CACHE_CONTROL: CacheControlEphemeral = {
  type: "ephemeral",
};

/**
 * Stage-5 structured extraction must emit JSON text. Extended/adaptive thinking
 * tokens count toward max_tokens and can terminate with thinking-only output
 * (stop_reason=max_tokens, contentTypes=[thinking]). Disable thinking by default
 * for schema-constrained JSON extraction; callers may override explicitly.
 */
export const DEFAULT_STRUCTURED_JSON_THINKING: ThinkingConfigParam = {
  type: "disabled",
};

export interface ClaudeUsageSnapshot {
  inputTokens: number;
  outputTokens: number;
  /**
   * Present when the API reports cache stats; otherwise null.
   * Thinking tokens are included in outputTokens on current Claude APIs —
   * they are not always broken out separately.
   */
  cacheCreationInputTokens: number | null;
  cacheReadInputTokens: number | null;
}

export interface RunClaudeJsonInput<T extends z.ZodTypeAny> {
  systemPrompt: string;
  /**
   * Text-only user prompt. Used when `userContent` is omitted.
   * Existing callers remain valid.
   */
  userPrompt?: string;
  /**
   * Multimodal user content (text + image blocks). When provided, takes
   * precedence over `userPrompt`.
   */
  userContent?: ContentBlockParam[];
  schema: T;
  label?: string;
  maxTokens?: number;
  /**
   * Thinking configuration. Defaults to disabled for structured JSON reliability.
   * Pass an explicit config only when a caller intentionally needs thinking.
   */
  thinking?: ThinkingConfigParam;
  /** Invoked once per Anthropic messages API call (including schema repair). */
  onApiCall?: () => void;
  /** Invoked with usage after each Anthropic messages API call when available. */
  onUsage?: (usage: ClaudeUsageSnapshot) => void;
  /**
   * Test seam. Production omits this and uses `getAnthropicClient()`.
   * Do not use to call live Anthropic from tests.
   */
  client?: Anthropic;
}

/**
 * Non-streaming requests are rejected by the SDK when max_tokens implies a
 * long-running completion. Stream whenever the budget is large enough that
 * wall-clock time may exceed the non-streaming safety threshold.
 */
const STREAM_WHEN_MAX_TOKENS_AT_LEAST = 8192;

/** Max Anthropic calls for one runClaudeJson invocation (extract + one repair). */
export const MAX_CLAUDE_JSON_API_CALLS = 2;

function resolveUserContent(input: {
  userPrompt?: string;
  userContent?: ContentBlockParam[];
}): string | ContentBlockParam[] {
  if (input.userContent && input.userContent.length > 0) {
    return input.userContent;
  }

  if (typeof input.userPrompt === "string" && input.userPrompt.length > 0) {
    return input.userPrompt;
  }

  throw new Error(
    "runClaudeJson: provide a non-empty userPrompt or userContent array.",
  );
}

export function usageSnapshotFromMessage(
  message: Message,
): ClaudeUsageSnapshot {
  const usage = message.usage;
  return {
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    cacheCreationInputTokens:
      typeof usage?.cache_creation_input_tokens === "number"
        ? usage.cache_creation_input_tokens
        : null,
    cacheReadInputTokens:
      typeof usage?.cache_read_input_tokens === "number"
        ? usage.cache_read_input_tokens
        : null,
  };
}

export function cachedSystemPromptBlocks(systemPrompt: string): TextBlockParam[] {
  return [
    {
      type: "text",
      text: systemPrompt,
      cache_control: EPHEMERAL_PROMPT_CACHE_CONTROL,
    },
  ];
}

/**
 * Marks the last image on the first user message so same-page visuals sit in
 * the cached prefix (schema repair and same-sheet follow-up when images are
 * identical through that breakpoint). Text-only user content is not marked —
 * the system/brain block is the stable prefix.
 */
export function applyEphemeralCacheToStableUserPrefix(
  content: MessageParam["content"],
): MessageParam["content"] {
  if (typeof content === "string") {
    return content;
  }

  let lastImageIndex = -1;
  for (let index = 0; index < content.length; index += 1) {
    if (content[index]?.type === "image") {
      lastImageIndex = index;
    }
  }
  if (lastImageIndex < 0) {
    return content;
  }

  return content.map((block, index) => {
    if (index !== lastImageIndex || block.type !== "image") {
      return block;
    }
    return {
      ...block,
      cache_control: EPHEMERAL_PROMPT_CACHE_CONTROL,
    };
  });
}

function withPromptCacheOnMessages(messages: MessageParam[]): MessageParam[] {
  return messages.map((message, index) => {
    if (index !== 0 || message.role !== "user") {
      return message;
    }
    return {
      ...message,
      content: applyEphemeralCacheToStableUserPrefix(message.content),
    };
  });
}

/**
 * Extracts assistant text suitable for JSON parsing. Thinking-only / empty
 * responses fail explicitly with stop_reason, content types, and usage.
 */
export function extractTextFromClaudeMessage(message: Message): string {
  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text" || textBlock.text.trim().length === 0) {
    const blockTypes =
      message.content.map((block) => block.type).join(",") || "(none)";
    const usage = usageSnapshotFromMessage(message);
    throw new Error(
      `Claude returned no text content (stop_reason=${message.stop_reason ?? "null"}, contentTypes=[${blockTypes}], input_tokens=${usage.inputTokens}, output_tokens=${usage.outputTokens})`,
    );
  }
  return textBlock.text;
}

export function buildClaudeJsonRequestParams(input: {
  systemPrompt: string;
  messages: MessageParam[];
  maxTokens: number;
  thinking?: ThinkingConfigParam;
}): Pick<
  MessageCreateParamsNonStreaming,
  "model" | "max_tokens" | "system" | "messages" | "thinking"
> {
  return {
    model: env.anthropicModel,
    max_tokens: input.maxTokens,
    system: cachedSystemPromptBlocks(input.systemPrompt),
    messages: withPromptCacheOnMessages(input.messages),
    thinking: input.thinking ?? DEFAULT_STRUCTURED_JSON_THINKING,
  };
}

async function createClaudeMessage(input: {
  systemPrompt: string;
  messages: MessageParam[];
  maxTokens: number;
  thinking?: ThinkingConfigParam;
  onApiCall?: () => void;
  onUsage?: (usage: ClaudeUsageSnapshot) => void;
  client?: Anthropic;
}): Promise<Message> {
  const client = input.client ?? getAnthropicClient();
  const params = buildClaudeJsonRequestParams(input);
  const useStream = input.maxTokens >= STREAM_WHEN_MAX_TOKENS_AT_LEAST;
  input.onApiCall?.();

  const message = useStream
    ? await client.messages.stream(params).finalMessage()
    : await client.messages.create({ ...params, stream: false });

  input.onUsage?.(usageSnapshotFromMessage(message));
  return message;
}

export async function runClaudeJson<T extends z.ZodTypeAny>(
  input: RunClaudeJsonInput<T>,
): Promise<z.infer<T>> {
  const {
    systemPrompt,
    userPrompt,
    userContent,
    schema,
    label = "Claude response",
    maxTokens = 4096,
    thinking = DEFAULT_STRUCTURED_JSON_THINKING,
    onApiCall,
    onUsage,
    client,
  } = input;

  const firstUserContent = resolveUserContent({ userPrompt, userContent });

  const firstMessage = await createClaudeMessage({
    systemPrompt,
    maxTokens,
    thinking,
    onApiCall,
    onUsage,
    client,
    messages: [{ role: "user", content: firstUserContent }],
  });
  const firstText = extractTextFromClaudeMessage(firstMessage);

  try {
    const parsed = parseJson(firstText);
    return validateWithSchema(schema, parsed, label);
  } catch (firstError) {
    // Bounded recovery: exactly one schema-repair call, then fail.
    const repairPrompt = `The previous response was invalid JSON or failed schema validation.
Return corrected JSON only. No markdown. No explanation.

Validation error:
${firstError instanceof Error ? firstError.message : String(firstError)}

Original response:
${firstText}`;

    const repairMessage = await createClaudeMessage({
      systemPrompt,
      maxTokens,
      thinking,
      onApiCall,
      onUsage,
      client,
      messages: [
        { role: "user", content: firstUserContent },
        { role: "assistant", content: firstText },
        { role: "user", content: repairPrompt },
      ],
    });
    const repairText = extractTextFromClaudeMessage(repairMessage);

    try {
      const repaired = parseJson(repairText);
      return validateWithSchema(schema, repaired, `${label} (repaired)`);
    } catch (secondError) {
      throw new Error(
        `Claude JSON validation failed after repair: ${
          secondError instanceof Error ? secondError.message : String(secondError)
        }`,
      );
    }
  }
}
