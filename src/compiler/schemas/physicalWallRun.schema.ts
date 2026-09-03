import { z } from "zod";

const pointSchema = z.object({ x: z.number(), y: z.number() });

const centerlineSchema = z.object({
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
});

export const physicalWallRunSchema = z.object({
  id: z.string().trim().min(1),
  physicalRunKey: z.string().trim().min(1),
  pageNumber: z.number().int().positive(),
  orientation: z.enum(["H", "V"]),
  sourceCandidateIds: z.array(z.string()),
  faceSegmentIds: z.array(z.number()),
  thicknessPt: z.number().nullable(),
  centerline: centerlineSchema,
  endpoints: z.tuple([pointSchema, pointSchema]),
  lengthPt: z.number(),
  mid: pointSchema,
  openingGapSuspects: z.array(
    z.object({
      along: z.string(),
      gapPt: z.number(),
      at: pointSchema,
    }),
  ),
  junctions: z.array(
    z.object({
      kind: z.enum(["corner", "T", "unknown", "unresolved"]),
      at: pointSchema,
      otherRunId: z.string().optional(),
    }),
  ),
  connectedRunIds: z.array(z.string()),
  wallAuthority: z.enum(["high", "medium", "low", "reject"]),
  authorityScore: z.number(),
  authorityReasons: z.array(z.string()),
});

export type PhysicalWallRunRecord = z.infer<typeof physicalWallRunSchema>;
