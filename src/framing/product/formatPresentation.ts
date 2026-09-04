/**
 * Presentation helpers for Recommended Format fields.
 * Preserve known values only — do not invent construction quantities.
 */

export function formatLengthFeetLabel(lengthFeet: number): string {
  if (!Number.isFinite(lengthFeet) || lengthFeet <= 0) {
    return String(lengthFeet);
  }
  const rounded = Math.round(lengthFeet * 1000) / 1000;
  if (Number.isInteger(rounded)) {
    return `${rounded} ft`;
  }
  return `${rounded} ft`;
}

export function formatStudLengthOrType(
  heightFeet: number | null | undefined,
): string | null {
  if (heightFeet == null || !Number.isFinite(heightFeet) || heightFeet <= 0) {
    return null;
  }
  return `${formatLengthFeetLabel(heightFeet)} studs`;
}
