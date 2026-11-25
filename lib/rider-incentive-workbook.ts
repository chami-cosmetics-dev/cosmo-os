import * as XLSX from "xlsx-js-style";

import type { IncentiveStatementCompany } from "@/lib/rider-incentive-statement";

export type RiderIncentiveWorkbookRider = {
  riderName: string;
  companies: IncentiveStatementCompany[];
  shippingTotal: string;
  riderPaymentTotal: string;
  unmatchedCount: number;
};

type Cell = string | number;

const HEADER_STYLE = {
  fill: { fgColor: { rgb: "17365D" } },
  font: { bold: true, color: { rgb: "FFFFFF" } },
  alignment: { horizontal: "center", vertical: "center" },
};

const TOTAL_STYLE = { font: { bold: true } };
const MONEY_FORMAT = "0.00";

const PAY_HEADERS = [
  "Rider",
  "Delivery completed",
  "Shopify order number",
  "ERP invoice",
  "Company",
  "Customer",
  "Phone",
  "Address",
  "Delivery city",
  "Order shipping",
  "How we pay",
  "Amount allocated",
  "Invoice status",
  "Pick up",
] as const;

const MONEY_HEADERS = new Set(["Incentive", "Shipping cost", "Rider payment", "Amount allocated"]);

function cents(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

function payRows(riders: RiderIncentiveWorkbookRider[]): Cell[][] {
  const rows: Cell[][] = [Array.from(PAY_HEADERS)];
  let allocatedCents = 0;
  for (const rider of riders) {
    for (const company of rider.companies) {
      for (const order of company.orders) {
        const allocated = cents(order.riderPayment);
        allocatedCents += allocated;
        rows.push([
          rider.riderName,
          order.deliveryCompletedAt || order.date,
          order.shopifyOrderNumber,
          order.invoiceNumber,
          company.company,
          order.customerName,
          order.phone,
          order.address,
          order.deliveryCity,
          order.orderShipping,
          order.payMethod,
          allocated / 100,
          order.invoiceStatus,
          order.pickup ? "Yes" : "No",
        ]);
      }
    }
  }
  rows.push(["Total", "", "", "", "", "", "", "", "", "", "", allocatedCents / 100, "", ""]);
  return rows;
}

function sheetFromRows(rows: Cell[][], options?: { totalRow?: boolean }) {
  const sheet = XLSX.utils.aoa_to_sheet(rows.length > 0 ? rows : [[]]);
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
  const lastDataRow = options?.totalRow ? Math.max(range.s.r, range.e.r - 1) : range.e.r;

  for (let column = range.s.c; column <= range.e.c; column += 1) {
    const header = sheet[XLSX.utils.encode_cell({ r: 0, c: column })];
    if (header) header.s = HEADER_STYLE;
    const label = String(rows[0]?.[column] ?? "");
    if (!MONEY_HEADERS.has(label)) continue;
    for (let row = 1; row <= range.e.r; row += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (cell && typeof cell.v === "number") cell.z = MONEY_FORMAT;
    }
  }

  if (options?.totalRow && range.e.r > 0) {
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: range.e.r, c: column })];
      if (cell) cell.s = { ...TOTAL_STYLE, ...(cell.s ?? {}) };
    }
  }

  sheet["!cols"] = Array.from({ length: range.e.c - range.s.c + 1 }, (_, column) => {
    let width = 12;
    for (const row of rows) {
      width = Math.max(width, String(row[column] ?? "").length + 2);
    }
    return { wch: Math.min(40, width) };
  });
  sheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  if (lastDataRow > 0) {
    sheet["!autofilter"] = {
      ref: XLSX.utils.encode_range({
        s: { r: 0, c: range.s.c },
        e: { r: lastDataRow, c: range.e.c },
      }),
    };
  }
  return sheet;
}

export function buildAllRidersIncentiveWorkbook(riders: RiderIncentiveWorkbookRider[]): Buffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheetFromRows(payRows(riders), { totalRow: true }), "Rider pay");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
