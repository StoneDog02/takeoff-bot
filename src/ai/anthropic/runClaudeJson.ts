import { env } from "../../config/env.js";
import { parseJson } from "../../core/utils/parseJson.js";
import { validateWithSchema } from "../../core/validation/validateWithSchema.js";
import { getAnthropicClient } from "./client.js";
import type { z } from "zod";

export interface RunClaudeJsonInput<T extends z.ZodTypeAny> {
  systemPrompt: string;
  userPrompt: string;
  schema: T;
  label?: string;
}

export async function runClaudeJson<T extends z.ZodTypeAny>(
  input: RunClaudeJsonInput<T>,
): Promise<z.infer<T>> {
  const { systemPrompt, userPrompt, schema, label = "Claude response" } = input;
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: env.anthropicModel,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text content");
  }

  try {
    const parsed = parseJson(textBlock.text);
    return validateWithSchema(schema, parsed, label);
  } catch (firstError) {
    const repairPrompt = `The previous response was invalid JSON or failed schema validation.
Return corrected JSON only. No markdown. No explanation.

Validation error:
${firstError instanceof Error ? firstError.message : String(firstError)}

Original response:
${textBlock.text}`;

    const repairResponse = await client.messages.create({
      model: env.anthropicModel,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        { role: "user", content: userPrompt },
        { role: "assistant", content: textBlock.text },
        { role: "user", content: repairPrompt },
      ],
    });

    const repairBlock = repairResponse.content.find((block) => block.type === "text");
    if (!repairBlock || repairBlock.type !== "text") {
      throw new Error("Claude repair attempt returned no text content");
    }

    try {
      const repaired = parseJson(repairBlock.text);
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
