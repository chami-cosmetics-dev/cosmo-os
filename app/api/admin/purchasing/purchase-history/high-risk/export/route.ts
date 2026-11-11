import { NextResponse } from "next/server";
import * as XLSX from "xlsx-js-style";

import { getCurrentColomboReportDate } from "@/lib/grn-pending-email";
import { loadMarginIssuesReport } from "@/lib/margin-issues";
import { prisma } from "@/lib/prisma";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

function currentCycleStart(reportDate: string): Date {
  const date = new Date(`${reportDate}T00:00:00Z`);
  const month = date.getUTCMonth();
  const cycleMonth = 8 + Math.floor(((month - 8 + 12) % 12) / 3) * 3;
  const year = month < 8 ? date.getUTCFullYear() - 1 : date.getUTCFullYear();
  return new Date(Date.UTC(year, cycleMonth, 1));
}

export async function GET() {
  const context = await getCurrentUserContext();
  if (!context?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(context, "purchasing.high_risk.read")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!context.user.companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const reportDate = getCurrentColomboReportDate();
  const cycleStart = currentCycleStart(reportDate);
  const records = await prisma.highRiskReorderRecord.findMany({
    where: { companyId: context.user.companyId, cycleStart, status: "active" },
    orderBy: [{ orderPlaced: "asc" }, { createdAt: "asc" }],
  });
  const report = await loadMarginIssuesReport(context.user.companyId, reportDate);
  const priorityBySku = new Map(report.details.map((row) => [row.sku, row.priority]));
  const rows = records.map((record) => ({
    SKU: record.sku,
    Priority: priorityBySku.get(record.sku) ?? "Unspecified",
    "Record Date": record.createdAt.toISOString().slice(0, 10),
    "Total ROP": record.totalRop,
    "Total Stock": record.totalStock,
    "Reorder Qty": record.reorderQty,
    "Best Price": record.bestPrice?.toString() ?? "",
    "Best Supplier": record.bestSupplier ?? "",
    "Order Placed": record.orderPlaced ? "Yes" : "No",
    Qty: record.orderQty ?? "",
    Supplier: record.orderSupplier ?? "",
    "Receive Date": record.orderReceiveDate?.toISOString().slice(0, 10) ?? "",
    Reason: record.reasonType ?? "",
    "Replacement SKU": record.replacementSku ?? "",
    "Changed Priority": record.changedPriority ?? "",
    "Other Reason": record.otherReason ?? "",
  }));
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const range = XLSX.utils.decode_range(worksheet["!ref"] ?? "A1");
  for (let column = range.s.c; column <= range.e.c; column += 1) {
    const cell = worksheet[XLSX.utils.encode_cell({ r: 0, c: column })];
    if (cell) cell.s = {
      fill: { fgColor: { rgb: "17365D" } },
      font: { bold: true, color: { rgb: "FFFFFF" } },
      alignment: { horizontal: "center", vertical: "center" },
    };
  }
  worksheet["!cols"] = Object.keys(rows[0] ?? {}).map((key) => ({ wch: Math.max(14, Math.min(24, key.length + 3)) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "High Risk Items");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="high-risk-items-${reportDate}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
