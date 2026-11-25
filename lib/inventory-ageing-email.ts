import * as XLSX from "xlsx-js-style";

import { INVENTORY_AGEING_SUMMARY_DAILY_KEY, builtinTemplateByKey } from "@/lib/email-templates/catalog";
import { escapeEmailHtml, parseEmailAddressList, renderEmailTemplatePlaceholders } from "@/lib/email-templates/render";
import { formatAppDateTime, formatAppIsoDate } from "@/lib/format-datetime";
import { AGE_BUCKETS, type AgeingItem } from "@/lib/inventory-ageing/calculate";
import { loadInventoryAgeing } from "@/lib/inventory-ageing/load";
import { sendErpSyncFailureAlertEmail } from "@/lib/maileroo";
import { prisma } from "@/lib/prisma";

type AgeingReport = Awaited<ReturnType<typeof loadInventoryAgeing>>;

const BUCKET_LABELS: Record<(typeof AGE_BUCKETS)[number], string> = {
  "0_30": "0–30",
  "31_60": "31–60",
  "61_90": "61–90",
  "91_150": "91–150",
  above_150: "Above 150",
};

const number = (value: number | null | undefined) => (value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

function bucketValues(buckets: AgeingItem["buckets"]) {
  return AGE_BUCKETS.flatMap((bucket) => [buckets[bucket].qty, buckets[bucket].cost]);
}

function worksheet(book: XLSX.WorkBook, name: string, rows: (string | number | null)[][]) {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
  for (let column = 0; column <= range.e.c; column += 1) {
    const cell = sheet[XLSX.utils.encode_cell({ r: 0, c: column })];
    if (cell) cell.s = {
      font: { bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "254A78" } },
      alignment: { vertical: "center" },
    };
  }
  sheet["!cols"] = (rows[0] ?? []).map((header, index) => ({
    wch: index === 2 ? 42 : Math.max(12, Math.min(28, String(header ?? "").length + 3)),
  }));
  XLSX.utils.book_append_sheet(book, sheet, name);
}

export function buildInventoryAgeingWorkbook(report: AgeingReport): Buffer {
  const book = XLSX.utils.book_new();
  const ageHeaders = AGE_BUCKETS.flatMap((bucket) => [`${BUCKET_LABELS[bucket]} Qty`, `${BUCKET_LABELS[bucket]} Cost`]);
  worksheet(book, "Ageing Summary", [
    ["Item Code", "Barcode", "Description", "Brand", "Selling Rate", "Opening Stock", "Total Stock Left", "Known Cost", "Unpriced Qty", ...ageHeaders, "Cost Status"],
    ...report.items.map((row) => [row.itemCode, row.barcode, row.description, row.brand, row.sellingRate, row.openingStock, row.totalStockLeft, row.totalCost, row.unpricedQty, ...bucketValues(row.buckets), row.costStatus]),
  ]);
  worksheet(book, "Brand Summary", [
    ["Brand", "Currency", "UOM", "Stock", "Known Cost", "Unpriced Qty", ...ageHeaders, "Cost Status"],
    ...report.brandSummary.map((row) => [row.brand, row.currency, row.stockUom, row.totalStock, row.totalCost, row.unpricedQty, ...bucketValues(row.buckets), row.costStatus]),
  ]);
  worksheet(book, "Grand Total", [
    ["Currency", "UOM", "Stock", "Known Cost", "Unpriced Qty", ...ageHeaders, "Cost Status"],
    ...report.grandTotal.map((row) => [row.currency, row.stockUom, row.totalStock, row.totalCost, row.unpricedQty, ...bucketValues(row.buckets), row.costStatus]),
  ]);
  worksheet(book, "Reconciliation", [
    ["Company", "Item Code", "Warehouse", "Issue", "Detail", "Difference"],
    ...report.reconciliation.discrepancies.map((row) => [row.company, row.itemCode, row.warehouse, row.kind, row.detail, row.difference ?? null]),
  ]);
  return XLSX.write(book, { type: "buffer", bookType: "xlsx", cellStyles: true }) as Buffer;
}

export function buildInventoryAgeingEmailPreview(report: AgeingReport) {
  const tableRows = report.brandSummary.map((row) => `<tr>
    <td style="padding:6px;border:1px solid #c8d3e1;">${escapeEmailHtml(row.brand)}</td>
    <td style="padding:6px;border:1px solid #c8d3e1;">${escapeEmailHtml(row.currency ?? "—")}</td>
    <td style="padding:6px;border:1px solid #c8d3e1;">${escapeEmailHtml(row.stockUom || "—")}</td>
    <td style="padding:6px;border:1px solid #c8d3e1;text-align:right;background:#eaf3f8;">${number(row.totalStock)}</td>
    <td style="padding:6px;border:1px solid #c8d3e1;text-align:right;background:#e2f0d9;">${number(row.totalCost)}</td>
    <td style="padding:6px;border:1px solid #c8d3e1;text-align:right;">${number(row.unpricedQty)}</td>
    ${AGE_BUCKETS.map((bucket) => `<td style="padding:6px;border:1px solid #c8d3e1;text-align:right;">${number(row.buckets[bucket].qty)}</td>`).join("")}
    <td style="padding:6px;border:1px solid #c8d3e1;">${escapeEmailHtml(row.costStatus)}</td>
  </tr>`).join("");
  return `<table style="border-collapse:collapse;width:100%;border:1px solid #b8c7d9;font-size:13px;"><thead><tr style="background:#17365d;color:#fff;">
    <th style="padding:7px;border:1px solid #b8c7d9;text-align:left;">Brand</th><th style="padding:7px;border:1px solid #b8c7d9;text-align:left;">Currency</th><th style="padding:7px;border:1px solid #b8c7d9;text-align:left;">UOM</th><th style="padding:7px;border:1px solid #b8c7d9;">Stock</th><th style="padding:7px;border:1px solid #b8c7d9;">Known Cost</th><th style="padding:7px;border:1px solid #b8c7d9;">Unpriced Qty</th>${AGE_BUCKETS.map((bucket) => `<th style="padding:7px;border:1px solid #b8c7d9;">${BUCKET_LABELS[bucket]} Qty</th>`).join("")}<th style="padding:7px;border:1px solid #b8c7d9;">Cost Status</th>
  </tr></thead><tbody>${tableRows || `<tr><td colspan="12" style="padding:8px;border:1px solid #c8d3e1;">No eligible purchase-receipt stock.</td></tr>`}</tbody></table>`;
}

export async function runInventoryAgeingDailyEmail(companyId: string, reportDate = formatAppIsoDate(new Date())) {
  const config = builtinTemplateByKey(INVENTORY_AGEING_SUMMARY_DAILY_KEY)!;
  const stored = await prisma.emailTemplate.findUnique({ where: { companyId_key: { companyId, key: INVENTORY_AGEING_SUMMARY_DAILY_KEY } } });
  const recipients = parseEmailAddressList(stored?.recipients ?? config.recipients);
  if (!recipients.length) return "skipped";
  const report = await loadInventoryAgeing(companyId, reportDate);
  const openingStock = report.items.reduce((sum, item) => sum + item.openingStock, 0);
  const vars = {
    companyName: "",
    reportDate,
    generatedAt: formatAppDateTime(new Date()),
    summaryTableHtml: buildInventoryAgeingEmailPreview(report),
    itemCount: String(report.items.length),
    eligibleStock: String(report.reconciliation.eligibleStockQty),
    openingStock: String(openingStock),
    unallocatedStock: String(report.reconciliation.unallocatedStockQty),
  };
  const result = await sendErpSyncFailureAlertEmail({
    toEmails: recipients,
    ccEmails: parseEmailAddressList(stored?.ccRecipients ?? config.ccRecipients),
    subject: renderEmailTemplatePlaceholders(stored?.subject || config.subject, vars),
    html: renderEmailTemplatePlaceholders(stored?.bodyHtml || config.bodyHtml, vars),
    plain: `Inventory ageing summary for ${reportDate}: ${report.items.length} items`,
    attachments: [{ fileName: `ageing-summary-${reportDate}.xlsx`, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", contentBase64: buildInventoryAgeingWorkbook(report).toString("base64") }],
  });
  if (!result.success) throw new Error(result.message ?? "Failed to send inventory ageing email");
  return "sent";
}
