import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  openingKingStudCountLineIndexes,
  WALL_O001_HDR001_KING2_TEXT,
  WALL_O001_HDR001_KING3_TEXT,
  wallOpeningHeaderKingStudFixtureLines,
} from "./wallOpeningHeaderKingStudFixtureLines.js";

describe("wallOpeningHeaderKingStudFixtureLines", () => {
  it("differs only on the explicit king-stud count line", () => {
    const kingLineIndex = wallOpeningHeaderKingStudFixtureLines(2).findIndex(
      (line) => line.startsWith("King studs:"),
    );

    assert.ok(kingLineIndex >= 0);
    assert.notEqual(WALL_O001_HDR001_KING2_TEXT, WALL_O001_HDR001_KING3_TEXT);
    assert.deepEqual(
      openingKingStudCountLineIndexes(
        WALL_O001_HDR001_KING2_TEXT,
        WALL_O001_HDR001_KING3_TEXT,
      ),
      [kingLineIndex],
    );
    assert.equal(
      WALL_O001_HDR001_KING2_TEXT.split("\n")[kingLineIndex],
      "King studs: 2",
    );
    assert.equal(
      WALL_O001_HDR001_KING3_TEXT.split("\n")[kingLineIndex],
      "King studs: 3",
    );
  });
});
