import type { PlanIndex } from "../../pdf/PlanIndex.js";

export const EMPTY_TEXT_PAGE_FRACTION = 0.5;

export type EnvTriState = "on" | "off" | "unset";

export function envFlagTriState(name: string): EnvTriState {
  const raw = process.env[name]?.trim();
  if (raw === "1") {
    return "on";
  }
  if (raw === "0") {
    return "off";
  }
  return "unset";
}

export function planIndexEmptyTextFraction(planIndex: PlanIndex): number {
  if (planIndex.pages.length === 0) {
    return 0;
  }
  const empty = planIndex.pages.filter(
    (page) => page.textContent.trim().length === 0,
  ).length;
  return empty / planIndex.pages.length;
}

export function planIndexIsEmptyText(planIndex: PlanIndex): boolean {
  return planIndexEmptyTextFraction(planIndex) >= EMPTY_TEXT_PAGE_FRACTION;
}

function enabledByFlagOrEmptyText(flagName: string, emptyText: boolean): boolean {
  const state = envFlagTriState(flagName);
  if (state === "on") {
    return true;
  }
  if (state === "off") {
    return false;
  }
  return emptyText;
}

/**
 * Compiler runs when TAKEOFF_COMPILER=1, is skipped when =0, and otherwise
 * auto-runs on empty-text (OCR-heavy) plan sets.
 */
export function shouldRunDrawingCompiler(planIndex: PlanIndex): boolean {
  return enabledByFlagOrEmptyText(
    "TAKEOFF_COMPILER",
    planIndexIsEmptyText(planIndex),
  );
}

/**
 * Project Learning follows the same force on/off / empty-text default as compiler.
 */
export function shouldRunProjectLearning(planIndex: PlanIndex): boolean {
  return enabledByFlagOrEmptyText(
    "TAKEOFF_PROJECT_LEARNING",
    planIndexIsEmptyText(planIndex),
  );
}

/**
 * OCR empty-text compiler pages when TAKEOFF_COMPILER_OCR=1, skip when =0,
 * otherwise auto-on for empty-text plan sets.
 */
export function shouldRunCompilerOcr(planIndex: PlanIndex): boolean {
  return enabledByFlagOrEmptyText(
    "TAKEOFF_COMPILER_OCR",
    planIndexIsEmptyText(planIndex),
  );
}
