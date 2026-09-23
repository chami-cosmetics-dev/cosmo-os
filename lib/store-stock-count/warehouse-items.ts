export type StockCountCatalogRow = {
  item_code: string;
  item_name: string;
  description: string;
  barcode: string;
};

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

/** Keep catalog rows that have a Bin in the selected warehouses. Add bin-only SKUs. */
export function catalogForWarehouses(
  catalog: StockCountCatalogRow[],
  binQty: Map<string, Map<string, number>>,
  warehouses: string[],
): StockCountCatalogRow[] {
  const wanted = new Set(warehouses.map((name) => name.trim()).filter(Boolean));
  if (wanted.size === 0) return [];

  const binSkus: string[] = [];
  const binSkuSet = new Set<string>();
  for (const [itemCode, byWarehouse] of binQty) {
    const sku = itemCode.trim();
    if (!sku) continue;
    if (!skuHasBinInWarehouses(byWarehouse, wanted)) continue;
    if (binSkuSet.has(sku)) continue;
    binSkuSet.add(sku);
    binSkus.push(sku);
  }

  const seen = new Set<string>();
  const out: StockCountCatalogRow[] = [];
  for (const row of catalog) {
    const sku = row.item_code.trim();
    if (!sku || !binSkuSet.has(sku) || seen.has(sku)) continue;
    seen.add(sku);
    out.push(row);
  }
  for (const sku of binSkus) {
    if (seen.has(sku)) continue;
    seen.add(sku);
    out.push({
      item_code: sku,
      item_name: sku,
      description: "",
      barcode: "",
    });
  }
  return out;
}
