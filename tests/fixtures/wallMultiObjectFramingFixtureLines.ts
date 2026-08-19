import { wallW001FixtureLines } from "./wallW001FixtureLines.js";
import { wallW002FixtureLines } from "./wallTwoWallFixtureLines.js";

/**
 * Plan-like text-layer fixture for the live multi-object framing system proof.
 *
 * W-001 / WS-001 → O-001, O-002
 * W-002 / WS-002 → O-003
 * SM-HDR-001 → O-001
 * SM-HDR-002 → O-003
 */
export function wallMultiObjectFramingFixturePages(): readonly (readonly string[])[] {
  return [
    [
      "FRAMING PLAN NOTES - LEVEL 1",
      "WALL W-001",
      "Wall type: wood stud wall",
      "Location: exterior",
      "Bearing: non-bearing",
      ...wallW001FixtureLines(20).slice(2),
      "WALL W-002",
      "Wall type: wood stud wall",
      "Location: interior",
      "Bearing: non-bearing",
      ...wallW002FixtureLines().slice(2),
      "OPENING SCHEDULE",
      "O-001",
      "Type: window",
      "Wall: W-001",
      "Nominal width: 3 ft",
      "Nominal height: 4 ft",
      "Rough opening width: 3.5 ft",
      "Rough opening height: 4.5 ft",
      "Quantity: 1",
      "King studs: 3",
      "Header: HDR-001",
      "O-001 in Wall W-001",
      "O-002",
      "Type: window",
      "Wall: W-001",
      "Nominal width: 4 ft",
      "Nominal height: 5 ft",
      "Rough opening width: 4 ft",
      "Rough opening height: 5.5 ft",
      "Quantity: 1",
      "O-002 in Wall W-001",
    ],
    [
      "O-003",
      "Type: door",
      "Wall: W-002",
      "Nominal width: 3 ft",
      "Nominal height: 7 ft",
      "Rough opening width: 3.25 ft",
      "Rough opening height: 7.5 ft",
      "Quantity: 1",
      "Header: HDR-002",
      "O-003 in Wall W-002",
      "HEADER SCHEDULE",
      "HDR-001",
      "Category: header",
      "Material: lvl",
      "Size: 1.75x11.875",
      "Length: 6 ft",
      "Quantity: 1",
      "Opening: O-001",
      "Header HDR-001 at Opening O-001",
      "HDR-002",
      "Category: header",
      "Material: dimensional-lumber",
      "Size: 2x12",
      "Length: 8 ft",
      "Quantity: 1",
      "Opening: O-003",
      "Header HDR-002 at Opening O-003",
    ],
  ];
}

export function wallMultiObjectFramingFixtureLines(): readonly string[] {
  return wallMultiObjectFramingFixturePages().flat();
}

export function wallMultiObjectFramingFixtureText(): string {
  return wallMultiObjectFramingFixturePages()
    .map((page) => page.join("\n"))
    .join("\n");
}

export const WALL_MULTI_OBJECT_FRAMING_TEXT = wallMultiObjectFramingFixtureText();

export const MULTI_OBJECT_LIVE_EXPECTED = {
  walls: {
    "WS-001": { studs: 16, plates: 60 },
    "WS-002": { studs: 7, plates: 24 },
  },
  openings: {
    "O-001": { kingStuds: 3, roughSill: 3.5, explicitKingStudCount: true },
    "O-002": { kingStuds: 2, roughSill: 4, explicitKingStudCount: false },
    "O-003": { kingStuds: 2, roughSill: null, explicitKingStudCount: false },
  },
  headers: {
    "SM-HDR-001": 6,
    "SM-HDR-002": 8,
  },
  summary: {
    wallCount: 2,
    wallSegmentCount: 2,
    openingCount: 3,
    structuralMemberCount: 2,
    materialLineItemCount: 11,
    assumptionCount: 4,
    reviewItemCount: 4,
    validationIssueCount: 4,
  },
} as const;
