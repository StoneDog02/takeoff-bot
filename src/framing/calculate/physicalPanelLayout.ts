/**
 * Physical Panel Layout Engine for established rectangular wall and floor sheathing.
 *
 * Per V1 spec §18–19 (Surface-to-Panel) and ticket S4-PN-1:
 * - Materialize physical panel pieces (cuts/remnants)
 * - Clip to known opening geometry
 * - Classify panel edges using S4-LY-1 support positions when present
 * - Unsupported edges → requirement/Unresolved (do NOT mint blocking or H-clips)
 * - Do NOT invent panel 4×8 when dimensions are missing
 * - Do NOT mint sheathing existence
 * - Do NOT layout 3D roof planes (rectangular wall/floor only)
 * - Do NOT expand SupportGraph
 */

import {
  objectIdSchema,
  type ObjectId,
} from "../../core/schemas/identity.schema.js";
import {
  panelLayoutResultSchema,
  physicalPanelPieceSchema,
  type PanelEdge,
  type PanelEdgeClassification,
  type PanelLayoutResult,
  type PhysicalPanelPiece,
  type UnsupportedEdgeRequirement,
} from "../schemas/panel-layout.schema.js";

export type { PanelLayoutResult, PhysicalPanelPiece };
import {
  enumerateStudLayoutPositionsInches,
  enumerateJoistLayoutPositionsInches,
} from "./netStudDeduction.js";

export type OpeningGeometry = {
  id: ObjectId;
  leftInches: number;
  topInches: number;
  widthInches: number;
  heightInches: number;
};

export type SupportPositions = {
  kind: "stud" | "joist";
  spacingInches: number;
  positionsInches: number[];
};

export type PanelLayoutInput = {
  areaId: ObjectId;
  surfaceWidthInches: number | null;
  surfaceHeightInches: number | null;
  panelWidthInches: number | null;
  panelHeightInches: number | null;
  supportPositions: SupportPositions | null;
  openings: OpeningGeometry[];
  layoutOriginXInches?: number;
  layoutOriginYInches?: number;
};

type PanelCourse = {
  rowIndex: number;
  originYInches: number;
  heightInches: number;
  pieces: PieceInCourse[];
};

type PieceInCourse = {
  colIndex: number;
  originXInches: number;
  widthInches: number;
  openingCutIds: ObjectId[];
  isRemnant: boolean;
  isCut: boolean;
};

function generatePanelPieceId(
  areaId: ObjectId,
  rowIndex: number,
  colIndex: number,
): ObjectId {
  return objectIdSchema.parse(`PNL-${areaId}-R${rowIndex}C${colIndex}`);
}

function generateRemnantId(areaId: ObjectId, index: number): ObjectId {
  return objectIdSchema.parse(`PNL-REM-${areaId}-${index}`);
}

function rectIntersects(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function clipPieceToOpenings(
  pieceX: number,
  pieceY: number,
  pieceW: number,
  pieceH: number,
  openings: OpeningGeometry[],
): { openingCutIds: ObjectId[]; isCut: boolean } {
  const openingCutIds: ObjectId[] = [];
  for (const opening of openings) {
    if (
      rectIntersects(
        pieceX,
        pieceY,
        pieceW,
        pieceH,
        opening.leftInches,
        opening.topInches,
        opening.widthInches,
        opening.heightInches,
      )
    ) {
      openingCutIds.push(opening.id);
    }
  }
  return { openingCutIds, isCut: openingCutIds.length > 0 };
}

function classifyEdge(
  side: "top" | "bottom" | "left" | "right",
  pieceOriginX: number,
  pieceOriginY: number,
  pieceWidth: number,
  pieceHeight: number,
  surfaceWidth: number,
  surfaceHeight: number,
  supportPositions: SupportPositions | null,
  openings: OpeningGeometry[],
): { classification: PanelEdgeClassification; supportMemberIds: ObjectId[] } {
  const epsilon = 0.5;

  let startInches: number;
  let endInches: number;
  let isPerimeter = false;

  switch (side) {
    case "top":
      startInches = pieceOriginX;
      endInches = pieceOriginX + pieceWidth;
      isPerimeter = pieceOriginY <= epsilon;
      break;
    case "bottom":
      startInches = pieceOriginX;
      endInches = pieceOriginX + pieceWidth;
      isPerimeter = pieceOriginY + pieceHeight >= surfaceHeight - epsilon;
      break;
    case "left":
      startInches = pieceOriginY;
      endInches = pieceOriginY + pieceHeight;
      isPerimeter = pieceOriginX <= epsilon;
      break;
    case "right":
      startInches = pieceOriginY;
      endInches = pieceOriginY + pieceHeight;
      isPerimeter = pieceOriginX + pieceWidth >= surfaceWidth - epsilon;
      break;
  }

  if (isPerimeter) {
    return { classification: "perimeter", supportMemberIds: [] };
  }

  for (const opening of openings) {
    const openingLeft = opening.leftInches;
    const openingRight = opening.leftInches + opening.widthInches;
    const openingTop = opening.topInches;
    const openingBottom = opening.topInches + opening.heightInches;

    if (side === "top" || side === "bottom") {
      const edgeY = side === "top" ? pieceOriginY : pieceOriginY + pieceHeight;
      if (
        edgeY >= openingTop - epsilon &&
        edgeY <= openingBottom + epsilon &&
        startInches < openingRight &&
        endInches > openingLeft
      ) {
        return { classification: "opening", supportMemberIds: [] };
      }
    } else {
      const edgeX = side === "left" ? pieceOriginX : pieceOriginX + pieceWidth;
      if (
        edgeX >= openingLeft - epsilon &&
        edgeX <= openingRight + epsilon &&
        startInches < openingBottom &&
        endInches > openingTop
      ) {
        return { classification: "opening", supportMemberIds: [] };
      }
    }
  }

  if (supportPositions === null) {
    return { classification: "unsupported", supportMemberIds: [] };
  }

  const isHorizontalEdge = side === "top" || side === "bottom";
  const isVerticalSupports = supportPositions.kind === "stud";

  if (isHorizontalEdge && isVerticalSupports) {
    const edgeY = side === "top" ? pieceOriginY : pieceOriginY + pieceHeight;
    const supportMemberIds: ObjectId[] = [];

    for (const pos of supportPositions.positionsInches) {
      if (pos >= startInches - epsilon && pos <= endInches + epsilon) {
        supportMemberIds.push(objectIdSchema.parse(`support-${supportPositions.kind}-${Math.round(pos)}`));
      }
    }

    if (supportMemberIds.length > 0) {
      return { classification: "supported", supportMemberIds };
    }

    return { classification: "unsupported", supportMemberIds: [] };
  }

  if (!isHorizontalEdge && !isVerticalSupports) {
    const edgeX = side === "left" ? pieceOriginX : pieceOriginX + pieceWidth;
    const supportMemberIds: ObjectId[] = [];

    for (const pos of supportPositions.positionsInches) {
      if (pos >= startInches - epsilon && pos <= endInches + epsilon) {
        supportMemberIds.push(objectIdSchema.parse(`support-${supportPositions.kind}-${Math.round(pos)}`));
      }
    }

    if (supportMemberIds.length > 0) {
      return { classification: "supported", supportMemberIds };
    }

    return { classification: "unsupported", supportMemberIds: [] };
  }

  if (isHorizontalEdge && !isVerticalSupports) {
    const edgeY = side === "top" ? pieceOriginY : pieceOriginY + pieceHeight;

    for (const pos of supportPositions.positionsInches) {
      if (Math.abs(pos - edgeY) < epsilon) {
        return {
          classification: "supported",
          supportMemberIds: [objectIdSchema.parse(`support-${supportPositions.kind}-${Math.round(pos)}`)],
        };
      }
    }

    return { classification: "unsupported", supportMemberIds: [] };
  }

  if (!isHorizontalEdge && isVerticalSupports) {
    const edgeX = side === "left" ? pieceOriginX : pieceOriginX + pieceWidth;

    for (const pos of supportPositions.positionsInches) {
      if (Math.abs(pos - edgeX) < epsilon) {
        return {
          classification: "supported",
          supportMemberIds: [objectIdSchema.parse(`support-${supportPositions.kind}-${Math.round(pos)}`)],
        };
      }
    }

    return { classification: "unsupported", supportMemberIds: [] };
  }

  return { classification: "unsupported", supportMemberIds: [] };
}

function buildPieceEdges(
  pieceOriginX: number,
  pieceOriginY: number,
  pieceWidth: number,
  pieceHeight: number,
  surfaceWidth: number,
  surfaceHeight: number,
  supportPositions: SupportPositions | null,
  openings: OpeningGeometry[],
): PanelEdge[] {
  const edges: PanelEdge[] = [];

  for (const side of ["top", "bottom", "left", "right"] as const) {
    const { classification, supportMemberIds } = classifyEdge(
      side,
      pieceOriginX,
      pieceOriginY,
      pieceWidth,
      pieceHeight,
      surfaceWidth,
      surfaceHeight,
      supportPositions,
      openings,
    );

    let startInches: number;
    let endInches: number;

    switch (side) {
      case "top":
      case "bottom":
        startInches = pieceOriginX;
        endInches = pieceOriginX + pieceWidth;
        break;
      case "left":
      case "right":
        startInches = pieceOriginY;
        endInches = pieceOriginY + pieceHeight;
        break;
    }

    edges.push({
      side,
      classification,
      startInches,
      endInches,
      supportMemberIds,
    });
  }

  return edges;
}

/**
 * Lay out rectangular panel courses on an established rectangular surface.
 *
 * Per ticket S4-PN-1:
 * - Do NOT invent panel 4×8 when dimensions are missing
 * - Returns partial status with diagnostic when dimensions missing
 */
export function layoutPanelPieces(input: PanelLayoutInput): PanelLayoutResult {
  const {
    areaId,
    surfaceWidthInches,
    surfaceHeightInches,
    panelWidthInches,
    panelHeightInches,
    supportPositions,
    openings,
    layoutOriginXInches = 0,
    layoutOriginYInches = 0,
  } = input;

  const diagnostics: PanelLayoutResult["diagnostics"] = [];
  const pieces: PhysicalPanelPiece[] = [];
  const remnants: PhysicalPanelPiece[] = [];
  const unsupportedEdgeRequirements: UnsupportedEdgeRequirement[] = [];

  if (surfaceWidthInches === null || surfaceHeightInches === null) {
    diagnostics.push({
      code: "PANEL_LAYOUT_MISSING_SURFACE_GEOMETRY",
      message: `Surface dimensions missing for area ${areaId}`,
      severity: "error",
    });
    return panelLayoutResultSchema.parse({
      areaId,
      pieces: [],
      remnants: [],
      unsupportedEdgeRequirements: [],
      diagnostics,
      status: "partial_missing_surface_geometry",
    });
  }

  if (panelWidthInches === null || panelHeightInches === null) {
    diagnostics.push({
      code: "PANEL_LAYOUT_MISSING_PANEL_DIMENSIONS",
      message: `Panel dimensions missing for area ${areaId} — do NOT invent 4×8`,
      severity: "error",
    });
    return panelLayoutResultSchema.parse({
      areaId,
      pieces: [],
      remnants: [],
      unsupportedEdgeRequirements: [],
      diagnostics,
      status: "partial_missing_panel_dimensions",
    });
  }

  const courses: PanelCourse[] = [];
  let rowIndex = 0;
  let currentY = layoutOriginYInches;

  while (currentY < surfaceHeightInches) {
    const rowHeight = Math.min(panelHeightInches, surfaceHeightInches - currentY);
    const coursePieces: PieceInCourse[] = [];

    let colIndex = 0;
    let currentX = layoutOriginXInches;

    while (currentX < surfaceWidthInches) {
      const colWidth = Math.min(panelWidthInches, surfaceWidthInches - currentX);

      const { openingCutIds, isCut } = clipPieceToOpenings(
        currentX,
        currentY,
        colWidth,
        rowHeight,
        openings,
      );

      const isRemnant =
        colWidth < panelWidthInches - 0.5 || rowHeight < panelHeightInches - 0.5;

      coursePieces.push({
        colIndex,
        originXInches: currentX,
        widthInches: colWidth,
        openingCutIds,
        isRemnant,
        isCut: isCut || isRemnant,
      });

      currentX += colWidth;
      colIndex++;
    }

    courses.push({
      rowIndex,
      originYInches: currentY,
      heightInches: rowHeight,
      pieces: coursePieces,
    });

    currentY += rowHeight;
    rowIndex++;
  }

  let remnantIndex = 0;
  for (const course of courses) {
    for (const piece of course.pieces) {
      const edges = buildPieceEdges(
        piece.originXInches,
        course.originYInches,
        piece.widthInches,
        course.heightInches,
        surfaceWidthInches,
        surfaceHeightInches,
        supportPositions,
        openings,
      );

      const pieceId = generatePanelPieceId(areaId, course.rowIndex, piece.colIndex);

      const physicalPiece = physicalPanelPieceSchema.parse({
        id: pieceId,
        parentAreaId: areaId,
        originXInches: piece.originXInches,
        originYInches: course.originYInches,
        widthInches: piece.widthInches,
        heightInches: course.heightInches,
        isRemnant: piece.isRemnant,
        isCut: piece.isCut,
        edges,
        openingCutIds: piece.openingCutIds,
      });

      pieces.push(physicalPiece);

      for (const edge of edges) {
        if (edge.classification === "unsupported") {
          unsupportedEdgeRequirements.push({
            panelPieceId: pieceId,
            edge,
            requirementKind: "panel-edge-support",
            status: "unresolved",
            resolutionMethod: null,
          });
        }
      }

      if (piece.isRemnant && piece.widthInches >= 12 && course.heightInches >= 12) {
        remnants.push({
          ...physicalPiece,
          id: generateRemnantId(areaId, remnantIndex++),
          isRemnant: true,
        });
      }
    }
  }

  const hasUnsupportedEdges = unsupportedEdgeRequirements.length > 0;
  let status: PanelLayoutResult["status"] = "complete";

  if (hasUnsupportedEdges) {
    status = "partial_unsupported_edges";
    diagnostics.push({
      code: "PANEL_LAYOUT_UNSUPPORTED_EDGES",
      message: `${unsupportedEdgeRequirements.length} unsupported panel edge(s) detected — requirement emitted, blocking/H-clips NOT minted per S4-PN-1`,
      severity: "warning",
    });
  }

  return panelLayoutResultSchema.parse({
    areaId,
    pieces,
    remnants,
    unsupportedEdgeRequirements,
    diagnostics,
    status,
  });
}

/**
 * Generate support positions from S4-LY-1 layout enumerators.
 *
 * Per ticket S4-PN-1:
 * - Classify panel edges using S4-LY-1 support positions when present
 * - Reuse enumerateStudLayoutPositionsInches / enumerateJoistLayoutPositionsInches
 */
export function generateSupportPositions(
  kind: "stud" | "joist",
  layoutLengthFeet: number,
  spacingInches: number,
): SupportPositions {
  const positionsInches =
    kind === "stud"
      ? enumerateStudLayoutPositionsInches(layoutLengthFeet, spacingInches)
      : enumerateJoistLayoutPositionsInches(layoutLengthFeet, spacingInches);

  return {
    kind,
    spacingInches,
    positionsInches,
  };
}

/**
 * Layout panels for a wall sheathing area.
 *
 * Delegates to layoutPanelPieces with stud support positions.
 */
export function layoutWallPanels(
  areaId: ObjectId,
  wallLengthFeet: number | null,
  wallHeightFeet: number | null,
  panelWidthInches: number | null,
  panelHeightInches: number | null,
  studSpacingInches: number | null,
  openings: OpeningGeometry[] = [],
): PanelLayoutResult {
  const surfaceWidthInches =
    wallLengthFeet !== null ? wallLengthFeet * 12 : null;
  const surfaceHeightInches =
    wallHeightFeet !== null ? wallHeightFeet * 12 : null;

  const supportPositions =
    surfaceWidthInches !== null && studSpacingInches !== null
      ? generateSupportPositions(
          "stud",
          wallLengthFeet!,
          studSpacingInches,
        )
      : null;

  return layoutPanelPieces({
    areaId,
    surfaceWidthInches,
    surfaceHeightInches,
    panelWidthInches,
    panelHeightInches,
    supportPositions,
    openings,
  });
}

/**
 * Layout panels for a floor sheathing area.
 *
 * Delegates to layoutPanelPieces with joist support positions.
 */
export function layoutFloorPanels(
  areaId: ObjectId,
  floorWidthFeet: number | null,
  floorDepthFeet: number | null,
  panelWidthInches: number | null,
  panelHeightInches: number | null,
  joistSpacingInches: number | null,
  openings: OpeningGeometry[] = [],
): PanelLayoutResult {
  const surfaceWidthInches =
    floorWidthFeet !== null ? floorWidthFeet * 12 : null;
  const surfaceHeightInches =
    floorDepthFeet !== null ? floorDepthFeet * 12 : null;

  const supportPositions =
    surfaceWidthInches !== null && joistSpacingInches !== null
      ? generateSupportPositions(
          "joist",
          floorWidthFeet!,
          joistSpacingInches,
        )
      : null;

  return layoutPanelPieces({
    areaId,
    surfaceWidthInches,
    surfaceHeightInches,
    panelWidthInches,
    panelHeightInches,
    supportPositions,
    openings,
  });
}
