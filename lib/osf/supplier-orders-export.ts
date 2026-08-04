import "server-only";

import { createZip } from "@/lib/falcon-upload";
import { formatAppIsoDate } from "@/lib/format-datetime";
import type { WorkingOrderRow } from "@/lib/osf/supplier-orders-draft";

export type SupplierOrderLine = {
  sku: string;
  description: string;
  orderQty: number;
};

function safeFilePart(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return cleaned || "supplier";
}

/** Group positive allocations by supplier key (id preferred, else name). */
export function groupLinesBySupplier(
  rows: WorkingOrderRow[],
): Map<string, { supplierName: string; lines: SupplierOrderLine[] }> {
  const map = new Map<string, { supplierName: string; lines: SupplierOrderLine[] }>();

  for (const row of rows) {
    for (const allocation of row.allocations) {
      if (!(allocation.qty > 0)) continue;
      const key =
        allocation.supplierId?.trim() ||
        allocation.supplierName.trim().toLowerCase();
      if (!key) continue;
      const existing = map.get(key) ?? {
        supplierName: allocation.supplierName.trim() || key,
        lines: [],
      };
      existing.lines.push({
        sku: row.sku,
        description: row.description,
        orderQty: allocation.qty,
      });
      map.set(key, existing);
    }
  }

  return map;
}

async function buildSupplierWorkbookBuffer(lines: SupplierOrderLine[]): Promise<Buffer> {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Order");
  sheet.addRow(["SKU", "Description", "Order Qty"]);
  sheet.getRow(1).font = { bold: true };
  for (const line of lines) {
    sheet.addRow([line.sku, line.description, line.orderQty]);
  }
  sheet.getColumn(1).width = 18;
  sheet.getColumn(2).width = 40;
  sheet.getColumn(3).width = 12;
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/**
 * Build a zip of one Excel per supplier with positive lines.
 * Caller must validate allocations first.
 */
export async function buildSupplierOrdersZipBuffer(
  rows: WorkingOrderRow[],
  opts?: { asOfDate?: string },
): Promise<{ buffer: Buffer; filename: string; supplierCount: number }> {
  const grouped = groupLinesBySupplier(rows);
  if (grouped.size === 0) {
    throw new Error("No positive supplier allocations to export");
  }

  const date = opts?.asOfDate ?? formatAppIsoDate(new Date());
  const files: Array<{ name: string; content: Buffer }> = [];

  for (const [, group] of grouped) {
    const xlsx = await buildSupplierWorkbookBuffer(group.lines);
    files.push({
      name: `${safeFilePart(group.supplierName)}-order-${date}.xlsx`,
      content: xlsx,
    });
  }

  return {
    buffer: createZip(files),
    filename: `OSF-supplier-orders-${date}.zip`,
    supplierCount: files.length,
  };
}
