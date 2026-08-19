export function wallW001FixtureLines(lengthFeet: 20 | 24): readonly string[] {
  return [
    "W-001",
    "Wall type: wood stud wall",
    `${lengthFeet} ft`,
    "2x4",
    "16 in O.C.",
    "8 ft wall height",
    "3 plates",
  ];
}

export const WALL_W001_20FT_TEXT = wallW001FixtureLines(20).join("\n");
export const WALL_W001_24FT_TEXT = wallW001FixtureLines(24).join("\n");
