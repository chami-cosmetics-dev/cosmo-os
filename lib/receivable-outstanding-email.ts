import * as XLSX from "xlsx-js-style";

import {
  RECEIVABLE_DELIVERY_INCOMPLETE_DAILY_KEY,
  RECEIVABLE_DELIVERY_PAYMENT_PENDING_DAILY_KEY,
  RECEIVABLE_NOT_DISPATCHED_DAILY_KEY,
  RECEIVABLE_OPERATIONS_SUMMARY_DAILY_KEY,
  builtinTemplateByKey,
} from "@/lib/email-templates/catalog";
import { parseEmailAddressList, renderEmailTemplatePlaceholders } from "@/lib/email-templates/render";
import { formatAppDateTime } from "@/lib/format-datetime";
import { loadCachedReceivables, refreshReceivables, type ReceivableRow } from "@/lib/receivable-outstanding";
import { sendErpSyncFailureAlertEmail } from "@/lib/maileroo";
import { prisma } from "@/lib/prisma";

const DETAIL_KEYS = [RECEIVABLE_DELIVERY_PAYMENT_PENDING_DAILY_KEY, RECEIVABLE_NOT_DISPATCHED_DAILY_KEY, RECEIVABLE_DELIVERY_INCOMPLETE_DAILY_KEY] as const;

function escapeHtml(value: string) { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function money(value: number) { return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
const AGEING_HEADERS = ["1 to 2 Days", "3 to 4 Days", "5 to 7 Days", "08 to 30 Days", "Above 01 Month"] as const;
function ageingValues(row: ReceivableRow) { return [row.ageing1To2, row.ageing3To4, row.ageing5To7, row.ageing8To30, row.ageing31Plus]; }
function isReturned(row: ReceivableRow) { return /^(returned_to_store|returned)$/i.test(row.cosmoOrderStatus ?? ""); }
function isInvoiceCreatedNotDispatched(row: ReceivableRow) { return !row.isCancelled && !isReturned(row) && !row.dispatchDate && !row.isPosOrder && row.cosmoOrderStatus !== "delivery_complete"; }
function styleWorkbook(book: XLSX.WorkBook) {
  const headerStyle = { fill: { fgColor: { rgb: "17365D" } }, font: { bold: true, color: { rgb: "FFFFFF" } }, alignment: { horizontal: "center", vertical: "center", wrapText: true } };
  const amountStyle = { fill: { fgColor: { rgb: "E2F0D9" } }, numFmt: "#,##0.00" };
  const ageingStyle = { fill: { fgColor: { rgb: "FFF2CC" } }, numFmt: "#,##0.00" };
  for (const sheet of book.SheetNames) {
    const worksheet = book.Sheets[sheet];
    const range = XLSX.utils.decode_range(worksheet["!ref"] ?? "A1");
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const header = worksheet[XLSX.utils.encode_cell({ r: 0, c: column })];
      if (header) header.s = headerStyle;
      const label = String(header?.v ?? "");
      const style = ["Outstanding", "Value", "Total Value", "Payment Pending Value", "Dispatch Pending Value", "Delivery Incomplete Value"].includes(label) ? amountStyle : label.includes("Days") && (label.includes("Count") || label.includes("Value")) ? ageingStyle : null;
      if (style) for (let row = 1; row <= range.e.r; row += 1) { const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: column })]; if (cell) cell.s = style; }
    }
    worksheet["!freeze"] = { xSplit: 0, ySplit: 1 };
    worksheet["!autofilter"] = { ref: XLSX.utils.encode_range(range) };
    worksheet["!cols"] = Array.from({ length: range.e.c - range.s.c + 1 }, (_, index) => ({ wch: Math.max(13, Math.min(25, String(worksheet[XLSX.utils.encode_cell({ r: 0, c: index })]?.v ?? "").length + 4)) }));
  }
}
function workbook(rows: ReceivableRow[], sheetName: string) {
  const values = rows.map((row) => ({
    Customer: row.customer,
    Company: row.company,
    "Invoice No": row.invoiceNo,
    "Invoice Date": row.invoiceDate ?? "",
    "Invoice Amount": row.invoiceAmount,
    Outstanding: row.outstanding,
    Currency: row.currency ?? "",
    "Dispatch Date": row.dispatchDate ?? "",
    "Shipping Service": row.shippingService ?? "",
    "Cosmo Order Status": row.cosmoOrderStatus ?? "",
    Reason: row.reason ?? "",
    Age: row.age ?? "",
    "1 to 2 Days": row.ageing1To2,
    "3 to 4 Days": row.ageing3To4,
    "5 to 7 Days": row.ageing5To7,
    "08 to 30 Days": row.ageing8To30,
    "Above 01 Month": row.ageing31Plus,
  }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(values), sheetName);
  styleWorkbook(book);
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
function ageingTotals(rows: ReceivableRow[]) {
  const buckets = ["1-2 Days", "3-4 Days", "5-7 Days", "08-30 Days", "31+ Days", "No Dispatch"] as const;
  return Object.fromEntries(buckets.flatMap((bucket) => { const selected = rows.filter((row) => row.ageingBucket === bucket); return [[`${bucket} Count`, selected.length], [`${bucket} Value`, selected.reduce((sum, row) => sum + row.outstanding, 0)]]; }));
}
function ageingValueCountCells(rows: ReceivableRow[]) {
  return AGEING_HEADERS.map((_, index) => {
    const value = rows.reduce((sum, row) => sum + ageingValues(row)[index], 0);
    const count = rows.filter((row) => ageingValues(row)[index] > 0).length;
    return `<td style="text-align:right;">${money(value)} (${count})</td>`;
  }).join("");
}
function summaryWorkbook(groups: { company: string; paymentPending: number; paymentValue: number; dispatchPending: number; dispatchValue: number; deliveryIncomplete: number; deliveryValue: number }[], allRows: ReceivableRow[], deliveryRows: ReceivableRow[]) {
  const book = XLSX.utils.book_new();
  const companyRows = groups.map((group) => ({ Company: group.company, "Payment Pending Count": group.paymentPending, "Payment Pending Value": group.paymentValue, "Dispatch Pending Count": group.dispatchPending, "Dispatch Pending Value": group.dispatchValue, "Delivery Incomplete Count": group.deliveryIncomplete, "Delivery Incomplete Value": group.deliveryValue }));
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([...companyRows, { Company: "Total", "Payment Pending Count": groups.reduce((sum, row) => sum + row.paymentPending, 0), "Payment Pending Value": groups.reduce((sum, row) => sum + row.paymentValue, 0), "Dispatch Pending Count": groups.reduce((sum, row) => sum + row.dispatchPending, 0), "Dispatch Pending Value": groups.reduce((sum, row) => sum + row.dispatchValue, 0), "Delivery Incomplete Count": groups.reduce((sum, row) => sum + row.deliveryIncomplete, 0), "Delivery Incomplete Value": groups.reduce((sum, row) => sum + row.deliveryValue, 0) }]), "Company Summary");
  const paymentRows = allRows.filter((row) => row.cosmoOrderStatus === "delivery_complete");
  const dispatchRows = allRows.filter(isInvoiceCreatedNotDispatched);
  const companyAgeing = (rows: ReceivableRow[]) => [...new Set(rows.map((row) => row.company))].sort().map((company) => ({ Company: company, Count: rows.filter((row) => row.company === company).length, Value: rows.filter((row) => row.company === company).reduce((sum, row) => sum + row.outstanding, 0), ...ageingTotals(rows.filter((row) => row.company === company)) }));
  const paymentAgeingRows = companyAgeing(paymentRows);
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([...paymentAgeingRows, { Company: "Total", Count: paymentRows.length, Value: paymentRows.reduce((sum, row) => sum + row.outstanding, 0), ...ageingTotals(paymentRows) }]), "Payment Pending");
  const dispatchCountRows = [...new Set(dispatchRows.map((row) => row.company))].sort().map((company) => { const rows = dispatchRows.filter((row) => row.company === company); return { Company: company, Count: rows.length, "1-2 Days Count": rows.filter((row) => row.ageingBucket === "1-2 Days").length, "3-4 Days Count": rows.filter((row) => row.ageingBucket === "3-4 Days").length, "5-7 Days Count": rows.filter((row) => row.ageingBucket === "5-7 Days").length, "08-30 Days Count": rows.filter((row) => row.ageingBucket === "08-30 Days").length, "31+ Days Count": rows.filter((row) => row.ageingBucket === "31+ Days").length, "No Dispatch Count": rows.filter((row) => row.ageingBucket === "No Dispatch").length }; });
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([...dispatchCountRows, { Company: "Total", Count: dispatchRows.length, "1-2 Days Count": dispatchRows.filter((row) => row.ageingBucket === "1-2 Days").length, "3-4 Days Count": dispatchRows.filter((row) => row.ageingBucket === "3-4 Days").length, "5-7 Days Count": dispatchRows.filter((row) => row.ageingBucket === "5-7 Days").length, "08-30 Days Count": dispatchRows.filter((row) => row.ageingBucket === "08-30 Days").length, "31+ Days Count": dispatchRows.filter((row) => row.ageingBucket === "31+ Days").length, "No Dispatch Count": dispatchRows.filter((row) => row.ageingBucket === "No Dispatch").length }]), "Dispatch Pending");
  const byService = new Map<string, { service: string; count: number; value: number }>();
  for (const row of deliveryRows) { const service = `${row.shippingServiceType ?? "Unassigned"}: ${row.shippingService ?? "Unassigned"}`; const item = byService.get(service) ?? { service, count: 0, value: 0 }; item.count += 1; item.value += row.outstanding; byService.set(service, item); }
  const serviceRows = [...new Set(deliveryRows.map((row) => `${row.shippingServiceType ?? "Unassigned"}: ${row.shippingService ?? "Unassigned"}`))].sort().map((service) => { const rows = deliveryRows.filter((row) => `${row.shippingServiceType ?? "Unassigned"}: ${row.shippingService ?? "Unassigned"}` === service); return { "Rider / Courier": service, Count: rows.length, Value: rows.reduce((sum, row) => sum + row.outstanding, 0), ...ageingTotals(rows) }; });
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([...serviceRows, { "Rider / Courier": "Total", Count: deliveryRows.length, Value: deliveryRows.reduce((sum, row) => sum + row.outstanding, 0), ...ageingTotals(deliveryRows) }]), "Delivery Incomplete");
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([...byService.values(), { service: "Total", count: deliveryRows.length, value: deliveryRows.reduce((sum, row) => sum + row.outstanding, 0) }]), "Rider Courier Summary");
  styleWorkbook(book);
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
function summaryTablesHtml(groups: { company: string; paymentPending: number; paymentValue: number; dispatchPending: number; dispatchValue: number }[], allRows: ReceivableRow[], deliveryRows: ReceivableRow[]) {
  const table = (title: string, headers: string[], rows: string) => `<h3 style="margin:22px 0 8px;padding:8px 10px;background:#d9eaf7;color:#17365d;border-left:5px solid #2f5597;">${title}</h3><table style="border-collapse:collapse;width:100%;border:1px solid #b8c7d9;font-size:13px;"><thead><tr style="background:#17365d;color:#fff;">${headers.map((header) => `<th style="padding:7px;border:1px solid #b8c7d9;text-align:left;">${header}</th>`).join("")}</tr></thead><tbody>${rows || `<tr><td colspan="${headers.length}" style="padding:8px;">No rows</td></tr>`}</tbody></table>`;
  const paymentRows = allRows.filter((row) => row.cosmoOrderStatus === "delivery_complete");
  const dispatchRows = allRows.filter(isInvoiceCreatedNotDispatched);
  const ageingHeaders = AGEING_HEADERS.map((header) => header);
  const ageingCells = (rows: ReceivableRow[]) => { const values = AGEING_HEADERS.map((_, index) => rows.reduce((sum, row) => sum + ageingValues(row)[index], 0)); return values.map((value, index) => { const count = rows.filter((row) => ageingValues(row)[index] > 0).length; return `<td style="text-align:right;">${money(value)} (${count})</td>`; }).join(""); };
  const paymentRowsHtml = groups.map((row) => { const selected = paymentRows.filter((item) => item.company === row.company); return `<tr><td>${escapeHtml(row.company)}</td><td>${selected.length}</td><td>${money(row.paymentValue)}</td>${ageingCells(selected)}</tr>`; }).join("") + `<tr style="font-weight:bold;background:#e2f0d9;"><td>Total</td><td>${paymentRows.length}</td><td>${money(paymentRows.reduce((sum, row) => sum + row.outstanding, 0))}</td>${ageingCells(paymentRows)}</tr>`;
  const ageingCounts = (rows: ReceivableRow[]) => AGEING_HEADERS.map((_, index) => rows.filter((row) => ageingValues(row)[index] > 0).length).map((value) => `<td style="text-align:right;">${value}</td>`).join("");
  const dispatchRowsHtml = groups.map((row) => { const selected = dispatchRows.filter((item) => item.company === row.company); return `<tr><td>${escapeHtml(row.company)}</td><td>${selected.length}</td>${ageingCounts(selected)}</tr>`; }).join("") + `<tr style="font-weight:bold;background:#e2f0d9;"><td>Total</td><td>${dispatchRows.length}</td>${ageingCounts(dispatchRows)}</tr>`;
  const deliveryRowsHtml = [...new Set(deliveryRows.map((row) => `${row.shippingServiceType ?? "Unassigned"}: ${row.shippingService ?? "Unassigned"}`))].sort().map((service) => { const selected = deliveryRows.filter((item) => `${item.shippingServiceType ?? "Unassigned"}: ${item.shippingService ?? "Unassigned"}` === service); return `<tr><td>${escapeHtml(service)}</td><td>${selected.length}</td><td>${money(selected.reduce((sum, row) => sum + row.outstanding, 0))}</td>${ageingCells(selected)}</tr>`; }).join("") + `<tr style="font-weight:bold;background:#e2f0d9;"><td>Total</td><td>${deliveryRows.length}</td><td>${money(deliveryRows.reduce((sum, row) => sum + row.outstanding, 0))}</td>${ageingCells(deliveryRows)}</tr>`;
  return `${table("Payment pending — company wise", ["Company", "Count", "Total Value", ...ageingHeaders], paymentRowsHtml)}${table("Dispatch pending — company wise", ["Company", "Count", ...ageingHeaders], dispatchRowsHtml)}${table("Dispatched, delivery incomplete — rider/courier wise", ["Rider / Courier", "Count", "Total Value", ...ageingHeaders], deliveryRowsHtml)}`;
}
async function template(companyId: string, key: string) {
  const builtin = builtinTemplateByKey(key)!;
  const stored = await prisma.emailTemplate.findUnique({ where: { companyId_key: { companyId, key } } });
  return { subject: stored?.subject?.trim() || builtin.subject, bodyHtml: stored?.bodyHtml?.trim() || builtin.bodyHtml, recipients: stored?.recipients ?? builtin.recipients, ccRecipients: stored?.ccRecipients ?? builtin.ccRecipients };
}
function detailRows(rows: ReceivableRow[], key: string) {
  if (key === RECEIVABLE_DELIVERY_PAYMENT_PENDING_DAILY_KEY) return rows.filter((row) => row.cosmoOrderStatus === "delivery_complete");
  if (key === RECEIVABLE_NOT_DISPATCHED_DAILY_KEY) return rows.filter(isInvoiceCreatedNotDispatched);
  return rows.filter((row) => Boolean(row.dispatchDate) && !row.isCustomerPickup && row.cosmoOrderStatus !== "delivery_complete");
}
function detailSummaryHtml(rows: ReceivableRow[], showValueCount = false) {
  const companies = [...new Set(rows.map((row) => row.company))].sort();
  const body = companies.map((company) => { const selected = rows.filter((row) => row.company === company); const value = money(selected.reduce((sum, row) => sum + row.outstanding, 0)); return `<tr><td>${escapeHtml(company)}</td><td>${selected.length}</td><td>${value}${showValueCount ? ` (${selected.length})` : ""}</td>${ageingValueCountCells(selected)}</tr>`; }).join("") + `<tr style="font-weight:bold;background:#e2f0d9;"><td>Total</td><td>${rows.length}</td><td>${money(rows.reduce((sum, row) => sum + row.outstanding, 0))}${showValueCount ? ` (${rows.length})` : ""}</td>${ageingValueCountCells(rows)}</tr>`;
  return `<table style="border-collapse:collapse;width:100%;border:1px solid #b8c7d9;font-size:13px;"><thead><tr style="background:#17365d;color:#fff;"><th>Company</th><th>Count</th><th>Total Value</th>${AGEING_HEADERS.map((header) => `<th>${header}</th>`).join("")}</tr></thead><tbody>${body || "<tr><td colspan=8>No rows</td></tr>"}</tbody></table>`;
}
export function buildReceivableEmailPreview(rows: ReceivableRow[], key: string) {
  if (key === RECEIVABLE_OPERATIONS_SUMMARY_DAILY_KEY) {
    const paymentRows = detailRows(rows, RECEIVABLE_DELIVERY_PAYMENT_PENDING_DAILY_KEY);
    const dispatchRows = detailRows(rows, RECEIVABLE_NOT_DISPATCHED_DAILY_KEY);
    const deliveryRows = detailRows(rows, RECEIVABLE_DELIVERY_INCOMPLETE_DAILY_KEY);
    const companies = [...new Set(rows.map((row) => row.company))].sort().map((name) => ({ company: name, paymentPending: paymentRows.filter((row) => row.company === name).length, paymentValue: paymentRows.filter((row) => row.company === name).reduce((sum, row) => sum + row.outstanding, 0), dispatchPending: dispatchRows.filter((row) => row.company === name).length, dispatchValue: dispatchRows.filter((row) => row.company === name).reduce((sum, row) => sum + row.outstanding, 0), deliveryIncomplete: deliveryRows.filter((row) => row.company === name).length, deliveryValue: deliveryRows.filter((row) => row.company === name).reduce((sum, row) => sum + row.outstanding, 0) }));
    return { summaryTableHtml: summaryTablesHtml(companies, rows, deliveryRows), rowCount: rows.length, totalValue: money(rows.reduce((sum, row) => sum + row.outstanding, 0)), attachment: summaryWorkbook(companies, rows, deliveryRows) };
  }
  const selected = detailRows(rows, key);
  return { summaryTableHtml: detailSummaryHtml(selected, key === RECEIVABLE_NOT_DISPATCHED_DAILY_KEY), rowCount: selected.length, totalValue: money(selected.reduce((sum, row) => sum + row.outstanding, 0)), attachment: workbook(selected, "Receivables") };
}
export async function runReceivableOutstandingDailyEmail(companyId: string, reportDate: string) {
  await refreshReceivables(companyId, reportDate);
  const loaded = await loadCachedReceivables(companyId, reportDate);
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } });
  const generatedAt = formatAppDateTime(new Date());
  for (const key of DETAIL_KEYS) {
    const config = await template(companyId, key);
    const recipients = parseEmailAddressList(config.recipients);
    if (!recipients.length) continue;
    const rows = detailRows(loaded.rows, key);
    const vars = { companyName: company?.name ?? "", reportDate, generatedAt, summaryTableHtml: detailSummaryHtml(rows, key === RECEIVABLE_NOT_DISPATCHED_DAILY_KEY), rowCount: String(rows.length), totalValue: money(rows.reduce((sum, row) => sum + row.outstanding, 0)) };
    const sent = await sendErpSyncFailureAlertEmail({ toEmails: recipients, ccEmails: parseEmailAddressList(config.ccRecipients), subject: renderEmailTemplatePlaceholders(config.subject, vars), html: renderEmailTemplatePlaceholders(config.bodyHtml, vars), plain: `${key}: ${rows.length} rows, total ${vars.totalValue}`, attachments: [{ fileName: `${key}-${reportDate}.xlsx`, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", contentBase64: workbook(rows, "Receivables").toString("base64") }] });
    if (!sent.success) throw new Error(sent.message ?? `Failed to send ${key}`);
  }
  const summaryConfig = await template(companyId, RECEIVABLE_OPERATIONS_SUMMARY_DAILY_KEY);
  const recipients = parseEmailAddressList(summaryConfig.recipients);
  if (!recipients.length) return;
  const paymentRows = detailRows(loaded.rows, RECEIVABLE_DELIVERY_PAYMENT_PENDING_DAILY_KEY);
  const dispatchRows = detailRows(loaded.rows, RECEIVABLE_NOT_DISPATCHED_DAILY_KEY);
  const deliveryRows = detailRows(loaded.rows, RECEIVABLE_DELIVERY_INCOMPLETE_DAILY_KEY);
  const companies = [...new Set(loaded.rows.map((row) => row.company))].sort().map((name) => ({ company: name, paymentPending: paymentRows.filter((row) => row.company === name).length, paymentValue: paymentRows.filter((row) => row.company === name).reduce((sum, row) => sum + row.outstanding, 0), dispatchPending: dispatchRows.filter((row) => row.company === name).length, dispatchValue: dispatchRows.filter((row) => row.company === name).reduce((sum, row) => sum + row.outstanding, 0), deliveryIncomplete: deliveryRows.filter((row) => row.company === name).length, deliveryValue: deliveryRows.filter((row) => row.company === name).reduce((sum, row) => sum + row.outstanding, 0) }));
  const vars = { companyName: company?.name ?? "", reportDate, generatedAt, summaryTableHtml: summaryTablesHtml(companies, loaded.rows, deliveryRows), rowCount: String(loaded.rows.length), totalValue: money(loaded.rows.reduce((sum, row) => sum + row.outstanding, 0)) };
  await sendErpSyncFailureAlertEmail({ toEmails: recipients, ccEmails: parseEmailAddressList(summaryConfig.ccRecipients), subject: renderEmailTemplatePlaceholders(summaryConfig.subject, vars), html: renderEmailTemplatePlaceholders(summaryConfig.bodyHtml, vars), plain: `Receivable operations summary for ${reportDate}`, attachments: [{ fileName: `receivable-operations-summary-${reportDate}.xlsx`, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", contentBase64: summaryWorkbook(companies, loaded.rows, deliveryRows).toString("base64") }] });
}
