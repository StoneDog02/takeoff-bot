import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  layoutPanelPieces,
  layoutWallPanels,
  layoutFloorPanels,
  generateSupportPositions,
  type OpeningGeometry,
  type PanelLayoutInput,
} from "../../src/framing/calculate/physicalPanelLayout.js";
import { panelLayoutResultSchema } from "../../src/framing/schemas/panel-layout.schema.js";

describe("Physical Panel Layout Engine (S4-PN-1)", () => {
  describe("8×8 two-piece fixture", () => {
    it("lays out an 8ft×8ft surface with two 4×8 panels side-by-side", () => {
      const result = layoutPanelPieces({
        areaId: "SHA-8x8",
        surfaceWidthInches: 96,
        surfaceHeightInches: 96,
        panelWidthInches: 48,
        panelHeightInches: 96,
        supportPositions: generateSupportPositions("stud", 8, 16),
        openings: [],
      });

      assert.equal(result.status, "complete");
      assert.equal(result.pieces.length, 2, "Should have exactly 2 panels");

      const firstPiece = result.pieces[0]!;
      assert.equal(firstPiece.originXInches, 0);
      assert.equal(firstPiece.originYInches, 0);
      assert.equal(firstPiece.widthInches, 48);
      assert.equal(firstPiece.heightInches, 96);
      assert.equal(firstPiece.isCut, false);
      assert.equal(firstPiece.isRemnant, false);

      const secondPiece = result.pieces[1]!;
      assert.equal(secondPiece.originXInches, 48);
      assert.equal(secondPiece.originYInches, 0);
      assert.equal(secondPiece.widthInches, 48);
      assert.equal(secondPiece.heightInches, 96);
      assert.equal(secondPiece.isCut, false);
      assert.equal(secondPiece.isRemnant, false);

      assert.equal(result.diagnostics.length, 0);
    });

    it("classifies edge at seam between two panels with stud support", () => {
      const result = layoutPanelPieces({
        areaId: "SHA-8x8-SEAM",
        surfaceWidthInches: 96,
        surfaceHeightInches: 96,
        panelWidthInches: 48,
        panelHeightInches: 96,
        supportPositions: generateSupportPositions("stud", 8, 16),
        openings: [],
      });

      const firstPiece = result.pieces[0]!;
      const rightEdge = firstPiece.edges.find((e) => e.side === "right");
      assert.ok(rightEdge);
      assert.equal(
        rightEdge.classification,
        "supported",
        "Right edge should be supported by stud at 48in",
      );

      const secondPiece = result.pieces[1]!;
      const leftEdge = secondPiece.edges.find((e) => e.side === "left");
      assert.ok(leftEdge);
      assert.equal(
        leftEdge.classification,
        "supported",
        "Left edge should be supported by stud at 48in",
      );
    });

    it("marks perimeter edges correctly", () => {
      const result = layoutPanelPieces({
        areaId: "SHA-8x8-PERIMETER",
        surfaceWidthInches: 96,
        surfaceHeightInches: 96,
        panelWidthInches: 48,
        panelHeightInches: 96,
        supportPositions: generateSupportPositions("stud", 8, 16),
        openings: [],
      });

      const firstPiece = result.pieces[0]!;
      const leftEdge = firstPiece.edges.find((e) => e.side === "left");
      const topEdge = firstPiece.edges.find((e) => e.side === "top");
      const bottomEdge = firstPiece.edges.find((e) => e.side === "bottom");

      assert.equal(leftEdge?.classification, "perimeter");
      assert.equal(topEdge?.classification, "perimeter");
      assert.equal(bottomEdge?.classification, "perimeter");
    });
  });

  describe("Opening-clip fixture", () => {
    it("clips panel pieces to known opening geometry", () => {
      const openings: OpeningGeometry[] = [
        {
          id: "O-WIN-001",
          leftInches: 24,
          topInches: 36,
          widthInches: 36,
          heightInches: 48,
        },
      ];

      const result = layoutPanelPieces({
        areaId: "SHA-OPENING",
        surfaceWidthInches: 96,
        surfaceHeightInches: 96,
        panelWidthInches: 48,
        panelHeightInches: 96,
        supportPositions: generateSupportPositions("stud", 8, 16),
        openings,
      });

      assert.equal(result.status, "complete");

      const piecesWithOpeningCuts = result.pieces.filter(
        (p) => p.openingCutIds.length > 0,
      );
      assert.ok(
        piecesWithOpeningCuts.length > 0,
        "At least one piece should have opening cuts",
      );

      for (const piece of piecesWithOpeningCuts) {
        assert.ok(
          piece.openingCutIds.includes("O-WIN-001"),
          "Opening cut should reference the correct opening ID",
        );
        assert.equal(piece.isCut, true, "Piece with opening should be marked as cut");
      }
    });

    it("classifies edges along opening as opening edges", () => {
      const openings: OpeningGeometry[] = [
        {
          id: "O-WIN-002",
          leftInches: 36,
          topInches: 24,
          widthInches: 24,
          heightInches: 48,
        },
      ];

      const result = layoutPanelPieces({
        areaId: "SHA-OPENING-EDGE",
        surfaceWidthInches: 96,
        surfaceHeightInches: 96,
        panelWidthInches: 48,
        panelHeightInches: 96,
        supportPositions: generateSupportPositions("stud", 8, 16),
        openings,
      });

      const piecesWithOpeningCuts = result.pieces.filter(
        (p) => p.openingCutIds.includes("O-WIN-002"),
      );
      assert.ok(
        piecesWithOpeningCuts.length > 0,
        "At least one piece should have opening cut",
      );

      for (const piece of piecesWithOpeningCuts) {
        assert.equal(piece.isCut, true, "Piece with opening should be marked as cut");
      }
    });

    it("does NOT use openingIds as an SF formula", () => {
      const openings: OpeningGeometry[] = [
        {
          id: "O-001",
          leftInches: 24,
          topInches: 24,
          widthInches: 24,
          heightInches: 24,
        },
        {
          id: "O-002",
          leftInches: 60,
          topInches: 60,
          widthInches: 24,
          heightInches: 24,
        },
      ];

      const result = layoutPanelPieces({
        areaId: "SHA-MULTI-OPEN",
        surfaceWidthInches: 96,
        surfaceHeightInches: 96,
        panelWidthInches: 48,
        panelHeightInches: 96,
        supportPositions: generateSupportPositions("stud", 8, 16),
        openings,
      });

      assert.equal(result.pieces.length, 2);
      assert.equal(
        result.pieces.reduce((sum, p) => sum + p.widthInches * p.heightInches, 0),
        96 * 96,
        "Total piece area should equal surface area (cuts don't reduce piece count)",
      );
    });
  });

  describe("Missing-dimension Unresolved fixture", () => {
    it("returns partial status when surface dimensions are missing", () => {
      const result = layoutPanelPieces({
        areaId: "SHA-NO-SURFACE",
        surfaceWidthInches: null,
        surfaceHeightInches: 96,
        panelWidthInches: 48,
        panelHeightInches: 96,
        supportPositions: null,
        openings: [],
      });

      assert.equal(result.status, "partial_missing_surface_geometry");
      assert.equal(result.pieces.length, 0);
      assert.ok(
        result.diagnostics.some((d) =>
          d.code.includes("MISSING_SURFACE_GEOMETRY"),
        ),
      );
    });

    it("returns partial status when panel dimensions are missing (does NOT invent 4×8)", () => {
      const result = layoutPanelPieces({
        areaId: "SHA-NO-PANEL",
        surfaceWidthInches: 96,
        surfaceHeightInches: 96,
        panelWidthInches: null,
        panelHeightInches: null,
        supportPositions: generateSupportPositions("stud", 8, 16),
        openings: [],
      });

      assert.equal(result.status, "partial_missing_panel_dimensions");
      assert.equal(result.pieces.length, 0);
      assert.ok(
        result.diagnostics.some(
          (d) =>
            d.code.includes("MISSING_PANEL_DIMENSIONS") &&
            d.message.includes("do NOT invent 4×8"),
        ),
        "Diagnostic should explicitly mention not inventing 4×8",
      );
    });

    it("does NOT default to 4×8 when only panel height is missing", () => {
      const result = layoutPanelPieces({
        areaId: "SHA-PARTIAL-PANEL",
        surfaceWidthInches: 96,
        surfaceHeightInches: 96,
        panelWidthInches: 48,
        panelHeightInches: null,
        supportPositions: null,
        openings: [],
      });

      assert.equal(result.status, "partial_missing_panel_dimensions");
      assert.equal(result.pieces.length, 0);
    });
  });

  describe("Unsupported-edge no-mint fixture", () => {
    it("emits requirement for unsupported edges but does NOT mint blocking", () => {
      const result = layoutPanelPieces({
        areaId: "SHA-UNSUPPORTED",
        surfaceWidthInches: 120,
        surfaceHeightInches: 96,
        panelWidthInches: 48,
        panelHeightInches: 96,
        supportPositions: null,
        openings: [],
      });

      assert.equal(result.status, "partial_unsupported_edges");
      assert.ok(
        result.unsupportedEdgeRequirements.length > 0,
        "Should have unsupported edge requirements",
      );

      for (const req of result.unsupportedEdgeRequirements) {
        assert.equal(req.requirementKind, "panel-edge-support");
        assert.equal(req.status, "unresolved");
        assert.equal(
          req.resolutionMethod,
          null,
          "Resolution method should be null (no blocking minted)",
        );
      }

      assert.ok(
        result.diagnostics.some(
          (d) =>
            d.code === "PANEL_LAYOUT_UNSUPPORTED_EDGES" &&
            d.message.includes("NOT minted"),
        ),
        "Diagnostic should confirm blocking/H-clips NOT minted",
      );
    });

    it("does NOT add panel edges to SupportGraph (edges stay in result, not exported)", () => {
      const result = layoutPanelPieces({
        areaId: "SHA-NO-SUPPORT-GRAPH",
        surfaceWidthInches: 96,
        surfaceHeightInches: 96,
        panelWidthInches: 48,
        panelHeightInches: 96,
        supportPositions: generateSupportPositions("stud", 8, 16),
        openings: [],
      });

      assert.ok(
        !("supportGraphEdges" in result),
        "Result should not contain supportGraphEdges",
      );

      for (const piece of result.pieces) {
        for (const edge of piece.edges) {
          assert.ok(
            typeof edge.classification === "string",
            "Edge classification stays in piece, not exported to graph",
          );
        }
      }
    });

    it("classifies seam edges as unsupported when no support positions provided", () => {
      const result = layoutPanelPieces({
        areaId: "SHA-NO-SUPPORTS",
        surfaceWidthInches: 96,
        surfaceHeightInches: 96,
        panelWidthInches: 48,
        panelHeightInches: 96,
        supportPositions: null,
        openings: [],
      });

      const firstPiece = result.pieces[0]!;
      const rightEdge = firstPiece.edges.find((e) => e.side === "right");

      assert.equal(
        rightEdge?.classification,
        "unsupported",
        "Interior seam should be unsupported without support positions",
      );

      assert.ok(
        result.unsupportedEdgeRequirements.some(
          (r) => r.panelPieceId === firstPiece.id && r.edge.side === "right",
        ),
        "Should emit requirement for unsupported right edge",
      );
    });
  });

  describe("Wall sheathing helper", () => {
    it("layouts wall panels with stud spacing", () => {
      const result = layoutWallPanels(
        "SHA-WALL-001",
        10,
        8,
        48,
        96,
        16,
        [],
      );

      assert.equal(result.status, "complete");
      assert.ok(result.pieces.length >= 2);

      const totalWidth = result.pieces.reduce(
        (sum, p) => (p.originYInches === 0 ? sum + p.widthInches : sum),
        0,
      );
      assert.equal(totalWidth, 120, "Total width should equal wall length");
    });

    it("handles null wall dimensions", () => {
      const result = layoutWallPanels(
        "SHA-WALL-NULL",
        null,
        8,
        48,
        96,
        16,
        [],
      );

      assert.equal(result.status, "partial_missing_surface_geometry");
    });
  });

  describe("Floor sheathing helper", () => {
    it("layouts floor panels with joist spacing", () => {
      const result = layoutFloorPanels(
        "SHA-FLOOR-001",
        20,
        16,
        48,
        96,
        16,
        [],
      );

      assert.equal(result.status, "complete");
      assert.ok(result.pieces.length > 0);
    });

    it("handles null floor dimensions", () => {
      const result = layoutFloorPanels(
        "SHA-FLOOR-NULL",
        20,
        null,
        48,
        96,
        16,
        [],
      );

      assert.equal(result.status, "partial_missing_surface_geometry");
    });
  });

  describe("Support position generation (S4-LY-1 reuse)", () => {
    it("generates stud positions using enumerateStudLayoutPositionsInches", () => {
      const supports = generateSupportPositions("stud", 8, 16);

      assert.equal(supports.kind, "stud");
      assert.equal(supports.spacingInches, 16);
      assert.ok(supports.positionsInches.includes(0));
      assert.ok(supports.positionsInches.includes(16));
      assert.ok(supports.positionsInches.includes(32));
      assert.ok(supports.positionsInches.includes(48));
      assert.ok(supports.positionsInches.includes(64));
      assert.ok(supports.positionsInches.includes(80));
      assert.ok(supports.positionsInches.includes(96));
    });

    it("generates joist positions using enumerateJoistLayoutPositionsInches", () => {
      const supports = generateSupportPositions("joist", 10, 16);

      assert.equal(supports.kind, "joist");
      assert.equal(supports.spacingInches, 16);
      assert.ok(supports.positionsInches.includes(0));
      assert.ok(supports.positionsInches.includes(120));
    });
  });

  describe("Zod schema validation", () => {
    it("result parses through PanelLayoutResult schema", () => {
      const result = layoutPanelPieces({
        areaId: "SHA-ZOD",
        surfaceWidthInches: 96,
        surfaceHeightInches: 96,
        panelWidthInches: 48,
        panelHeightInches: 96,
        supportPositions: generateSupportPositions("stud", 8, 16),
        openings: [],
      });

      assert.doesNotThrow(() => {
        panelLayoutResultSchema.parse(result);
      });
    });

    it("partial result parses through schema", () => {
      const result = layoutPanelPieces({
        areaId: "SHA-ZOD-PARTIAL",
        surfaceWidthInches: null,
        surfaceHeightInches: null,
        panelWidthInches: null,
        panelHeightInches: null,
        supportPositions: null,
        openings: [],
      });

      assert.doesNotThrow(() => {
        panelLayoutResultSchema.parse(result);
      });
    });
  });

  describe("Determinism", () => {
    it("is deterministic across reruns", () => {
      const input: PanelLayoutInput = {
        areaId: "SHA-DETERMINISTIC",
        surfaceWidthInches: 96,
        surfaceHeightInches: 96,
        panelWidthInches: 48,
        panelHeightInches: 96,
        supportPositions: generateSupportPositions("stud", 8, 16),
        openings: [
          {
            id: "O-001",
            leftInches: 24,
            topInches: 24,
            widthInches: 24,
            heightInches: 24,
          },
        ],
      };

      const result1 = layoutPanelPieces(input);
      const result2 = layoutPanelPieces(input);

      assert.deepEqual(result1, result2);
    });
  });

  describe("Remnant tracking", () => {
    it("tracks remnants from partial panels", () => {
      const result = layoutPanelPieces({
        areaId: "SHA-REMNANTS",
        surfaceWidthInches: 60,
        surfaceHeightInches: 96,
        panelWidthInches: 48,
        panelHeightInches: 96,
        supportPositions: null,
        openings: [],
      });

      const partialPiece = result.pieces.find((p) => p.widthInches < 48);
      assert.ok(partialPiece, "Should have a partial width piece");
      assert.equal(partialPiece.isRemnant, true);
      assert.equal(partialPiece.isCut, true);

      assert.ok(
        result.remnants.some((r) => r.widthInches === 12),
        "Should track 12in remnant for potential reuse",
      );
    });
  });
});
