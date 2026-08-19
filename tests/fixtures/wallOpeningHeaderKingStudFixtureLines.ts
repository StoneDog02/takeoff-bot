import { wallW001FixtureLines } from "./wallW001FixtureLines.js";

export type OpeningKingStudCount = 2 | 3;

export function wallOpeningHeaderKingStudFixtureLines(
  kingStudCount: OpeningKingStudCount,
): readonly string[] {
  return [
    ...wallW001FixtureLines(20),
    "O-001",
    "Type: window",
    "Nominal width: 3 ft",
    "Nominal height: 4 ft",
    "Quantity: 1",
    `King studs: ${kingStudCount}`,
    "O-001 in Wall W-001",
    "HDR-001",
    "Category: header",
    "Material: lvl",
    "Size: 1.75x11.875",
    "Length: 6 ft",
    "Quantity: 1",
    "Header HDR-001 at Opening O-001",
  ];
}

export function wallOpeningHeaderKingStudFixtureText(
  kingStudCount: OpeningKingStudCount,
): string {
  return wallOpeningHeaderKingStudFixtureLines(kingStudCount).join("\n");
}

export const WALL_O001_HDR001_KING2_TEXT = wallOpeningHeaderKingStudFixtureText(2);
export const WALL_O001_HDR001_KING3_TEXT = wallOpeningHeaderKingStudFixtureText(3);

export function openingKingStudLineIndex(text: string): number {
  return text.split("\n").findIndex((line) => line.startsWith("King studs:"));
}

export function openingKingStudCountLineIndexes(
  controlText: string,
  mutationText: string,
): number[] {
  const controlLines = controlText.split("\n");
  const mutationLines = mutationText.split("\n");
  return controlLines.flatMap((line, index) =>
    line !== mutationLines[index] ? [index] : [],
  );
}
