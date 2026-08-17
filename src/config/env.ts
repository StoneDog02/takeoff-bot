import dotenv from "dotenv";

dotenv.config();

export const env = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
} as const;

export function isAnthropicConfigured(): boolean {
  return env.anthropicApiKey.length > 0;
}
