export const REFERENCE_MECHANISM_VALUES = [
  "TAG",
  "TAG_LEADER",
  "KEYED_NOTE",
  "GRAPHIC_CONVENTION",
  "MIXED",
  "NOT_ESTABLISHED",
] as const;

export type ReferenceMechanism = (typeof REFERENCE_MECHANISM_VALUES)[number];

export type ConventionInventoryEntry = {
  id: string;
  conventionClass: string;
  count: number;
  pageRegions: Array<{ x0: number; y0: number; x1: number; y1: number }>;
  rawVectorCharacteristics?: {
    strokeWidthRange?: [number, number];
    orientation?: string;
    segmentIds?: number[];
  };
  ocrText?: string | null;
  normalizedKeys?: string[];
  relationshipToPbgRuns?: Array<{
    physicalRunKey: string;
    distancePt: number;
    coincidenceScore?: number;
  }>;
  humanInterpretationEvidence: string;
  confidence: "high" | "medium" | "low";
  canEstablishSemanticKey: boolean;
  requiresFurtherResearch: boolean;
  sampleIds?: string[];
};

export type Phase0ProofTarget = {
  selectedPhysicalRunKey: string | null;
  discoveredSemanticKey: string | null;
  referenceMechanism: ReferenceMechanism;
  conventionEntryIds: string[];
  ownershipTestMethod: string | null;
  matchingDefinitionId: string | null;
  rationale: string[];
};
