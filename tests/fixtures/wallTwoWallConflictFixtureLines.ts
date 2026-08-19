import { wallW001FixtureLines } from "./wallW001FixtureLines.ts";

export function wallW002ConflictFixtureLines(): readonly string[] {
  return [
    "W-002",
    "Wall type: wood stud wall",
    "Length note: 12 ft",
    "Conflicting length note: 14 ft",
    "2x6",
    "24 in O.C.",
    "9 ft wall height",
    "2 plates",
  ];
}

export function wallTwoWallConflictFixtureLines(): readonly string[] {
  return [
    ...wallW001FixtureLines(20),
    ...wallW002ConflictFixtureLines(),
  ];
}

export const WALL_TWO_WALL_CONFLICT_TEXT =
  wallTwoWallConflictFixtureLines().join("\n");
