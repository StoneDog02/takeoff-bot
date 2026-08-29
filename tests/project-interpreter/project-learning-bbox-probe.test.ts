import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Non-blocking probe: documents ODL Hybrid bbox convention vs pdf-points /
 * crop raster y-flip. V1 must not cite ODL bbox as Evidence SourceRegion until
 * this mapping is proven against a known crop.
 *
 * ODL Docling-style bbox is typically [L, B, R, T] in PDF bottom-left space.
 * Compiler / SourceRegion uses {x0,y0,x1,y1} with y often top-left after raster.
 */
function odlLbrtToPdfPoints(bbox: {
  left: number;
  bottom: number;
  right: number;
  top: number;
}): { x0: number; y0: number; x1: number; y1: number } {
  return {
    x0: bbox.left,
    y0: bbox.bottom,
    x1: bbox.right,
    y1: bbox.top,
  };
}

function pdfPointsToRasterTopLeft(
  region: { x0: number; y0: number; x1: number; y1: number },
  pageHeight: number,
): { x: number; y: number; width: number; height: number } {
  const width = region.x1 - region.x0;
  const height = region.y1 - region.y0;
  return {
    x: region.x0,
    y: pageHeight - region.y1,
    width,
    height,
  };
}

describe("project learning ODL bbox coordinate probe", () => {
  it("documents LBRT → pdf-points → raster top-left y-flip without claiming Evidence authority", () => {
    const odl = { left: 100, bottom: 200, right: 300, top: 400 };
    const pdf = odlLbrtToPdfPoints(odl);
    assert.deepEqual(pdf, { x0: 100, y0: 200, x1: 300, y1: 400 });

    const pageHeight = 792;
    const raster = pdfPointsToRasterTopLeft(pdf, pageHeight);
    assert.equal(raster.x, 100);
    assert.equal(raster.width, 200);
    assert.equal(raster.height, 200);
    assert.equal(raster.y, pageHeight - 400);

    // Explicit V1 policy reminder for readers of this probe:
    assert.equal(
      "do-not-cite-odl-bbox-as-evidence-until-crop-validated",
      "do-not-cite-odl-bbox-as-evidence-until-crop-validated",
    );
  });
});
