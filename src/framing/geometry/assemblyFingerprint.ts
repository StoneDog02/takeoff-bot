import type { Evidence } from "../../core/schemas/evidence.schema.js";
import type { AssemblyFingerprint } from "./constructionSemanticTypes.js";

const APC_PROPERTY_PATHS = new Set([
  "assembly.joistType",
  "assembly.joistSize",
  "assembly.joistSpacingInches",
]);

const FLOOR_JOIST_PRODUCT_PATTERN = /floor\s+joists?|tji|i-joist/i;

export function normalizeJoistSize(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }
  const raw = String(value).trim().toUpperCase().replace(/\s+/g, " ");
  const mixedFraction = raw.match(/(\d+)\s+(\d+\/\d)/);
  if (mixedFraction) {
    return `${mixedFraction[1]}-${mixedFraction[2]}`;
  }
  const hyphenFraction = raw.match(/(\d+)-(\d+\/\d)/);
  if (hyphenFraction) {
    return `${hyphenFraction[1]}-${hyphenFraction[2]}`;
  }
  const decimalFraction = raw.match(/(\d+)\.(\d+\/\d)/);
  if (decimalFraction) {
    return `${decimalFraction[1]}-${decimalFraction[2]}`;
  }
  const tjiSize = raw.match(/\b(\d+(?:-\d+\/\d)?)\s*(?:\"|IN)?\s*TJI\b/);
  if (tjiSize?.[1]) {
    return tjiSize[1];
  }
  return raw.replace(/"/g, "").replace(/\s*TJI\b.*$/i, "").trim();
}

export function detectJoistProductClass(text: string): AssemblyFingerprint["joistProductClass"] {
  const upper = text.toUpperCase();
  if (/\bTJI\b/.test(upper)) {
    return "TJI";
  }
  if (/I-?JOIST/.test(upper)) {
    return "I-JOIST";
  }
  if (/\d+\s*["']?\s*x\s*\d+/i.test(text) || /\d+\s+\d+\/\d/.test(text)) {
    return "DIMENSIONAL";
  }
  return "UNKNOWN";
}

export function isApcPropertyPath(propertyPath: string): boolean {
  return APC_PROPERTY_PATHS.has(propertyPath);
}

export function isApcOriginalText(text: string): boolean {
  return FLOOR_JOIST_PRODUCT_PATTERN.test(text);
}

export function fingerprintFromSystemRecords(
  records: readonly Evidence[],
): AssemblyFingerprint | null {
  const apcRecords = records.filter(
    (record) =>
      record.subjectKind === "floor-framing-system" &&
      (isApcPropertyPath(record.propertyPath) ||
        (record.propertyPath === "name" && isApcOriginalText(record.originalText ?? ""))),
  );

  if (apcRecords.length === 0) {
    return null;
  }

  let joistSize = "";
  let joistSpacingInches: number | null = null;
  let productClass: AssemblyFingerprint["joistProductClass"] = "UNKNOWN";

  for (const record of apcRecords) {
    const text = `${record.originalText ?? ""} ${record.candidateValue ?? ""}`;
    const detected = detectJoistProductClass(text);
    if (detected !== "UNKNOWN") {
      productClass = detected;
    }

    if (record.propertyPath === "assembly.joistSize") {
      joistSize = normalizeJoistSize(record.candidateValue);
    }
    if (
      record.propertyPath === "assembly.joistSpacingInches" &&
      typeof record.candidateValue === "number"
    ) {
      joistSpacingInches = record.candidateValue;
    }
  }

  if (!joistSize && apcRecords.length > 0) {
    const text = apcRecords.map((record) => record.originalText ?? "").join(" ");
    const sizeMatch = text.match(/\d+(?:\s+\d+\/\d)?["']?\s*(?:TJI|I-?JOIST)?/i);
    if (sizeMatch) {
      joistSize = normalizeJoistSize(sizeMatch[0]!);
    }
  }

  if (productClass === "UNKNOWN" && joistSize.length === 0 && joistSpacingInches === null) {
    return null;
  }

  return {
    joistProductClass: productClass,
    joistSize,
    joistSpacingInches,
  };
}

export function assemblyFingerprintKey(fingerprint: AssemblyFingerprint): string {
  return [
    fingerprint.joistProductClass,
    fingerprint.joistSize,
    fingerprint.joistSpacingInches ?? "null",
  ].join("|");
}

export function fingerprintsEqual(
  left: AssemblyFingerprint,
  right: AssemblyFingerprint,
): boolean {
  return assemblyFingerprintKey(left) === assemblyFingerprintKey(right);
}
