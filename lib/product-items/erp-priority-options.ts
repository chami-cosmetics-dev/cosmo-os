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

export function mergeErpPriorityFilterOptions(fromDb: Iterable<string>): Array<{ id: string; name: string }> {
  const set = new Set<string>();
  for (const value of ERP_PRODUCT_PRIORITY_OPTIONS) set.add(value);
  for (const value of fromDb) {
    const trimmed = value.trim();
    if (trimmed) set.add(trimmed);
  }
  return Array.from(set)
    .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }))
    .map((name) => ({ id: name, name }));
}
