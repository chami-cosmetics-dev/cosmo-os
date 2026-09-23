/**
 * ERP2 brands that skip OGF (Standard only).
 * ERP1: only Cerave needs OGF; every other brand is Standard-only.
 */
export const ERP2_OGF_SKIP_BRANDS = [
  "Acnes",
  "Hada Labo",
  "Jovees",
  "Keune",
  "lipIce",
  "Melano CC",
  "Olay",
  "Palmers",
  "Savol",
  "wella",
  "ZGTS",
  "Sebamed",
  "Cerave",
] as const;

/** @deprecated alias — use ERP2_OGF_SKIP_BRANDS */
export const STANDARD_ONLY_BRANDS = ERP2_OGF_SKIP_BRANDS;

const ERP2_OGF_SKIP_SET = new Set(
  ERP2_OGF_SKIP_BRANDS.map((b) => normalizeBrand(b)),
);

export function normalizeBrand(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function isCerave(normalized: string): boolean {
  return normalized === "cerave";
}

/**
 * Whether this brand must have an OGF price on the given ERP.
 * - ERP1: only Cerave needs OGF; all other brands Standard only.
 * - ERP2: skip list (incl. Cerave) no OGF; all other brands yes.
 */
export function brandRequiresOgf(
  brand: string | null | undefined,
  erp: "erp1" | "erp2",
): boolean {
  const n = normalizeBrand(brand);
  if (erp === "erp1") {
    return isCerave(n);
  }
  // ERP2
  if (!n) return true; // unknown brand → require both (safer)
  if (ERP2_OGF_SKIP_SET.has(n)) return false;
  return true;
}

/**
 * Gap vs Standard / OGF, honouring brand OGF rules.
 * Standard is always required. OGF only when brandRequiresOgf.
 */
export function classifyPriceGapForBrand(input: {
  hasStandard: boolean;
  hasOgf: boolean;
  brand: string | null | undefined;
  erp: "erp1" | "erp2";
}): "Standard" | "OGF" | "Both" | null {
  const needsOgf = brandRequiresOgf(input.brand, input.erp);
  if (!needsOgf) {
    return input.hasStandard ? null : "Standard";
  }
  if (input.hasStandard && input.hasOgf) return null;
  if (!input.hasStandard && !input.hasOgf) return "Both";
  if (!input.hasStandard) return "Standard";
  return "OGF";
}
