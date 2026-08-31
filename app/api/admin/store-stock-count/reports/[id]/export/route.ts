import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { requireStoreStockCountAccess } from "@/lib/store-stock-count/auth";
import { buildStockCountPdfBuffer } from "@/lib/store-stock-count/export-pdf";
import {
  COUNTED_BUCKETS,
  buildStockCountSnapshot,
  countedListRowValues,
  filenameSafe,
  snapshotRowsForBucket,
  type StockCountSnapshot,
} from "@/lib/store-stock-count/export-snapshot";
import {
  getStoreStockCountReport,
  refreshStoreStockCountLiveStock,
} from "@/lib/store-stock-count/reports";

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
    ]
      .map(csvCell)
      .join(","),
  ];
  for (const bucket of COUNTED_BUCKETS) {
    const rows = snapshotRowsForBucket(snapshot, bucket);
    lines.push("");
    lines.push([bucket, rows.length].map(csvCell).join(","));
    lines.push(snapshot.countedListHeaders.map(csvCell).join(","));
    for (const row of rows) {
      lines.push(countedListRowValues(snapshot, row).map(csvCell).join(","));
    }
  }
  return `${lines.join("\r\n")}\r\n`;
}

function buildXlsx(snapshot: StockCountSnapshot) {
  const workbook = XLSX.utils.book_new();
  const summary = XLSX.utils.aoa_to_sheet([
    ["Stock count snapshot"],
    [snapshot.title],
    ["Status", snapshot.status],
    ["Captured at", snapshot.capturedAt],
    [
      "Note",
      snapshot.isDraft
        ? "Draft snapshot. Counting can continue after this download."
        : "Submitted report. Counts are locked.",
    ],
    [],
    ["Ongoing", snapshot.ongoing],
    ["Done", snapshot.done],
    ["Difference", snapshot.difference],
    ["Pending omitted", snapshot.pending],
    ["Counted items", snapshot.counted],
    ["Total items", snapshot.itemCount],
    ["Total manual count", snapshot.totalManualCount],
  ]);
  XLSX.utils.book_append_sheet(workbook, summary, "Summary");

  for (const bucket of COUNTED_BUCKETS) {
    const rows = snapshotRowsForBucket(snapshot, bucket);
    const sheet = XLSX.utils.aoa_to_sheet([
      snapshot.countedListHeaders,
      ...rows.map((row) => countedListRowValues(snapshot, row)),
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, bucket);
  }
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export async function GET(request: NextRequest, context: Ctx) {
  const auth = await requireStoreStockCountAccess();
  if (!auth.ok)
    return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await context.params;
  let report = await getStoreStockCountReport({
    companyId: auth.companyId,
    reportId: id,
  });
  if (!report)
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  if (report.status !== "submitted") {
    try {
      report =
        (await refreshStoreStockCountLiveStock({
          companyId: auth.companyId,
          reportId: id,
          scope: "all",
        })) ?? report;
    } catch {
      // Export last snapshot if live ERP stock cannot be fetched.
    }
  }

  const formatParam = request.nextUrl.searchParams.get("format")?.toLowerCase();
  const format =
    formatParam === "pdf" || formatParam === "csv" ? formatParam : "xlsx";
  const snapshot = buildStockCountSnapshot(report);
  const base = `${filenameSafe(report.title)}-counted`;

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
