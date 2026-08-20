import { wallW001FixtureLines } from "./wallW001FixtureLines.js";

/**
 * Controlled wall + roof framing text-layer fixture for live Claude
 * common-rafter count proof.
 *
 * Layout length is stated explicitly along the spacing axis — Claude must not
 * derive it from area SF or pitch, and must not calculate the 16 count.
 */
export function roofFramingFixtureLines(): readonly string[] {
  return [
    "W-001",
    "Wall type: wood stud wall",
    ...wallW001FixtureLines(20).slice(2),
    "ROOF FRAMING SCHEDULE",
    "RFS-001",
    "Name: Main roof framing",
    "Level: Roof",
    "Construction phase: new",
    "Framing type: rafter",
    "Member size: 2x8",
    "Member spacing: 16 inches",
    "RFP-001",
    "Parent system: RFS-001",
    "Span direction: north-south",
    "Framing direction: north-south",
    "Rafter layout length along spacing axis: 20 feet",
  ];
}

export const ROOF_FRAMING_TEXT = roofFramingFixtureLines().join("\n");
