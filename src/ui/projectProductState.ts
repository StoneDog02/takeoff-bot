import type {
  FramingPackageProductState,
  PackageProductStateRow,
} from "../scopes/framing/observability/framingPackageProductState.schema.js";

export type ProductPackageDisplayState =
  | "calculated"
  | "partially-resolved"
  | "calculator-starved"
  | "authority-limited"
  | "unsupported";

export type ProductPackageViewRow = PackageProductStateRow & {
  displayState: ProductPackageDisplayState;
  reviewRequired: boolean;
};

export function deriveProductPackageDisplayState(
  row: PackageProductStateRow,
): ProductPackageDisplayState {
  if (row.productionState === "DOMAIN_PIPELINE_UNWIRED") {
    return "unsupported";
  }

  if (row.productionState === "NOT_REACHED") {
    return "partially-resolved";
  }

  if (typeof row.stage16Lines === "number" && row.stage16Lines > 0) {
    return "calculated";
  }

  if (row.firstBrokenHandoff === "TRUE_SOURCE_AUTHORITY_GAP") {
    return "authority-limited";
  }

  if (row.firstBrokenHandoff === "CALCULATOR_STARVED") {
    return "calculator-starved";
  }

  return "partially-resolved";
}

export function deriveProductPackageViewRows(
  state: FramingPackageProductState,
): ProductPackageViewRow[] {
  return state.packages.map((row) => ({
    ...row,
    displayState: deriveProductPackageDisplayState(row),
    reviewRequired: typeof row.review === "number" && row.review > 0,
  }));
}

/** Generic object-id prefix hints for package-scoped review filtering in the UI. */
export const PACKAGE_OBJECT_ID_PREFIXES: Readonly<Record<string, readonly string[]>> =
  {
    Walls: ["WALL-", "SEG-"],
    Openings: ["O-"],
    Floor: ["FFA-", "FFS-"],
    Structural: ["SM-"],
    Sheathing: ["SHA-", "SHS-"],
    Roof: ["RFP-", "RFS-"],
  };

export function reviewItemMatchesPackage(
  objectId: string,
  packageName: string,
): boolean {
  const prefixes = PACKAGE_OBJECT_ID_PREFIXES[packageName];
  if (!prefixes) {
    return false;
  }
  return prefixes.some((prefix) => objectId.startsWith(prefix));
}
