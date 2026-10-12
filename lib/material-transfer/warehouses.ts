import { isShopWarehouseName } from "@/lib/item-trends/shop-warehouse-name";

import type { TransferSlot, TransferWarehouse } from "@/lib/material-transfer/types";

export function isMainWarehouseName(name: string | null | undefined): boolean {
  const n = (name ?? "").trim().toLowerCase();
  if (!n) return false;
  if (n.includes("goods in transit") || n.includes("work in progress")) return false;
  return /\bmain\b/.test(n);
}

export function isTransferWarehouseChoice(name: string | null | undefined): boolean {
  return isMainWarehouseName(name) || isShopWarehouseName(name);
}

export function sortTransferWarehouses(list: TransferWarehouse[]): TransferWarehouse[] {
  return [...list].sort((a, b) => {
    const aMain = isMainWarehouseName(a.name) ? 0 : 1;
    const bMain = isMainWarehouseName(b.name) ? 0 : 1;
    if (aMain !== bMain) return aMain - bMain;
    return a.name.localeCompare(b.name);
  });
}

/** ERP2 company list: companies that have a main or shop warehouse. */
export function companiesForErp2(warehouses: TransferWarehouse[]): string[] {
  const names = new Set<string>();
  for (const row of warehouses) {
    const company = row.company.trim();
    if (!company) continue;
    if (isTransferWarehouseChoice(row.name)) names.add(company);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

/**
 * ERP1: every warehouse.
 * ERP2: main and shop warehouses for the selected company.
 */
export function warehouseOptions(
  slot: TransferSlot,
  warehouses: TransferWarehouse[],
  company: string | null,
): TransferWarehouse[] {
  const rows = warehouses.filter((row) => row.name.trim() && row.company.trim());
  if (slot === "erp1") return sortTransferWarehouses(rows);
  const companyName = (company ?? "").trim();
  if (!companyName) return [];
  return sortTransferWarehouses(
    rows.filter(
      (row) => row.company.trim() === companyName && isTransferWarehouseChoice(row.name),
    ),
  );
}

export function defaultSourceWarehouse(options: TransferWarehouse[]): string {
  return options.find((row) => isMainWarehouseName(row.name))?.name ?? "";
}

export function defaultTargetWarehouse(options: TransferWarehouse[]): string {
  return options.find((row) => isShopWarehouseName(row.name))?.name ?? "";
}

export function companyForWarehouses(
  source: string,
  target: string,
  options: TransferWarehouse[],
): string {
  const sourceRow = options.find((row) => row.name === source);
  const targetRow = options.find((row) => row.name === target);
  if (!sourceRow) throw new Error("Source warehouse is not available for this transfer");
  if (!targetRow) throw new Error("Target warehouse is not available for this transfer");
  if (sourceRow.name === targetRow.name) {
    throw new Error("Source and target warehouse must be different");
  }
  if (sourceRow.company !== targetRow.company) {
    throw new Error("Source and target warehouse must belong to the same company");
  }
  return sourceRow.company;
}
