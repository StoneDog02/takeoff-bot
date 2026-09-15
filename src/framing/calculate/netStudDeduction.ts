/**
 * Net regular-stud deduction helpers per `knowledge/framing/13-opening-wall-framing-calculations.md`.
 *
 * Per V1 spec §16.2: purchased regularly spaced counts = enumerated layout positions.
 * The formula `ceil((L*12)/spacing)+1` is a sanity check, not authority for counts.
 */

/**
 * Layout positions in inches from segment start (0 and length endpoints included).
 *
 * This is the authoritative source for regularly spaced member positions.
 * Per V1 spec §16.2 / §19, generate positions first, then count.
 */
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

/**
 * Layout positions in inches from area start (0 and length endpoints included).
 *
 * Joist sibling of enumerateStudLayoutPositionsInches for floor framing.
 * Per V1 spec §16.2 / §18, generate positions first, then count.
 */
export function enumerateJoistLayoutPositionsInches(
  joistLayoutLengthFeet: number,
  joistSpacingInches: number,
): number[] {
  const lengthInches = joistLayoutLengthFeet * 12;
  const positions: number[] = [0];
  let pos = joistSpacingInches;
  while (pos < lengthInches - 1e-6) {
    positions.push(pos);
    pos += joistSpacingInches;
  }
  if (lengthInches > 0 && positions[positions.length - 1] !== lengthInches) {
    positions.push(lengthInches);
  }
  return positions;
}

/**
 * Formula-based count for sanity check only.
 * NOT authority for purchased counts per V1 spec §16.2.
 */
function formulaBasedCount(lengthFeet: number, spacingInches: number): number {
  return Math.ceil((lengthFeet * 12) / spacingInches) + 1;
}

/**
 * Baseline regularly spaced stud count for one wall segment.
 *
 * Per V1 spec §16.2 / §19: count = enumerated layout positions.
 * The formula `ceil((L*12)/spacing)+1` is a sanity check only.
 */
export function countRegularlySpacedStuds(
  lengthFeet: number,
  spacingInches: number,
): number {
  const positions = enumerateStudLayoutPositionsInches(lengthFeet, spacingInches);
  const count = positions.length;

  if (process.env.NODE_ENV !== "production") {
    const formulaCount = formulaBasedCount(lengthFeet, spacingInches);
    if (count !== formulaCount) {
      console.warn(
        `[S4-LY-1] Position census (${count}) differs from formula (${formulaCount}) ` +
        `for stud layout: length=${lengthFeet}ft, spacing=${spacingInches}in`,
      );
    }
  }

  return count;
}

/**
 * Baseline regularly spaced joist count for one floor framing area.
 *
 * Per V1 spec §16.2 / §18: count = enumerated layout positions.
 * The formula `ceil((L*12)/spacing)+1` is a sanity check only.
 */
export function countRegularlySpacedJoists(
  joistLayoutLengthFeet: number,
  joistSpacingInches: number,
): number {
  const positions = enumerateJoistLayoutPositionsInches(
    joistLayoutLengthFeet,
    joistSpacingInches,
  );
  const count = positions.length;

  if (process.env.NODE_ENV !== "production") {
    const formulaCount = formulaBasedCount(joistLayoutLengthFeet, joistSpacingInches);
    if (count !== formulaCount) {
      console.warn(
        `[S4-LY-1] Position census (${count}) differs from formula (${formulaCount}) ` +
        `for joist layout: length=${joistLayoutLengthFeet}ft, spacing=${joistSpacingInches}in`,
      );
    }
  }

  return count;
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
