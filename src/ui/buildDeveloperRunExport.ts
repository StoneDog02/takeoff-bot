import type { FramingTakeoff } from "../framing/schemas/framingTakeoff.schema.js";
import type { ProductAccounting } from "../framing/schemas/productAccounting.schema.js";

/**
 * Faithful developer-run export of existing developer view-state.
 * Does not invent diagnostic architecture — wraps what developer mode already returns.
 */
export type DeveloperRunExportInput = {
  sessionId: string;
  projectId: string;
  pdfPath: string;
  takeoff: FramingTakeoff;
  takeoffPath: string | null;
  accountingPath: string | null;
  accounting: ProductAccounting;
  materialCount: number;
  limitations: string[];
};

export type DeveloperRunExport = {
  exportKind: "framing-developer-run";
  exportVersion: 1;
  exportedAt: string;
  accessMode: "developer";
  sessionId: string;
  projectId: string;
  pdfPath: string;
  materialCount: number;
  takeoffPath: string | null;
  accountingPath: string | null;
  limitations: string[];
  takeoff: FramingTakeoff;
  accounting: ProductAccounting;
};

export function buildDeveloperRunExport(
  state: DeveloperRunExportInput,
  exportedAt: string = new Date().toISOString(),
): DeveloperRunExport {
  return {
    exportKind: "framing-developer-run",
    exportVersion: 1,
    exportedAt,
    accessMode: "developer",
    sessionId: state.sessionId,
    projectId: state.projectId,
    pdfPath: state.pdfPath,
    materialCount: state.materialCount,
    takeoffPath: state.takeoffPath,
    accountingPath: state.accountingPath,
    limitations: [...state.limitations],
    takeoff: state.takeoff,
    accounting: state.accounting,
  };
}

/** Contractor CSV from material lines (customer-safe columns). */
export function buildContractorCsv(
  materials: ReadonlyArray<{
    material?: string;
    description?: string;
    lengthOrType?: string | null;
    quantity: number;
    unit: string;
  }>,
): string {
  const groups = new Map<
    string,
    { material: string; lengthOrType: string | null; quantity: number; unit: string }
  >();

  for (const line of materials) {
    const material = line.material ?? line.description ?? "";
    const lengthOrType = line.lengthOrType ?? null;
    const unit = line.unit ?? "";
    const key = `${material}\u0000${lengthOrType ?? ""}\u0000${unit}`;
    const existing = groups.get(key);
    if (existing) {
      existing.quantity += Number(line.quantity) || 0;
    } else {
      groups.set(key, {
        material,
        lengthOrType,
        quantity: Number(line.quantity) || 0,
        unit,
      });
    }
  }

  const formatUnit = (unit: string): string => {
    if (unit === "each") return "pcs";
    if (unit === "linear-foot") return "LF";
    if (unit === "square-foot") return "SF";
    if (unit === "sheet") return "sheets";
    return unit;
  };

  const rows = [...groups.values()].sort((a, b) => {
    const byMaterial = a.material.localeCompare(b.material);
    if (byMaterial !== 0) return byMaterial;
    return String(a.lengthOrType ?? "").localeCompare(String(b.lengthOrType ?? ""));
  });

  return [
    "Material,Length / Type,Quantity,Unit",
    ...rows.map((row) => {
      const material = `"${String(row.material).replaceAll('"', '""')}"`;
      const lengthOrType = `"${String(row.lengthOrType ?? "").replaceAll('"', '""')}"`;
      return `${material},${lengthOrType},${row.quantity},${formatUnit(row.unit)}`;
    }),
  ].join("\n");
}
