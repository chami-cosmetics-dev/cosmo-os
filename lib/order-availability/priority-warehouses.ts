import "server-only";

import { listTransferWarehouses, resolveTransferSlots } from "@/lib/material-transfer/erp";
import { isMainWarehouseName } from "@/lib/material-transfer/warehouses";
import type { TransferWarehouse } from "@/lib/material-transfer/types";
import { OsfErpError } from "@/lib/osf/erp-stock";
import {
  PRIORITY_WAREHOUSE_SLOTS,
  type PriorityWarehouseSlot,
  type WarehousePriority,
} from "@/lib/order-availability/types";
import { prisma } from "@/lib/prisma";

export function isWarehousePriority(value: number): value is WarehousePriority {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

export function toPriorityMap(
  rows: Array<{ warehouse: string; priority: number }>,
): Map<string, WarehousePriority> {
  const map = new Map<string, WarehousePriority>();
  for (const row of rows) {
    if (!isWarehousePriority(row.priority)) continue;
    const warehouse = row.warehouse.trim();
    if (!warehouse) continue;
    map.set(warehouse, row.priority);
  }
  return map;
}

export async function listOrderAvailabilityMainWarehouses(companyId: string): Promise<TransferWarehouse[]> {
  const erp2 = (await resolveTransferSlots(companyId)).erp2;
  if (!erp2) throw new OsfErpError("ERP2 is not configured");
  const out: TransferWarehouse[] = [];
  for (const row of await listTransferWarehouses(erp2.cfg)) {
    if (!isMainWarehouseName(row.name)) continue;
    out.push(row);
  }
  return out.sort((a, b) => a.company.localeCompare(b.company) || a.name.localeCompare(b.name));
}

export async function loadPriorityWarehouseRows(companyId: string) {
  return prisma.orderAvailabilityPriorityWarehouse.findMany({
    where: { companyId },
    select: { warehouse: true, priority: true },
    orderBy: { priority: "asc" },
  });
}

export function slotsFromRows(
  rows: Array<{ warehouse: string; priority: number }>,
  warehouses: TransferWarehouse[],
): PriorityWarehouseSlot[] {
  const companyByWarehouse = new Map(warehouses.map((row) => [row.name, row.company]));
  const byPriority = toPriorityMap(rows);
  return PRIORITY_WAREHOUSE_SLOTS.map((priority) => {
    const warehouse = [...byPriority].find(([, slot]) => slot === priority)?.[0] ?? null;
    return {
      priority,
      warehouse,
      company: warehouse ? (companyByWarehouse.get(warehouse) ?? null) : null,
    };
  });
}

export async function savePriorityWarehouses(
  companyId: string,
  slots: Array<{ priority: WarehousePriority; warehouse: string | null }>,
  allowedWarehouses: Set<string>,
): Promise<Array<{ warehouse: string; priority: WarehousePriority }>> {
  const filled: Array<{ warehouse: string; priority: WarehousePriority }> = [];
  for (const slot of slots) {
    const warehouse = slot.warehouse?.trim() || null;
    if (!warehouse) continue;
    if (!allowedWarehouses.has(warehouse)) {
      throw new OrderAvailabilityPriorityError(`"${warehouse}" is not an ERP2 main warehouse`);
    }
    filled.push({ priority: slot.priority, warehouse });
  }

  await prisma.$transaction(async (tx) => {
    await tx.orderAvailabilityPriorityWarehouse.deleteMany({ where: { companyId } });
    if (filled.length === 0) return;
    await tx.orderAvailabilityPriorityWarehouse.createMany({
      data: filled.map((row) => ({
        companyId,
        warehouse: row.warehouse,
        priority: row.priority,
      })),
    });
  });

  return filled;
}

export class OrderAvailabilityPriorityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderAvailabilityPriorityError";
  }
}
