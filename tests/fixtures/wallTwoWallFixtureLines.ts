import { wallW001FixtureLines } from "./wallW001FixtureLines.ts";

export function wallW002FixtureLines(): readonly string[] {
  return [
    "W-002",
    "Wall type: wood stud wall",
    "12 ft",
    "2x6",
    "24 in O.C.",
    "9 ft wall height",
    "2 plates",
  ];
}

export function wallTwoWallFixtureLines(): readonly string[] {
  return [...wallW001FixtureLines(20), ...wallW002FixtureLines()];
}

export const WALL_TWO_WALL_TEXT = wallTwoWallFixtureLines().join("\n");
