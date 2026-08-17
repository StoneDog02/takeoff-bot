import Anthropic from "@anthropic-ai/sdk";
import { env } from "../../config/env.js";

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: env.anthropicApiKey });
  }
  return client;
}
