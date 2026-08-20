import { wallOpeningHeaderKingStudFixtureLines } from "./wallOpeningHeaderKingStudFixtureLines.js";

/**
 * Controlled wall + opening + header fixture with explicit king and jack counts.
 */
export function wallOpeningHeaderJackStudFixtureLines(
  jackStudCount = 2,
  kingStudCount: 2 | 3 = 2,
): readonly string[] {
  const lines = [...wallOpeningHeaderKingStudFixtureLines(kingStudCount)];
  const kingIndex = lines.findIndex((line) => line.startsWith("King studs:"));
  if (kingIndex < 0) {
    throw new Error("Expected King studs line in king-stud fixture base.");
  }
  lines.splice(kingIndex + 1, 0, `Jack studs: ${jackStudCount}`);
  return lines;
}

export const WALL_O001_HDR001_JACK2_TEXT =
  wallOpeningHeaderJackStudFixtureLines(2, 2).join("\n");
