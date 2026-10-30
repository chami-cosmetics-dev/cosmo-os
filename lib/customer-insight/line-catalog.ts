import { vatStatusLabel } from "@/lib/osf/vat-membership";
import { productPriorityLabel, skuKey } from "@/lib/vat-status/types";

export type InsightProductCatalogFields = {
  sku?: string | null;
  erp1ProductPriority: string | null;
  erp2ProductPriority: string | null;
  erp1TaxStatus: string | null;
  erp2TaxStatus: string | null;
};

export type InsightLineCatalogLabels = {
  priority: string | null;
  vatStatus: string | null;
};

export function insightLineCatalogLabels(
  item: InsightProductCatalogFields,
): InsightLineCatalogLabels {
  const priority = productPriorityLabel(item.erp1ProductPriority, item.erp2ProductPriority).trim();
  const vatStatus = vatStatusLabel({
    erp1TaxStatus: item.erp1TaxStatus,
    erp2TaxStatus: item.erp2TaxStatus,
  }).trim();
  return {
    priority: priority || null,
    vatStatus: vatStatus || null,
  };
}

export function insightCatalogLabelsBySku(
  rows: InsightProductCatalogFields[],
): Map<string, InsightLineCatalogLabels> {
  const map = new Map<string, InsightLineCatalogLabels>();
  for (const row of rows) {
    const key = skuKey(row.sku ?? "");
    if (!key || map.has(key)) continue;
    map.set(key, insightLineCatalogLabels(row));
  }
  return map;
}
