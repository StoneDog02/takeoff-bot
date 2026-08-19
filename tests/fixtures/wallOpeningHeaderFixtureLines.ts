import { wallW001FixtureLines } from "./wallW001FixtureLines.js";

export function wallOpeningHeaderFixtureLines(): readonly string[] {
  return [
    ...wallW001FixtureLines(20),
    "O-001",
    "Type: window",
    "Nominal width: 3 ft",
    "Nominal height: 4 ft",
    "Quantity: 1",
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

export function wallOpeningHeaderFixtureText(): string {
  return wallOpeningHeaderFixtureLines().join("\n");
}

export const WALL_O001_HDR001_MIXED_TEXT = wallOpeningHeaderFixtureText();
