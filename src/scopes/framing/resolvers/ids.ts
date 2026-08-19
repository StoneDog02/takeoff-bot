import {
  identifierSchema,
  objectIdSchema,
  type ObjectId,
} from "../../../core/schemas/identity.schema.js";

/**
 * Deterministic Wall / Wall Segment identity for the Wall Framing resolver.
 *
 * Core identity schemas define the identifier charset and brand, but prefix
 * and generation rules belong to the owning scope. There is no shared
 * ObjectId minting helper, so this module owns the framing convention:
 *
 * 1. Sanitize `subjectKey` to identifier-safe form (trim, whitespace → `-`,
 *    drop characters outside `[A-Za-z0-9._:-]`).
 * 2. If that value already satisfies `identifierSchema`, it is the Wall
 *    ObjectId. Example: subjectKey `W-001` → Wall `W-001`.
 * 3. Otherwise prefix `W-`.
 * 4. Each subject currently produces one Wall Segment: `WS-` + the Wall id
 *    without a leading `W-` prefix. Example: Wall `W-001` → Segment `WS-001`.
 *
 * Distinct subjectKeys that sanitize to the same ObjectId are rejected by
 * `resolveWallFraming`; IDs are never silently suffixed or merged.
 *
 * Assigned ObjectIds are not a claim that `subjectKey` was already resolved
 * object identity. Evidence IDs, UUIDs, clocks, and randomness are never used.
 */
function sanitizeSubjectKey(subjectKey: string): string {
  return subjectKey
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._:-]/g, "");
}

export { sanitizeSubjectKey };

export function createWallObjectId(subjectKey: string): ObjectId {
  const sanitized = sanitizeSubjectKey(subjectKey);
  if (sanitized.length === 0) {
    throw new Error(
      `Cannot derive a Wall ObjectId from subjectKey "${subjectKey}".`,
    );
  }

  const candidate = identifierSchema.safeParse(sanitized).success
    ? sanitized
    : `W-${sanitized}`;

  return objectIdSchema.parse(candidate);
}

export function createWallSegmentObjectId(wallId: ObjectId): ObjectId {
  const segmentId = wallId.startsWith("W-")
    ? `WS-${wallId.slice(2)}`
    : `WS-${wallId}`;

  return objectIdSchema.parse(segmentId);
}

/**
 * Deterministic Structural Member identity for the Structural Members resolver.
 *
 * 1. Sanitize `subjectKey` with the shared subject-key discipline.
 * 2. Prefix `SM-` when the sanitized value is not already SM-prefixed.
 *    Example: subjectKey `HDR-001` → ObjectId `SM-HDR-001`.
 *
 * Distinct subjectKeys that sanitize to the same ObjectId are rejected by
 * `resolveStructuralMembers`; IDs are never silently suffixed or merged.
 */
export function createStructuralMemberObjectId(subjectKey: string): ObjectId {
  const sanitized = sanitizeSubjectKey(subjectKey);
  if (sanitized.length === 0) {
    throw new Error(
      `Cannot derive a Structural Member ObjectId from subjectKey "${subjectKey}".`,
    );
  }

  const candidate = sanitized.startsWith("SM-") ? sanitized : `SM-${sanitized}`;
  return objectIdSchema.parse(candidate);
}

/**
 * Deterministic Opening identity for the Openings resolver.
 *
 * 1. Sanitize `subjectKey` with the shared subject-key discipline.
 * 2. Prefix `O-` when the sanitized value is not already O-prefixed.
 *    Example: subjectKey `O-001` → ObjectId `O-001`.
 *
 * Distinct subjectKeys that sanitize to the same ObjectId are rejected by
 * `resolveOpenings`; IDs are never silently suffixed or merged.
 */
export function createOpeningObjectId(subjectKey: string): ObjectId {
  const sanitized = sanitizeSubjectKey(subjectKey);
  if (sanitized.length === 0) {
    throw new Error(
      `Cannot derive an Opening ObjectId from subjectKey "${subjectKey}".`,
    );
  }

  const candidate = sanitized.startsWith("O-") ? sanitized : `O-${sanitized}`;
  return objectIdSchema.parse(candidate);
}
