import * as XLSX from "xlsx";

import { formatDashboardCouponFilterLabel } from "@/lib/dashboard-coupon-filter";
import type { CouponReportResult, CouponReportRow } from "@/lib/page-data/dashboard-coupon-report";

export const COUPON_REPORT_HEADERS = [
  "Warehouse",
  "Merchant",
  "Online sale",
  "Shop sale (outlet)",
  "Total sale",
  "Order count",
  "Existing customers",
  "Registered customers",
] as const;

function excelRow(row: CouponReportRow) {
  return {
    Warehouse: row.warehouse,
    Merchant: row.merchant,
    "Online sale": row.onlineSale,
    "Shop sale (outlet)": row.shopSale,
    "Total sale": row.totalSale,
    "Order count": row.orderCount,
    "Existing customers": row.existingCustomers,
    "Registered customers": row.registeredCustomers,
  };
}

function sheetRow(row: CouponReportRow): Array<string | number> {
  if (row.kind === "warehouse_header") {
    return [row.warehouse];
  }
  const warehouseLabel = row.kind === "merchant" ? "" : row.warehouse;
  return [
    warehouseLabel,
    row.merchant,
    row.onlineSale,
    row.shopSale,
    row.totalSale,
    row.orderCount,
    row.existingCustomers,
    row.registeredCustomers,
  ];
}

export function buildCouponReportWorkbook(report: CouponReportResult): {
  buffer: Buffer;
  filename: string;
} {
  const couponLabel = formatDashboardCouponFilterLabel(report.couponCodes);
  const aoa: Array<Array<string | number>> = [
    ["Coupon sales report"],
    [`Coupons: ${couponLabel}`],
    [`Period: ${report.fromYmd} – ${report.toYmd} · ${report.dateTypeLabel}`],
    ["Shop sale = POS / outlet. Online sale = website and other non-POS."],
    ["Grand total = Online total + Shop total."],
    [
      "Existing customer = bought before From date. Registered customer = Cosmo contact or Shopify customer on the order. Counts are unique and can overlap.",
    ],
    [],
    [...COUPON_REPORT_HEADERS],
  ];

  for (const row of report.rows) {
    aoa.push(sheetRow(row));
  }

  if (report.rows.length === 0) {
    aoa.push(["", "No coupon sales in this range", 0, 0, 0, 0, 0, 0]);
  }

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet["!cols"] = [
    { wch: 22 },
    { wch: 22 },
    { wch: 14 },
    { wch: 18 },
    { wch: 12 },
    { wch: 12 },
    { wch: 20 },
    { wch: 22 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Coupon sales");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const filename = `coupon-sales-report-${report.fromYmd}-to-${report.toYmd}.xlsx`;
  return { buffer, filename };
}

export function couponReportExcelPreviewRows(report: CouponReportResult) {
  return report.rows.map(excelRow);
}
