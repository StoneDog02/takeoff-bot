import { wallW001FixtureLines } from "./wallW001FixtureLines.js";

/**
 * Controlled wall + floor framing text-layer fixture for live Claude
 * joist-count and joist-LF proof.
 *
 * Layout length and member length are stated explicitly — Claude must not
 * derive either from area SF.
 */
export function floorFramingFixtureLines(): readonly string[] {
  return [
    "W-001",
    "Wall type: wood stud wall",
    ...wallW001FixtureLines(20).slice(2),
    "FLOOR FRAMING SCHEDULE",
    "FFS-001",
    "Name: Level 2 floor framing",
    "Level: Level 2",
    "Construction phase: new",
    "Joist type: i-joist",
    'Joist size: 11-7/8"',
    "Joist spacing: 16 inches",
    "FFA-001",
    "Parent system: FFS-001",
    "Span direction: north-south",
    "Joist layout length along spacing axis: 20 feet",
    "Joist member length: 12 feet",
  ];
}

export const FLOOR_FRAMING_TEXT = floorFramingFixtureLines().join("\n");
