#!/usr/bin/env node
import path from "node:path";
import { isAnthropicConfigured } from "./config/env.js";
import { PipelineRunner } from "./core/pipeline/PipelineRunner.js";
import { logger } from "./core/logging/logger.js";
import { generateProjectId } from "./core/utils/ids.js";
import { indexPlan } from "./plans/indexPlan.js";
import { registerScopes, scopeRegistry } from "./scopes/registry.js";

interface CliArgs {
  pdfPath: string;
  scopeName: string;
  projectId: string;
}

function parseArgs(argv: string[]): CliArgs {
  let pdfPath = "./plans/sample.pdf";
  let scopeName = "framing";
  let projectId = generateProjectId();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--pdf" && argv[i + 1]) {
      pdfPath = argv[++i];
    } else if (arg === "--scope" && argv[i + 1]) {
      scopeName = argv[++i];
    } else if (arg === "--project" && argv[i + 1]) {
      projectId = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return { pdfPath, scopeName, projectId };
}

function printHelp(): void {
  console.log(`
Takeoff Bot — scope pipeline framework

Usage:
  npm run dev -- --pdf <path> --scope <scope> [--project <id>]

Options:
  --pdf       Path to plan PDF (mocked page text for now)
  --scope     Scope name (framing, concrete, ...)
  --project   Project ID for artifact storage (auto-generated if omitted)
  --help      Show this help

Examples:
  npm run dev -- --pdf ./plans/sample.pdf --scope framing
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const pdfPath = path.resolve(args.pdfPath);

  registerScopes();

  logger.info("Takeoff Bot starting", {
    pdfPath,
    scope: args.scopeName,
    projectId: args.projectId,
    anthropicConfigured: isAnthropicConfigured(),
    availableScopes: scopeRegistry.list(),
  });

  const scope = scopeRegistry.get(args.scopeName);
  const planIndex = await indexPlan(pdfPath);
  const useMockAi = !isAnthropicConfigured();

  if (useMockAi) {
    logger.warn("ANTHROPIC_API_KEY not set — using mocked stage outputs");
  }

  const runner = new PipelineRunner();
  const result = await runner.run({
    projectId: args.projectId,
    pdfPath,
    scopeName: args.scopeName,
    planIndex,
    useMockAi,
    stages: scope.stages,
  });

  if (result.success) {
    logger.info("Pipeline completed successfully", {
      projectId: result.projectId,
      reportPath: result.reportPath,
      stagesRun: result.stageResults.length,
    });
    console.log(`\n✓ Pipeline complete`);
    console.log(`  Project:  ${result.projectId}`);
    console.log(`  Scope:    ${result.scopeName}`);
    console.log(`  Report:   ${result.reportPath}`);
    console.log(`  Stages:   ${result.stageResults.length}`);
  } else {
    logger.error("Pipeline failed", { errors: result.errors });
    console.error(`\n✗ Pipeline failed`);
    for (const error of result.errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error("Unhandled error", {
    error: error instanceof Error ? error.message : String(error),
  });
  console.error(error);
  process.exit(1);
});
