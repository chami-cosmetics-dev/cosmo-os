import { APP_NAME } from "@/lib/branding";

export type FalconCompanyGroup = {
  slug: string;
  label: string;
  itemName: string;
};

/** Cosmo OS: one Falcon file per Shopify order-series prefix. */
export const COSMO_ORDER_SERIES_PREFIXES = [
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",
] as const;

/** Vault OS: AE, Origins, SupplementVault.lk — SV100 / SV200 / SV300 style refs. */
export const VAULT_ORDER_SERIES_PREFIXES = ["100", "200", "300"] as const;

/** Vault OS deployments use NEXT_PUBLIC_APP_NAME="Vault OS"; Cosmo uses "Cosmo OS". */
export function isVaultOsDeployment(): boolean {
  return APP_NAME.toLowerCase().includes("vault");
}

/** Column W item description follows the active OS deployment. */
export function resolveFalconCompanyGroup(): FalconCompanyGroup {
  if (isVaultOsDeployment()) {
    return {
      slug: "supplements-vitamins",
      label: "Supplements & Vitamins",
      itemName: "Supplements & Vitamins",
    };
  }

  return {
    slug: "cosmetics",
    label: "Cosmetics",
    itemName: "Cosmetics",
  };
}

/** Leading 3-digit series from order ref (Cosmo: 1008101; Vault: SV1008101 / SV300-0063). */
export function extractOrderSeriesPrefix(reference: string): string | null {
  const normalized = reference.trim().replace(/^#/, "").toUpperCase();

  const svMatch = /^SV(\d{3})/.exec(normalized);
  if (svMatch) return svMatch[1];

  const digitMatch = /^(\d{3})/.exec(normalized);
  return digitMatch?.[1] ?? null;
}

/** @deprecated Use extractOrderSeriesPrefix */
export function extractCosmoOrderSeriesPrefix(reference: string): string | null {
  return extractOrderSeriesPrefix(reference);
}

function prefixFromLocationHint(hint: string | null | undefined): string | null {
  if (!hint?.trim()) return null;
  return extractOrderSeriesPrefix(hint) ?? null;
}

/** One Falcon export file per order-series prefix (same flow on Cosmo OS and Vault OS). */
export function resolveFalconExportGroupKey(row: {
  reference: string;
  shopdropRef?: string;
  locationName?: string;
  locationReference?: string;
  manualInvoicePrefix?: string | null;
  exportGroupKey?: string;
}): string {
  if (row.exportGroupKey?.trim()) {
    return row.exportGroupKey.trim();
  }

  const reference = (row.reference || row.shopdropRef || "").trim();
  const fromReference = extractOrderSeriesPrefix(reference);
  if (fromReference) return fromReference;

  for (const hint of [row.locationReference, row.manualInvoicePrefix, row.locationName]) {
    const fromLocation = prefixFromLocationHint(hint);
    if (fromLocation) return fromLocation;
  }

  return "unknown";
}
