import { env } from "../../config/env.js";
import { parseJson } from "../../core/utils/parseJson.js";
import { getAnthropicClient } from "./client.js";

export async function repairJson(invalidJson: string, validationError: string): Promise<unknown> {
  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: env.anthropicModel,
    max_tokens: 4096,
    system: "You repair invalid JSON. Return JSON only. No markdown. No explanation.",
    messages: [
      {
        role: "user",
        content: `Fix this JSON.

Validation error:
${validationError}

Invalid JSON:
${invalidJson}`,
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude repair returned no text content");
  }

  return parseJson(textBlock.text);
}
