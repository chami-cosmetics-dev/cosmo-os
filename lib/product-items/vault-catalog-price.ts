/**
 * Item Price Standard Selling overwrites Item.standard_rate.
 * ERP1 wins when both lists have the SKU; ERP2 fills gaps.
 * Item.standard_rate stays only when no selling price row exists.
 */
export function applyStandardSellingRatesToCatalog<T extends { standardRate: number }>(
  catalog: Map<string, T>,
  erp1Rates: Map<string, number>,
  erp2Rates: Map<string, number>,
): void {
  const apply = (rates: Map<string, number>) => {
    for (const [sku, rate] of rates) {
      if (!Number.isFinite(rate) || rate <= 0) continue;
      const item = catalog.get(sku.trim().toUpperCase());
      if (item) item.standardRate = rate;
    }
  };
  apply(erp2Rates);
  apply(erp1Rates);
}
