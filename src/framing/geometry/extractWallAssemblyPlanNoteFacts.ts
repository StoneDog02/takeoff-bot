/**
 * Deterministic extraction of wall-assembly facts from structural plan note text.
 * Patterns are generic residential structural note language — values come from the document.
 */

export type WallAssemblyNoteFacts = {
  studSpacingInches: number | null;
  studSpacingAppliesTo: Array<"bearing" | "shear" | "braced">;
  doubleTopPlatesFor: Array<"bearing" | "exterior">;
  thicknessLegend: {
    studSize2x4Inches: number;
    studSize2x6Inches: number;
  } | null;
  sourceExcerpts: string[];
};

const SPACING_RE =
  /(?:bearing|shear|braced)[\s\S]{0,80}studs?\s+placed\s+at\s+(\d+)\s*["']?\s*(?:o\.?\s*c\.?|oc)\s*maximum/i;

const SPACING_RE_ALT =
  /studs?\s+placed\s+at\s+(\d+)\s*["']?\s*(?:o\.?\s*c\.?|oc)\s*maximum[\s\S]{0,40}(?:bearing|shear|braced)/i;

const DOUBLE_TOP_RE =
  /bearing\s+and\s+exterior\s+walls?\s+shall\s+be\s+capped\s+with\s+double\s+top\s+plates/i;

const THICKNESS_LEGEND_RE =
  /2\s*[x×]\s*4\s+walls?\s+are\s+shown\s+with\s+a\s+(\d+)\s*[-\s]*(\d+)\s*\/\s*(\d+)\s*["']?\s*thickness[\s\S]{0,80}2\s*[x×]\s*6\s+walls?\s+[^\d]{0,40}(\d+)\s*[-\s]*(\d+)\s*\/\s*(\d+)\s*["']?\s*thickness/i;

const THICKNESS_LEGEND_RE_LOOSE =
  /2\s*[x×]\s*4[\s\S]{0,40}(\d+)\s*[-\/]?\s*(\d+)?\s*\/?\s*(\d+)?\s*["']?\s*thick[\s\S]{0,60}2\s*[x×]\s*6[\s\S]{0,40}(\d+)\s*[-\/]?\s*(\d+)?\s*\/?\s*(\d+)?\s*["']?\s*thick/i;

function mixedNumberToInches(
  whole: string,
  num?: string,
  den?: string,
): number | null {
  const w = Number(whole);
  if (!Number.isFinite(w)) return null;
  if (num && den) {
    const n = Number(num);
    const d = Number(den);
    if (Number.isFinite(n) && Number.isFinite(d) && d !== 0) {
      return w + n / d;
    }
  }
  // OCR often reads 3-1/2 as 312 or 3 12
  if (!num && !den && w === 312) return 3.5;
  if (!num && !den && w === 512) return 5.5;
  return w;
}

/**
 * Normalize OCR quirks: 312 THICKNESS → 3-1/2, 5.1/2 → 5-1/2, etc.
 */
export function normalizeWallAssemblyNoteText(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/5\.1\s*\/\s*2/gi, "5-1/2")
    .replace(/3\.1\s*\/\s*2/gi, "3-1/2")
    .replace(/\b312\s+THICKNESS/gi, "3-1/2 THICKNESS")
    .replace(/\b264\s+WALLS/gi, "2x4 WALLS")
    .replace(/0\.C\./gi, "O.C.")
    .trim();
}

export function extractWallAssemblyPlanNoteFacts(
  texts: readonly string[],
): WallAssemblyNoteFacts {
  const joined = normalizeWallAssemblyNoteText(texts.filter(Boolean).join("\n"));
  const sourceExcerpts: string[] = [];

  let studSpacingInches: number | null = null;
  const studSpacingAppliesTo: Array<"bearing" | "shear" | "braced"> = [];
  const spacingMatch = SPACING_RE.exec(joined) ?? SPACING_RE_ALT.exec(joined);
  if (spacingMatch) {
    studSpacingInches = Number(spacingMatch[1]);
    studSpacingAppliesTo.push("bearing", "shear", "braced");
    sourceExcerpts.push(spacingMatch[0]!.slice(0, 200));
  }

  const doubleTopPlatesFor: Array<"bearing" | "exterior"> = [];
  const doubleMatch = DOUBLE_TOP_RE.exec(joined);
  if (doubleMatch) {
    doubleTopPlatesFor.push("bearing", "exterior");
    sourceExcerpts.push(doubleMatch[0]!.slice(0, 200));
  }

  let thicknessLegend: WallAssemblyNoteFacts["thicknessLegend"] = null;
  const legendMatch =
    THICKNESS_LEGEND_RE.exec(joined) ?? THICKNESS_LEGEND_RE_LOOSE.exec(joined);
  if (legendMatch) {
    const twoByFour = mixedNumberToInches(
      legendMatch[1]!,
      legendMatch[2],
      legendMatch[3],
    );
    const twoBySix = mixedNumberToInches(
      legendMatch[4]!,
      legendMatch[5],
      legendMatch[6],
    );
    if (twoByFour != null && twoBySix != null) {
      thicknessLegend = {
        studSize2x4Inches: twoByFour,
        studSize2x6Inches: twoBySix,
      };
      sourceExcerpts.push(legendMatch[0]!.slice(0, 200));
    }
  }

  // OCR fallback: explicit 3-1/2 / 5-1/2 near 2x4/2x6 wall wording
  if (!thicknessLegend) {
    if (
      /2\s*[x×]\s*4/i.test(joined) &&
      /2\s*[x×]\s*6/i.test(joined) &&
      (/3\s*-\s*1\s*\/\s*2/i.test(joined) || /312\s+THICKNESS/i.test(joined)) &&
      (/5\s*-\s*1\s*\/\s*2/i.test(joined) || /5\.1\s*\/\s*2/i.test(joined))
    ) {
      thicknessLegend = {
        studSize2x4Inches: 3.5,
        studSize2x6Inches: 5.5,
      };
      sourceExcerpts.push(
        "thickness legend inferred from 2x4/2x6 + 3-1/2 / 5-1/2 wording",
      );
    }
  }

  return {
    studSpacingInches: Number.isFinite(studSpacingInches)
      ? studSpacingInches
      : null,
    studSpacingAppliesTo,
    doubleTopPlatesFor,
    thicknessLegend,
    sourceExcerpts,
  };
}

export function classifyStudSizeFromThicknessInches(
  thicknessInches: number,
  legend: NonNullable<WallAssemblyNoteFacts["thicknessLegend"]>,
  toleranceInches = 0.75,
): "2x4" | "2x6" | null {
  const d4 = Math.abs(thicknessInches - legend.studSize2x4Inches);
  const d6 = Math.abs(thicknessInches - legend.studSize2x6Inches);
  if (d4 <= toleranceInches && d4 <= d6) return "2x4";
  if (d6 <= toleranceInches && d6 < d4) return "2x6";
  return null;
}
