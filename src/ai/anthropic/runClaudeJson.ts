import { env } from "../../config/env.js";
import { parseJson } from "../../core/utils/parseJson.js";
import { validateWithSchema } from "../../core/validation/validateWithSchema.js";
import { getAnthropicClient } from "./client.js";
import type { Message, MessageParam } from "@anthropic-ai/sdk/resources/messages.js";
import type { z } from "zod";

export interface RunClaudeJsonInput<T extends z.ZodTypeAny> {
  systemPrompt: string;
  userPrompt: string;
  schema: T;
  label?: string;
  maxTokens?: number;
}

/**
 * Non-streaming requests are rejected by the SDK when max_tokens implies a
 * long-running completion. Stream whenever the budget is large enough that
 * wall-clock time may exceed the non-streaming safety threshold.
 */
const STREAM_WHEN_MAX_TOKENS_AT_LEAST = 8192;

function extractText(message: Message): string {
  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text content");
  }
  return textBlock.text;
}

async function createClaudeMessage(input: {
  systemPrompt: string;
  messages: MessageParam[];
  maxTokens: number;
}): Promise<Message> {
  const client = getAnthropicClient();
  const useStream = input.maxTokens >= STREAM_WHEN_MAX_TOKENS_AT_LEAST;

  if (!useStream) {
    return client.messages.create({
      model: env.anthropicModel,
      max_tokens: input.maxTokens,
      system: input.systemPrompt,
      messages: input.messages,
    });
  }

  return client.messages
    .stream({
      model: env.anthropicModel,
      max_tokens: input.maxTokens,
      system: input.systemPrompt,
      messages: input.messages,
    })
    .finalMessage();
}

export async function runClaudeJson<T extends z.ZodTypeAny>(
  input: RunClaudeJsonInput<T>,
): Promise<z.infer<T>> {
  const {
    systemPrompt,
    userPrompt,
    schema,
    label = "Claude response",
    maxTokens = 4096,
  } = input;

  const firstMessage = await createClaudeMessage({
    systemPrompt,
    maxTokens,
    messages: [{ role: "user", content: userPrompt }],
  });
  const firstText = extractText(firstMessage);

  try {
    const parsed = parseJson(firstText);
    return validateWithSchema(schema, parsed, label);
  } catch (firstError) {
    const repairPrompt = `The previous response was invalid JSON or failed schema validation.
Return corrected JSON only. No markdown. No explanation.

Validation error:
${firstError instanceof Error ? firstError.message : String(firstError)}

Original response:
${firstText}`;

    const repairMessage = await createClaudeMessage({
      systemPrompt,
      maxTokens,
      messages: [
        { role: "user", content: userPrompt },
        { role: "assistant", content: firstText },
        { role: "user", content: repairPrompt },
      ],
    });
    const repairText = extractText(repairMessage);

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
