import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { fetchOutletReviewSheetData } from "@/lib/page-data/outlet-review-sheet";
import { formatAppDate, formatAppIsoDate } from "@/lib/format-datetime";
import { hasPermission, requireAnyPermission } from "@/lib/rbac";

function formatDate(iso: string) {
  return formatAppDate(iso, iso);
}

function toSheetName(name: string, usedNames: Set<string>): string {
  const fallback = "Outlet";
  const base = (name || fallback)
    .replace(/[\[\]:*?/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31) || fallback;

  let sheetName = base;
  let suffix = 2;
  while (usedNames.has(sheetName)) {
    const suffixText = ` ${suffix}`;
    sheetName = `${base.slice(0, 31 - suffixText.length)}${suffixText}`;
    suffix += 1;
  }
  usedNames.add(sheetName);
  return sheetName;
}

export async function GET(request: NextRequest) {
  const auth = await requireAnyPermission(["outlets.read.all", "outlets.read.assigned"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context.user?.companyId ?? null;
  const viewerUserId = auth.context.user?.id ?? null;
  if (!companyId || !viewerUserId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const canReadAll = hasPermission(auth.context, "outlets.read.all");
  const { searchParams } = request.nextUrl;
  const outletId = searchParams.get("outletId");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const data = await fetchOutletReviewSheetData({
    companyId,
    viewerUserId,
    canReadAll,
    outletId,
    startDate,
    endDate,
  });

  const HEADERS = ["Outlet", "Date", "Merchant", "Customer", "Order No", "Products", "Mobile", "Review Requested", "Review Collected", "Remarks"];
  const workbook = XLSX.utils.book_new();
  const usedSheetNames = new Set<string>();
  const outletReviews = new Map<string, { outletName: string; rows: typeof data.reviews }>();
  const selectedOutletId = outletId && outletId !== "__all" ? outletId : null;
  const exportOutlets = selectedOutletId
    ? data.outlets.filter((outlet) => outlet.id === selectedOutletId)
    : data.outlets;

  for (const outlet of exportOutlets) {
    outletReviews.set(outlet.id, { outletName: outlet.name, rows: [] });
  }
  for (const review of data.reviews) {
    const group = outletReviews.get(review.outletId) ?? { outletName: review.outletName, rows: [] };
    group.rows.push(review);
    outletReviews.set(review.outletId, group);
  }

  const groups = Array.from(outletReviews.values());
  const sheets = groups.length > 0 ? groups : [{ outletName: "Outlet Reviews", rows: data.reviews }];

  for (const sheet of sheets) {
    const rows = sheet.rows.map((r) => [
      r.outletName,
      formatDate(r.orderCreatedAt),
      r.merchantName ?? "",
      r.customerName ?? "",
      r.erpnextInvoiceId ?? r.orderLabel,
      r.productNames.join("; "),
      r.customerPhone ?? "",
      r.reviewRequested,
      r.reviewCollected,
      r.remarks,
    ]);
    const worksheet = XLSX.utils.aoa_to_sheet([HEADERS, ...rows]);
    worksheet["!cols"] = [
      { wch: 18 },
      { wch: 12 },
      { wch: 18 },
      { wch: 24 },
      { wch: 16 },
      { wch: 42 },
      { wch: 14 },
      { wch: 18 },
      { wch: 18 },
      { wch: 32 },
    ];
    XLSX.utils.book_append_sheet(workbook, worksheet, toSheetName(sheet.outletName, usedSheetNames));
  }

  const isStatus = (value: string, expected: "yes" | "already done") => value.trim().toLowerCase() === expected;
  const summaryRows = exportOutlets
    .slice()
    .sort((first, second) => first.name.localeCompare(second.name))
    .map(({ id: outletId, name: outletName }) => {
      const reviews = data.reviews.filter((review) => review.outletId === outletId);
      return {
        Outlet: outletName,
        "Review Requested - Yes": reviews.filter((review) => isStatus(review.reviewRequested, "yes")).length,
        "Review Requested - Already Done": reviews.filter((review) => isStatus(review.reviewRequested, "already done")).length,
        "Review Collected - Yes": reviews.filter((review) => isStatus(review.reviewCollected, "yes")).length,
        "Review Collected - Already Done": reviews.filter((review) => isStatus(review.reviewCollected, "already done")).length,
      };
    });
  const summaryWorksheet = XLSX.utils.json_to_sheet(summaryRows);
  summaryWorksheet["!cols"] = [
    { wch: 28 },
    { wch: 24 },
    { wch: 32 },
    { wch: 24 },
    { wch: 32 },
  ];
  const summaryRange = XLSX.utils.decode_range(summaryWorksheet["!ref"] ?? "A1");
  const summaryHeaderStyle = { fill: { fgColor: { rgb: "17365D" } }, font: { bold: true, color: { rgb: "FFFFFF" } }, alignment: { horizontal: "center", vertical: "center", wrapText: true } };
  for (let column = summaryRange.s.c; column <= summaryRange.e.c; column += 1) {
    const cell = summaryWorksheet[XLSX.utils.encode_cell({ r: 0, c: column })];
    if (cell) cell.s = summaryHeaderStyle;
  }
  summaryWorksheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  summaryWorksheet["!autofilter"] = { ref: XLSX.utils.encode_range(summaryRange) };
  XLSX.utils.book_append_sheet(workbook, summaryWorksheet, "Review Summary");

  const today = formatAppIsoDate(new Date());
  const outletLabel = outletId && outletId !== "__all"
    ? (data.outlets.find((o) => o.id === outletId)?.name ?? "outlet").replace(/\s+/g, "-").toLowerCase()
    : "all";
  const filename = `outlet-reviews-${outletLabel}-${today}.xlsx`;
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
