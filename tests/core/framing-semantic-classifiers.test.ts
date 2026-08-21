import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isIJoistType } from "../../src/scopes/framing/resolvers/floorFramingPropertyPaths.js";
import { isStickCommonRafterFramingType } from "../../src/scopes/framing/resolvers/roofFramingPropertyPaths.js";
import { isWoodStudWallType } from "../../src/scopes/framing/resolvers/wallFramingPropertyPaths.js";

describe("production semantic classifiers (Milestone I)", () => {
  it("classifies wood-stud wallType variants used by opening eligibility", () => {
    assert.equal(isWoodStudWallType("wood stud"), true);
    assert.equal(isWoodStudWallType("wood stud wall"), true);
    assert.equal(isWoodStudWallType("WOOD STUD"), true);
    assert.equal(isWoodStudWallType("metal stud"), false);
    assert.equal(isWoodStudWallType("concrete masonry"), false);
  });

  it("classifies I-joist joistType variants used by floor LF eligibility", () => {
    assert.equal(isIJoistType("i-joist"), true);
    assert.equal(isIJoistType("I-JOISTS"), true);
    assert.equal(isIJoistType("floor-truss"), false);
    assert.equal(isIJoistType("dimensional-lumber"), false);
    assert.equal(isIJoistType("metal joist"), false);
  });

  it("classifies stick framingType variants used by common-rafter eligibility", () => {
    assert.equal(isStickCommonRafterFramingType("stick"), true);
    assert.equal(isStickCommonRafterFramingType("STICK FRAMED"), true);
    assert.equal(isStickCommonRafterFramingType("roof-truss"), false);
    assert.equal(isStickCommonRafterFramingType("truss"), false);
  });
});
