import type { Bbox } from "./reconstructTableGridFromSegments.js";

/** Locate shear wall schedule region on S1.1-style sheets (fractional bands). */
export function locateShearWallScheduleRegion(input: {
  pageWidth: number;
  pageHeight: number;
}): Bbox {
  const { pageWidth, pageHeight } = input;
  return {
    x0: pageWidth * 0.02,
    y0: pageHeight * 0.38,
    x1: pageWidth * 0.98,
    y1: pageHeight * 0.72,
  };
}

export function locateGeneralNotesRegion(input: {
  pageWidth: number;
  pageHeight: number;
}): Bbox {
  const { pageWidth, pageHeight } = input;
  return {
    x0: pageWidth * 0.02,
    y0: pageHeight * 0.05,
    x1: pageWidth * 0.55,
    y1: pageHeight * 0.35,
  };
}
