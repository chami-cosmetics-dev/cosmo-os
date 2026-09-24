import { isVaultOsDeployment } from "@/lib/falcon-waybill-brand";

/**
 * Cosmetics.lk ERP Select options for Product Priority (union of ERP1 + ERP2).
 * Shared by Items filter (client) and page-data (server).
 */
export const ERP_PRODUCT_PRIORITY_OPTIONS = [
  "Top Priority",
  "Priority",
  "Non Priority",
  "Newly Added",
  "Discontinue",
  "Vat",
] as const;

/** SupplementVault.lk Item.custom_product_priority options. */
export const VAULT_ERP_PRODUCT_PRIORITY_OPTIONS = [
  "Top Priority",
  "Low priority",
  "Newly added",
  "Discontinue",
] as const;

export function erpProductPriorityFilterOptions(): readonly string[] {
  return isVaultOsDeployment()
    ? VAULT_ERP_PRODUCT_PRIORITY_OPTIONS
    : ERP_PRODUCT_PRIORITY_OPTIONS;
}

export function mergeErpPriorityFilterOptions(fromDb: Iterable<string>): Array<{ id: string; name: string }> {
  const set = new Set<string>();
  for (const value of erpProductPriorityFilterOptions()) set.add(value);
  for (const value of fromDb) {
    const trimmed = value.trim();
    if (trimmed) set.add(trimmed);
  }
  return Array.from(set)
    .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }))
    .map((name) => ({ id: name, name }));
}
