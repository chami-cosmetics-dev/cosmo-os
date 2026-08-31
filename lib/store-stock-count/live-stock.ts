import type { StoreStockCountWarehouseColumn } from "@/lib/store-stock-count/types";

export function warehouseItemKey(warehouseKey: string, sku: string) {
  return `${warehouseKey}::${sku}`;
}

export function applyLiveWarehouseQty(input: {
  warehouses: Array<Pick<StoreStockCountWarehouseColumn, "key">>;
  sku: string;
  liveQty: Map<string, number>;
}): { stockByWarehouse: Record<string, number>; stockSum: number } {
  const stockByWarehouse: Record<string, number> = {};
  let stockSum = 0;
  for (const warehouse of input.warehouses) {
    const qty =
      input.liveQty.get(warehouseItemKey(warehouse.key, input.sku)) ?? 0;
    stockByWarehouse[warehouse.key] = qty;
    stockSum += qty;
  }
  return { stockByWarehouse, stockSum };
}

export function stockByWarehouseChanged(
  current: Record<string, number | null>,
  next: Record<string, number>,
) {
  const keys = new Set([...Object.keys(current), ...Object.keys(next)]);
  for (const key of keys) {
    if (Number(current[key] ?? 0) !== Number(next[key] ?? 0)) return true;
  }
  return false;
}
