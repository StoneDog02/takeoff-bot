import type { CompiledDrawingPage } from "../../compiler/schemas/compiledDrawingPage.schema.js";
import {
  geometryDimObservationSchema,
  type GeometryDimObservation,
} from "./geometryDimObservation.js";

const NEARBY_TEXT_CAP = 6;
const NEARBY_CHAR_CAP = 80;

function bboxCenter(bbox: {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}): { x: number; y: number } {
  return { x: (bbox.x0 + bbox.x1) / 2, y: (bbox.y0 + bbox.y1) / 2 };
}

function distance(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Recallable compiler dimension spans. Not construction conclusions —
 * do not mint joistLayoutLengthFeet from these records.
 * associatedRunKey locates the dim on the sheet; it is not exclusive wall
 * ownership and is not a license to copy parsedFeet onto floor layout.
 */
export function buildGeometryDimObservationsFromCompiledPages(
  pages: readonly CompiledDrawingPage[],
): GeometryDimObservation[] {
  const observations: GeometryDimObservation[] = [];

  for (const page of pages) {
    const associationByDim = new Map(
      page.ownership.associations.map((association) => [
        association.dimId,
        association,
      ]),
    );
    const transcriptionByDim = new Map(
      page.transcriptions.map((transcription) => [
        transcription.dimId,
        transcription,
      ]),
    );

    for (const dim of page.geometry.dims) {
      const association = associationByDim.get(dim.id);
      const transcription = transcriptionByDim.get(dim.id);
      const parsedFeet =
        association?.parse?.status === "ok" && association.parse.feet != null
          ? association.parse.feet
          : transcription?.parseStatus === "ok"
            ? transcription.parsedFeet
            : null;
      if (parsedFeet == null || !(parsedFeet > 0)) {
        continue;
      }

      const primitive = page.text.primitives.find(
        (entry) => entry.id === transcription?.textPrimitiveId,
      );
      const center = primitive
        ? bboxCenter(primitive.bbox)
        : { x: page.pageWidth / 2, y: page.pageHeight / 2 };
      const nearbyText = page.text.primitives
        .filter((entry) => entry.id !== primitive?.id)
        .map((entry) => ({
          text: entry.rawText.trim(),
          dist: distance(center, bboxCenter(entry.bbox)),
        }))
        .filter((entry) => entry.text.length > 0)
        .sort((left, right) => left.dist - right.dist)
        .slice(0, NEARBY_TEXT_CAP)
        .map((entry) => entry.text.slice(0, NEARBY_CHAR_CAP));

      observations.push(
        geometryDimObservationSchema.parse({
          id: `geo-dim:p${page.pageNumber}:${dim.id}`,
          pageNumber: page.pageNumber,
          parsedFeet,
          orientation: dim.orientation,
          bbox: primitive?.bbox ?? null,
          associatedRunKey: association?.physicalRunKey ?? null,
          nearbyText,
          rawText:
            association?.parse?.originalText ??
            association?.ocrText ??
            transcription?.rawText ??
            "",
        }),
      );
    }
  }

  return observations;
}

export function selectGeometryDimObservationsForPages(
  observations: readonly GeometryDimObservation[],
  pageNumbers: readonly number[],
): GeometryDimObservation[] {
  const wanted = new Set(pageNumbers);
  return observations.filter((observation) => wanted.has(observation.pageNumber));
}
