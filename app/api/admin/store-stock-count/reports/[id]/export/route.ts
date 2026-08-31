import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { requireStoreStockCountAccess } from "@/lib/store-stock-count/auth";
import { buildStockCountPdfBuffer } from "@/lib/store-stock-count/export-pdf";
import {
  buildStockCountSnapshot,
  filenameSafe,
  snapshotRowValues,
  type StockCountSnapshot,
} from "@/lib/store-stock-count/export-snapshot";
import { getStoreStockCountReport } from "@/lib/store-stock-count/reports";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildCsv(snapshot: StockCountSnapshot) {
  const lines = [
    csvCell(snapshot.title),
    [
      "Ongoing",
      snapshot.ongoing,
      "Done",
      snapshot.done,
      "Difference",
      snapshot.difference,
      "Pending",
      snapshot.pending,
    ]
      .map(csvCell)
      .join(","),
    "",
    snapshot.headers.map(csvCell).join(","),
  ];
  for (const row of snapshot.rows) {
    lines.push(snapshotRowValues(snapshot, row).map(csvCell).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

function buildXlsx(snapshot: StockCountSnapshot) {
  const workbook = XLSX.utils.book_new();
  const items = XLSX.utils.aoa_to_sheet([
    [snapshot.title],
    ["Status", snapshot.status],
    ["Captured at", snapshot.capturedAt],
    [
      "Note",
      snapshot.countView === "personal"
        ? snapshot.viewerLabel
          ? `Your counts only (${snapshot.viewerLabel}). Other counters are not in this file.`
          : "Your counts only. Other counters are not in this file."
        : snapshot.isDraft
          ? "Combined counts. Counting can continue after this download."
          : "Submitted report. Counts are locked.",
    ],
    [],
    ["Ongoing", snapshot.ongoing],
    ["Done", snapshot.done],
    ["Difference", snapshot.difference],
    ["Pending", snapshot.pending],
    ["Total items", snapshot.itemCount],
    ["Total manual count", snapshot.totalManualCount],
    [],
    snapshot.headers,
    ...snapshot.rows.map((row) => snapshotRowValues(snapshot, row)),
  ]);
  XLSX.utils.book_append_sheet(workbook, items, "Items");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export async function GET(request: NextRequest, context: Ctx) {
  const auth = await requireStoreStockCountAccess();
  if (!auth.ok)
    return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await context.params;
  const report = await getStoreStockCountReport({
    companyId: auth.companyId,
    reportId: id,
    viewerUserId: auth.context.user.id,
  });
  if (!report)
    return NextResponse.json({ error: "Report not found" }, { status: 404 });

  const formatParam = request.nextUrl.searchParams.get("format")?.toLowerCase();
  const format =
    formatParam === "pdf" || formatParam === "csv" ? formatParam : "xlsx";
  const viewerLabel =
    auth.context.user.name?.trim() ||
    auth.context.user.email?.trim() ||
    null;
  const snapshot = buildStockCountSnapshot(report, new Date(), viewerLabel);
  const suffix =
    snapshot.countView === "personal"
      ? filenameSafe(viewerLabel ?? "my-counts")
      : "combined";
  const stamp = snapshot.capturedAt.slice(0, 16).replace(/[:T]/g, "-");
  const base = `${filenameSafe(report.title)}-${suffix}-${stamp}`;

  if (format === "pdf") {
    const buffer = await buildStockCountPdfBuffer(snapshot);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${base}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  }

  if (format === "xlsx") {
    const buffer = buildXlsx(snapshot);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${base}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const csv = buildCsv(snapshot);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${base}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
