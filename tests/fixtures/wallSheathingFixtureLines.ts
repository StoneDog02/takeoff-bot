import { wallW001FixtureLines } from "./wallW001FixtureLines.js";

/**
 * Controlled wall + sheathing text-layer fixture for live Claude sheathing proof.
 */
export function wallSheathingFixtureLines(): readonly string[] {
  return [
    "W-001",
    "Wall type: wood stud wall",
    ...wallW001FixtureLines(20).slice(2),
    "SHEATHING SCHEDULE",
    "SHS-001",
    "Name: Level 1 exterior wall sheathing",
    "Level: Level 1",
    "Application: wall",
    "Construction phase: new",
    "Panel type: OSB",
    'Panel thickness: 7/16"',
    "SHA-001",
    "Parent system: SHS-001",
    "Covers wall: W-001",
    "Sheathing coverage area: 160 SF",
  ];
}

export const WALL_SHEATHING_TEXT = wallSheathingFixtureLines().join("\n");
