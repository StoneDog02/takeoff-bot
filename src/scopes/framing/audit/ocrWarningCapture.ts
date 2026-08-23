import { Writable } from "node:stream";

const OCR_PATTERNS = [
  /Image too small to scale/i,
  /Line cannot be recognized/i,
];

export type OcrWarningCollector = {
  warnings: string[];
  restore: () => void;
};

function inferConsumerFromMessage(
  message: string,
  env: Record<string, string | undefined>,
): string {
  if (/1x\d+|2x\d+/i.test(message)) {
    return "schedule-row-band";
  }
  if (env.TAKEOFF_SEMANTIC_MARK_RECOVERY === "1") {
    return "mark-recovery";
  }
  if (env.TAKEOFF_PROJECT_ORIENTATION === "1") {
    return "keyed-note-orientation";
  }
  if (env.TAKEOFF_SEMANTIC_DEFINITION_EXTRACTION === "1") {
    return "schedule-row-band";
  }
  if (env.TAKEOFF_COMPILER === "1") {
    return "dim-transcription";
  }
  return "unknown";
}

export function startOcrWarningCapture(
  envSnapshot: Record<string, string>,
): OcrWarningCollector {
  const warnings: string[] = [];
  const originalWrite = process.stderr.write.bind(process.stderr);

  const patchedWrite: Writable["write"] = (
    chunk,
    encodingOrCallback?,
    callback?,
  ) => {
    const text = typeof chunk === "string" ? chunk : chunk.toString();
    for (const line of text.split(/\r?\n/)) {
      if (OCR_PATTERNS.some((p) => p.test(line))) {
        warnings.push(line.trim());
      }
    }
    return originalWrite(chunk, encodingOrCallback as never, callback as never);
  };

  process.stderr.write = patchedWrite as typeof process.stderr.write;

  return {
    warnings,
    restore: () => {
      process.stderr.write = originalWrite;
    },
  };
}

export function buildOcrWarningAudit(
  warnings: readonly string[],
  envSnapshot: Record<string, string>,
  correlatedTruthMisses: readonly string[] = [],
): {
  totalWarnings: number;
  byConsumer: Record<string, number>;
  samples: Array<{
    message: string;
    consumerPath: string;
    classification: "harmless_reject" | "legitimate_miss_risk" | "unknown";
  }>;
  correlatedTruthMisses: string[];
} {
  const byConsumer: Record<string, number> = {};
  const hasCorrelatedMiss = correlatedTruthMisses.length > 0;

  const samples = warnings.slice(0, 20).map((message) => {
    const consumerPath = inferConsumerFromMessage(message, envSnapshot);
    byConsumer[consumerPath] = (byConsumer[consumerPath] ?? 0) + 1;
    const classification: "harmless_reject" | "legitimate_miss_risk" | "unknown" =
      hasCorrelatedMiss && consumerPath === "schedule-row-band"
        ? "legitimate_miss_risk"
        : hasCorrelatedMiss
          ? "unknown"
          : "harmless_reject";
    return {
      message,
      consumerPath,
      classification,
    };
  });

  for (const w of warnings.slice(20)) {
    const consumerPath = inferConsumerFromMessage(w, envSnapshot);
    byConsumer[consumerPath] = (byConsumer[consumerPath] ?? 0) + 1;
  }

  return {
    totalWarnings: warnings.length,
    byConsumer,
    samples,
    correlatedTruthMisses: [...correlatedTruthMisses],
  };
}
