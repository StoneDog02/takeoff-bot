/**
 * Net regular-stud deduction helpers per `knowledge/framing/13-opening-wall-framing-calculations.md`.
 */

/** Baseline regularly spaced stud count for one wall segment. */
export function countRegularlySpacedStuds(
  lengthFeet: number,
  spacingInches: number,
): number {
  return Math.ceil((lengthFeet * 12) / spacingInches) + 1;
}

/** Layout positions in inches from segment start (0 and length endpoints included). */
export function enumerateStudLayoutPositionsInches(
  lengthFeet: number,
  spacingInches: number,
): number[] {
  const lengthInches = lengthFeet * 12;
  const positions: number[] = [0];
  let pos = spacingInches;
  while (pos < lengthInches - 1e-6) {
    positions.push(pos);
    pos += spacingInches;
  }
  if (lengthInches > 0 && positions[positions.length - 1] !== lengthInches) {
    positions.push(lengthInches);
  }
  return positions;
}

/** Count layout positions strictly inside (roughLeft, roughRight). */
export function countDisplacedStudPositions(
  lengthFeet: number,
  spacingInches: number,
  roughLeftInches: number,
  roughRightInches: number,
): number {
  const positions = enumerateStudLayoutPositionsInches(lengthFeet, spacingInches);
  return positions.filter(
    (p) => p > roughLeftInches && p < roughRightInches,
  ).length;
}

export type NetStudDeductionInput = {
  lengthFeet: number;
  spacingInches: number;
  positionOffsetFeetFromSegmentStart: number;
  roughWidthFeet: number;
};

export type NetStudDeductionResult = {
  baselineCount: number;
  deductCount: number;
  adjustedCount: number;
  displacedPositionsInches: number[];
};

export function computeNetStudDeduction(
  input: NetStudDeductionInput,
): NetStudDeductionResult {
  const baselineCount = countRegularlySpacedStuds(
    input.lengthFeet,
    input.spacingInches,
  );
  const roughLeftInches = input.positionOffsetFeetFromSegmentStart * 12;
  const roughRightInches = roughLeftInches + input.roughWidthFeet * 12;
  const positions = enumerateStudLayoutPositionsInches(
    input.lengthFeet,
    input.spacingInches,
  );
  const displacedPositionsInches = positions.filter(
    (p) => p > roughLeftInches && p < roughRightInches,
  );
  const deductCount = displacedPositionsInches.length;
  const adjustedCount = Math.max(0, baselineCount - deductCount);

  return {
    baselineCount,
    deductCount,
    adjustedCount,
    displacedPositionsInches,
  };
}

export function roughOpeningZonesOverlap(
  leftA: number,
  widthA: number,
  leftB: number,
  widthB: number,
): boolean {
  const rightA = leftA + widthA;
  const rightB = leftB + widthB;
  return leftA < rightB && leftB < rightA;
}
