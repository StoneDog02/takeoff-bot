/**
 * B2.2I — page-role authority from native PDF text (producer-independent).
 * Wall-plan length Evidence requires plan | unknown.
 * Elevations/sections/details are not globally useless — only this Evidence class is gated.
 * Claude=0.
 */
import type { TextPrimitive } from "../text/extractTextPrimitives.js";

export type PageRole = "plan" | "elevation" | "section" | "detail" | "unknown";

export type PageRoleResult = {
  role: PageRole;
  allowsWallPlanLengthEvidence: boolean;
  planHits: string[];
  elevationHits: string[];
  sectionHits: string[];
  detailHits: string[];
  rawItemCount: number;
  method: string;
};

const PLAN_PATTERNS: RegExp[] = [
  /\bFLOOR\s+PLAN\b/i,
  /\bFRAMING\s+PLAN\b/i,
  /\bFOUNDATION\s+PLAN\b/i,
  /\bPLAN\s+VIEW\b/i,
  /\bSITE\s+PLAN\b/i,
  /\bROOF\s+PLAN\b/i,
  /\bFIRST\s+FLOOR\b/i,
  /\bSECOND\s+FLOOR\b/i,
  /\bMAIN\s+FLOOR\b/i,
  /\bLEVEL\s+\d+\s+PLAN\b/i,
];

const ELEVATION_PATTERNS: RegExp[] = [
  /\bELEVATION\b/i,
  /\bLEFT\s+ELEVATION\b/i,
  /\bRIGHT\s+ELEVATION\b/i,
  /\bFRONT\s+ELEVATION\b/i,
  /\bREAR\s+ELEVATION\b/i,
  /\bNORTH\s+ELEVATION\b/i,
  /\bSOUTH\s+ELEVATION\b/i,
  /\bEAST\s+ELEVATION\b/i,
  /\bWEST\s+ELEVATION\b/i,
];

const SECTION_PATTERNS: RegExp[] = [/\bSECTION\b/i, /\bBLDG\s+SECTION\b/i];

const DETAIL_PATTERNS: RegExp[] = [
  /\bDETAIL\b/i,
  /\bTYPICAL\s+DETAIL\b/i,
  /\bWALL\s+DETAIL\b/i,
];

function collectHits(blob: string, patterns: RegExp[]): string[] {
  const hits: string[] = [];
  for (const p of patterns) {
    const m = blob.match(p);
    if (m) hits.push(m[0]!);
  }
  return hits;
}

/**
 * Classify page content role from native text primitives only.
 * Empty text layer → unknown (Beckstead OCR-only plans stay Evidence-eligible).
 * Non-plan roles beat plan when both present (elevation/section/detail priority).
 */
export function classifyPageRole(
  primitives: TextPrimitive[],
  opts?: { rawItemCount?: number },
): PageRoleResult {
  const rawItemCount = opts?.rawItemCount ?? primitives.length;
  const blob = primitives.map((p) => p.rawText).join(" ");

  if (rawItemCount === 0 || blob.trim().length === 0) {
    return {
      role: "unknown",
      allowsWallPlanLengthEvidence: true,
      planHits: [],
      elevationHits: [],
      sectionHits: [],
      detailHits: [],
      rawItemCount,
      method: "empty-text-layer",
    };
  }

  const planHits = collectHits(blob, PLAN_PATTERNS);
  const elevationHits = collectHits(blob, ELEVATION_PATTERNS);
  const sectionHits = collectHits(blob, SECTION_PATTERNS);
  const detailHits = collectHits(blob, DETAIL_PATTERNS);

  let role: PageRole = "unknown";
  let method = "no-role-tokens";

  // Priority: elevation / section / detail over plan when co-present
  if (elevationHits.length > 0) {
    role = "elevation";
    method = "elevation-token";
  } else if (sectionHits.length > 0) {
    role = "section";
    method = "section-token";
  } else if (detailHits.length > 0) {
    role = "detail";
    method = "detail-token";
  } else if (planHits.length > 0) {
    role = "plan";
    method = "plan-token";
  }

  const allowsWallPlanLengthEvidence = role === "plan" || role === "unknown";

  return {
    role,
    allowsWallPlanLengthEvidence,
    planHits,
    elevationHits,
    sectionHits,
    detailHits,
    rawItemCount,
    method,
  };
}

/** Production export name (B2.2J). */
export const classifyCompilerPageRole = classifyPageRole;
