export function resolveUseMockAi(options: {
  live: boolean;
  anthropicConfigured: boolean;
}): boolean {
  if (options.live) {
    if (!options.anthropicConfigured) {
      throw new Error(
        "ANTHROPIC_API_KEY is required for --live. Mock extraction is disabled in live mode.",
      );
    }
    return false;
  }

  return !options.anthropicConfigured;
}
