import { isMainWarehouseName } from "@/lib/material-transfer/warehouses";

type ReviewLine = {
  qty: number;
  availableQty: number | null;
};

/** Lines whose send qty is below the main warehouse available qty. Empty when the source is not main. */
export function linesBelowMainAvailable<T extends ReviewLine>(
  sourceWarehouse: string,
  lines: T[],
): T[] {
  if (!isMainWarehouseName(sourceWarehouse)) return [];
  return lines.filter((line) => line.availableQty != null && line.qty < line.availableQty);
}
