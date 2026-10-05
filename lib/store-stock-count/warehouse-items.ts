import { isVaultOsfExcludedSku } from "@/lib/vault-osf/sku-policy";

export type StockCountCatalogRow = {
  item_code: string;
  item_name: string;
  description: string;
  barcode: string;
};

const SKIP_SKUS = new Set(["TEST", "DELIVERY-CHARGES"]);

function skuHasBinInWarehouses(
  byWarehouse: Map<string, number> | undefined,
  warehouses: Set<string>,
): boolean {
  if (!byWarehouse) return false;
  for (const warehouse of warehouses) {
    if (byWarehouse.has(warehouse)) return true;
  }
  return false;
}

function isCountableSku(sku: string): boolean {
  if (!sku) return false;
  if (SKIP_SKUS.has(sku.toUpperCase())) return false;
  if (isVaultOsfExcludedSku(sku)) return false;
  return true;
}

/** Enabled catalog rows that have a Bin in the selected warehouses. */
export function catalogForWarehouses(
  catalog: StockCountCatalogRow[],
  binQty: Map<string, Map<string, number>>,
  warehouses: string[],
): StockCountCatalogRow[] {
  const wanted = new Set(warehouses.map((name) => name.trim()).filter(Boolean));
  if (wanted.size === 0) return [];

  const binSkuSet = new Set<string>();
  for (const [itemCode, byWarehouse] of binQty) {
    const sku = itemCode.trim();
    if (!sku || !isCountableSku(sku)) continue;
    if (!skuHasBinInWarehouses(byWarehouse, wanted)) continue;
    binSkuSet.add(sku);
  }

  const seen = new Set<string>();
  const out: StockCountCatalogRow[] = [];
  for (const row of catalog) {
    const sku = row.item_code.trim();
    if (!sku || !isCountableSku(sku) || !binSkuSet.has(sku) || seen.has(sku)) {
      continue;
    }
    seen.add(sku);
    out.push(row);
  }
  return out;
}
