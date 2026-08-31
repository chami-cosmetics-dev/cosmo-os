import { NextRequest, NextResponse } from "next/server";

import { getStoreStockCountReport } from "@/lib/store-stock-count/reports";
import { requireStoreStockCountAccess } from "@/lib/store-stock-count/auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function filenameSafe(value: string) {
  return (
    value.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") ||
    "stock-count"
  );
}

function itemStatus(
  reportStatus: string,
  manualCount: number | null,
  stockSum: number | null,
) {
  if (manualCount == null) return "Pending";
  if (stockSum == null) return "Difference";
  const diff = manualCount - stockSum;
  if (diff === 0) return "Done";
  if (diff < 0 && reportStatus !== "submitted") return "Ongoing";
  return "Difference";
}

export async function GET(_request: NextRequest, context: Ctx) {
  const auth = await requireStoreStockCountAccess();
  if (!auth.ok)
    return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await context.params;
  const report = await getStoreStockCountReport({
    companyId: auth.companyId,
    reportId: id,
  });
  if (!report)
    return NextResponse.json({ error: "Report not found" }, { status: 404 });

  const hasQbStock = report.items.some((item) => item.qbStock != null);
  const header = [
    "Item Code",
    "Name",
    "Barcode",
    ...report.warehouses.map((w) => w.label),
    "Total Quantity",
    ...(hasQbStock ? ["QB Stock"] : []),
    "Manual Count",
    "Difference",
    "Status",
  ];
  const lines = [header.map(csvCell).join(",")];

  for (const item of report.items) {
    const warehouseStocks = report.warehouses.map(
      (w) => item.stockByWarehouse[w.key] ?? "",
    );
    const diff =
      item.manualCount == null || item.stockSum == null
        ? ""
        : item.manualCount - item.stockSum;
    const status = itemStatus(report.status, item.manualCount, item.stockSum);
    lines.push(
      [
        item.sku,
        item.name,
        item.barcodes.join(" | "),
        ...warehouseStocks,
        item.stockSum ?? "",
        ...(hasQbStock ? [item.qbStock ?? ""] : []),
        item.manualCount ?? "",
        diff,
        status,
      ]
        .map(csvCell)
        .join(","),
    );
  }

  const csv = `${lines.join("\r\n")}\r\n`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filenameSafe(report.title)}.csv"`,
    },
  });
}
