import { wallW001FixtureLines } from "./wallW001FixtureLines.js";

export type MixedHeaderLengthFeet = 6 | 8;

export function wallHeaderMixedFixtureLines(
  headerLengthFeet: MixedHeaderLengthFeet = 6,
): readonly string[] {
  return [
    ...wallW001FixtureLines(20),
    "HDR-001",
    "Category: header",
    "Material: lvl",
    "Size: 1.75x11.875",
    `Length: ${headerLengthFeet} ft`,
    "Quantity: 1",
    "Location: over Window W-001 at Wall W-001",
  ];
}

export function wallHeaderMixedFixtureText(
  headerLengthFeet: MixedHeaderLengthFeet = 6,
): string {
  return wallHeaderMixedFixtureLines(headerLengthFeet).join("\n");
}

export const WALL_HDR001_MIXED_TEXT = wallHeaderMixedFixtureText(6);
export const WALL_HDR001_MIXED_8FT_TEXT = wallHeaderMixedFixtureText(8);

export function mixedHeaderLengthLineIndexes(
  controlText: string,
  mutationText: string,
): number[] {
  const controlLines = controlText.split("\n");
  const mutationLines = mutationText.split("\n");
  return controlLines.flatMap((line, index) =>
    line !== mutationLines[index] ? [index] : [],
  );
}
