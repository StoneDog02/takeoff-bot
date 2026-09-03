#!/usr/bin/env node
import path from "node:path";
import { resolveUseMockAi } from "./config/aiMode.js";
import { isAnthropicConfigured } from "./config/env.js";
import { logger } from "./core/logging/logger.js";
import { generateProjectId } from "./core/utils/ids.js";
import { indexPlan } from "./pdf/indexPlan.js";
import { runFramingTakeoff } from "./framing/output/runFramingTakeoff.js";

interface CliArgs {
  pdfPath: string;
  projectId: string;
  live: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let pdfPath = "./pdf/sample.pdf";
  let projectId = generateProjectId();
  let live = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--pdf" && argv[i + 1]) {
      pdfPath = argv[++i];
    } else if (arg === "--project" && argv[i + 1]) {
      projectId = argv[++i];
    } else if (arg === "--live") {
      live = true;
    } else if (arg === "--scope" && argv[i + 1]) {
      // Accepted for backward compatibility; framing is the only product.
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return { pdfPath, projectId, live };
}

function printHelp(): void {
  console.log(`
Takeoff Bot — residential framing takeoff

Usage:
  npm run dev -- --pdf <path> [--project <id>] [--live]

Options:
  --pdf               Path to plan PDF
  --project           Project ID for artifact storage (auto-generated if omitted)
  --live              Require Anthropic extraction; never fall back to mock Evidence
  --help              Show this help

Examples:
  npm run dev -- --pdf ./plans/sample.pdf
  npm run dev -- --live --pdf tests/fixtures/beckstead-residence-plans.pdf --project beckstead
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const pdfPath = path.resolve(args.pdfPath);

  let useMockAi: boolean;
  try {
    useMockAi = resolveUseMockAi({
      live: args.live,
      anthropicConfigured: isAnthropicConfigured(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Live mode requires Anthropic", { error: message });
    console.error(message);
    process.exit(1);
  }

  logger.info("Takeoff Bot starting", {
    pdfPath,
    projectId: args.projectId,
    anthropicConfigured: isAnthropicConfigured(),
    live: args.live,
    useMockAi,
  });

  const planIndex = await indexPlan(pdfPath);

  if (useMockAi) {
    logger.warn("ANTHROPIC_API_KEY not set — using mocked reader outputs");
  }

  const result = await runFramingTakeoff({
    projectId: args.projectId,
    pdfPath,
    planIndex,
    useMockAi,
    writeDebugArtifacts: true,
  });

  if (result.success && result.takeoffPath) {
    logger.info("Framing takeoff completed successfully", {
      projectId: result.projectId,
      takeoffPath: result.takeoffPath,
      materialCount: result.takeoff?.materials.length ?? 0,
    });
    console.log(`\n✓ Framing takeoff complete`);
    console.log(`  Project:  ${result.projectId}`);
    console.log(`  Takeoff:  ${result.takeoffPath}`);
    console.log(`  Materials:${result.takeoff?.materials.length ?? 0}`);
    if (result.debugPaths.length > 0) {
      console.log(`  Debug:    ${result.debugPaths.length} companion file(s)`);
    }
    return;
  }

  logger.error("Framing takeoff failed", { errors: result.errors });
  console.error(`\n✗ Framing takeoff failed`);
  for (const error of result.errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}

main().catch((error) => {
  logger.error("Unhandled error", {
    error: error instanceof Error ? error.message : String(error),
  });
  console.error(error);
  process.exit(1);
});
