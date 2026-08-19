import { wallW001FixtureLines } from "./wallW001FixtureLines.js";

export type OpeningNominalWidthFeet = 3 | 4;

export function wallOpeningFixtureLines(
  nominalWidthFeet: OpeningNominalWidthFeet = 3,
): readonly string[] {
  return [
    ...wallW001FixtureLines(20),
    "O-001",
    "Opening type: window",
    `Nominal width: ${nominalWidthFeet} ft`,
    "Nominal height: 4 ft",
    "Rough opening width: 3.5 ft",
    "Rough opening height: 4.5 ft",
    "Quantity: 1",
    "O-001 in Wall W-001",
  ];
}

export function wallOpeningFixtureText(
  nominalWidthFeet: OpeningNominalWidthFeet = 3,
): string {
  return wallOpeningFixtureLines(nominalWidthFeet).join("\n");
}

export const WALL_O001_MIXED_TEXT = wallOpeningFixtureText(3);
export const WALL_O001_MIXED_4FT_TEXT = wallOpeningFixtureText(4);

export function mixedOpeningNominalWidthLineIndexes(
  controlText: string,
  mutationText: string,
): number[] {
  const controlLines = controlText.split("\n");
  const mutationLines = mutationText.split("\n");
  return controlLines.flatMap((line, index) =>
    line !== mutationLines[index] ? [index] : [],
  );
}

export function openingNominalWidthLineIndex(): number {
  return wallW001FixtureLines(20).length + 2;
}
