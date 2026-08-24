import type { SelectableErpCompany } from "@/lib/store-stock-count/types";

/** Stable key for one ERP company on one instance. */
export function toCompanyKey(input: { instanceId: string; erpCompany: string }): string {
  return `${input.instanceId}::${input.erpCompany.trim()}`;
}

export function parseCompanyKey(key: string): { instanceId: string; erpCompany: string } | null {
  const idx = key.indexOf("::");
  if (idx <= 0 || idx === key.length - 2) return null;
  const instanceId = key.slice(0, idx).trim();
  const erpCompany = key.slice(idx + 2).trim();
  if (!instanceId || !erpCompany) return null;
  return { instanceId, erpCompany };
}

export function companyLabel(c: Pick<SelectableErpCompany, "erpCompany" | "instanceLabel">): string {
  const label = c.instanceLabel.trim();
  return label ? `${c.erpCompany} (${label})` : c.erpCompany;
}

export function normalizeSkuKey(sku: string): string {
  return sku.trim().toUpperCase();
}
