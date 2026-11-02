import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { requireConsultationAccess } from "@/lib/consultation-insights/auth";
import { getConsultationInvoiceValues, listConsultations } from "@/lib/consultation-insights/server";
import {
  CONSULTATION_MONTH_PATTERN,
  formatConsultationMonth,
  summarizeConsultations,
  type ConsultationRow,
} from "@/lib/consultation-insights/shared";

const LOG_HEADERS = [
  "Date",
  "Contact Number",
  "Invoice Number",
  "Invoice Value",
  "Customer Name",
  "Merchant",
  "Merchant Type",
  "Physical Review Update",
];

type InvoiceValues = Map<string, number>;

const MONEY_FORMAT = "#,##0.00";

/** Shows numeric cells in a column as 6,665.00 (still numbers, so Excel can sum them). */
function formatMoneyColumn(sheet: XLSX.WorkSheet, column: number, fromRow: number) {
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
  for (let row = fromRow; row <= range.e.r; row += 1) {
    const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })] as XLSX.CellObject | undefined;
    if (cell?.t === "n") cell.z = MONEY_FORMAT;
  }
}

/** Sum of the invoice values that were found (invoices with no matching order add nothing). */
function totalValue(rows: ConsultationRow[], values: InvoiceValues) {
  return rows.reduce((sum, row) => sum + (values.get(row.invoiceNumber.toUpperCase()) ?? 0), 0);
}

function merchantSummaryRows(rows: ConsultationRow[], values: InvoiceValues): Array<Array<string | number>> {
  const groups = new Map<string, ConsultationRow[]>();
  for (const row of rows) {
    const key = `${row.merchantKind}|${row.merchantName}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()]
    .map((group) => ({ first: group[0], summary: summarizeConsultations(group), value: totalValue(group, values) }))
    .sort(
      (a, b) =>
        b.summary.customers - a.summary.customers || a.first.merchantName.localeCompare(b.first.merchantName),
    )
    .map(({ first, summary, value }) => [
      first.merchantName,
      first.merchantKind === "showroom" ? "Showroom" : "Online merchant",
      summary.customers,
      summary.invoices,
      value,
      summary.reviews,
    ]);
}

export async function GET(request: NextRequest) {
  const access = await requireConsultationAccess();
  if (!access.ok) return access.response;

  const month = request.nextUrl.searchParams.get("month") ?? "";
  if (!CONSULTATION_MONTH_PATTERN.test(month)) {
    return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
  }

  const rows = await listConsultations(access.companyId, month);
  const summary = summarizeConsultations(rows);
  const values = await getConsultationInvoiceValues(
    access.companyId,
    rows.map((row) => row.invoiceNumber),
  );
  const monthTotal = totalValue(rows, values);
  const monthLabel = formatConsultationMonth(month);

  const logSheet = XLSX.utils.aoa_to_sheet([
    [`Physical Consultation Log — ${monthLabel}`],
    [],
    ["Month", monthLabel],
    ["Customers", summary.customers],
    ["Invoices", summary.invoices],
    ["Invoice value", monthTotal],
    ["Reviews", summary.reviews],
    [],
    LOG_HEADERS,
    ...rows.map((row) => [
      row.consultationDate,
      row.contactNumber,
      row.invoiceNumber,
      // Blank when the number matches no order (e.g. typed in by hand).
      values.get(row.invoiceNumber.toUpperCase()) ?? "",
      row.customerName,
      row.merchantName,
      row.merchantKind === "showroom" ? "Showroom" : "Online merchant",
      row.physicalReview,
    ]),
  ]);
  logSheet["!cols"] = [
    { wch: 12 },
    { wch: 15 },
    { wch: 16 },
    { wch: 14 },
    { wch: 26 },
    { wch: 30 },
    { wch: 16 },
    { wch: 48 },
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet([
    [`Summary — ${monthLabel}`],
    [],
    ["Merchant", "Type", "Customers", "Invoices", "Invoice Value", "Reviews"],
    ...merchantSummaryRows(rows, values),
    ["Total", "", summary.customers, summary.invoices, monthTotal, summary.reviews],
  ]);
  summarySheet["!cols"] = [{ wch: 30 }, { wch: 16 }, { wch: 11 }, { wch: 10 }, { wch: 14 }, { wch: 10 }];

  // Consultations: the "Invoice value" summary line (B6) and the Invoice Value column (D) from the data rows.
  const logSummaryValueCell = logSheet["B6"] as XLSX.CellObject | undefined;
  if (logSummaryValueCell?.t === "n") logSummaryValueCell.z = MONEY_FORMAT;
  formatMoneyColumn(logSheet, LOG_HEADERS.indexOf("Invoice Value"), 8);
  // Summary: the Invoice Value column (E), merchant rows + total.
  formatMoneyColumn(summarySheet, 4, 3);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, logSheet, "Consultations");
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="consultation-insights-${month}.xlsx"`,
    },
  });
}
