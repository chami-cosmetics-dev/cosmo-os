import * as XLSX from "xlsx-js-style";
import { SUPPLIER_PAYABLE_OUTSTANDING_DAILY_KEY, builtinTemplateByKey } from "@/lib/email-templates/catalog";
import { parseEmailAddressList, renderEmailTemplatePlaceholders } from "@/lib/email-templates/render";
import { formatAppDateTime } from "@/lib/format-datetime";
import { defaultSupplierPayablesReportDate, loadCachedSupplierPayables, refreshSupplierPayables } from "@/lib/supplier-payables";
import { sendErpSyncFailureAlertEmail } from "@/lib/maileroo";
import { prisma } from "@/lib/prisma";

function money(value: number) { return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function ageBucket(days: number | null) { if (days == null || days <= 10) return "0-10"; if (days <= 30) return "11-30"; if (days <= 60) return "31-60"; return "61+"; }
function isConsignment(name: string | null) { return /consign/i.test(name ?? ""); }
function buildConsignmentItemRows(rows: Awaited<ReturnType<typeof loadCachedSupplierPayables>>["groups"]) {
  type ItemRow = { Supplier: string; "Supplier ID": string; Company: string; "Item Code": string; "Item Name": string; "ERP Source": string; "PO Number": string; "Line Count": number; "Available Stock": number };
  const items = new Map<string, ItemRow>();
  for (const group of rows.filter((candidate) => isConsignment(candidate.supplierName))) {
    for (const line of group.lines) {
      const itemLines = line.itemLines?.length ? line.itemLines : [{ itemCode: line.itemCode, itemName: line.itemName, poNumber: line.poNumber, quantity: 1, amount: line.amount, availableStock: 0 }];
      for (const item of itemLines) {
      const itemCode = item.itemCode ?? "";
      const itemName = item.itemName ?? "";
      const key = [line.supplierId, line.company, line.erpSlot ?? line.erpLabel ?? "", item.poNumber ?? line.poNumber ?? "", itemCode, itemName].join("\u0000");
      const existing = items.get(key);
      if (existing) {
        existing["Line Count"] += item.quantity;
        existing["Available Stock"] = item.availableStock;
      } else {
        items.set(key, {
          Supplier: line.supplierName ?? line.supplierId,
          "Supplier ID": line.supplierId,
          Company: line.company,
          "Item Code": itemCode,
          "Item Name": itemName,
          "ERP Source": line.erpSlot ?? line.erpLabel ?? "",
          "PO Number": item.poNumber ?? line.poNumber ?? "",
          "Line Count": item.quantity,
          "Available Stock": item.availableStock,
        });
      }
      }
    }
  }
  return [...items.values()];
}
function rowsFor(groups: Awaited<ReturnType<typeof loadCachedSupplierPayables>>["groups"]) { return groups.flatMap((group) => group.lines.map((line) => ({ supplier: group.supplierName ?? group.supplierId, company: line.company, age: ageBucket(line.daysPastDue), outstanding: line.outstanding }))); }
export function buildSupplierPayablesEmailPreview(rows: Awaited<ReturnType<typeof loadCachedSupplierPayables>>["groups"]) {
  type PayableEmailLine = ReturnType<typeof rowsFor>[number];
  const table = (label: string, selectedLines: PayableEmailLine[]) => { const keys = [...new Set(selectedLines.map((line) => line.supplier))].sort(); const body = keys.map((supplier) => { const selected = selectedLines.filter((line) => line.supplier === supplier); const value = (bucket: string) => selected.filter((line) => line.age === bucket).reduce((sum, line) => sum + line.outstanding, 0); return `<tr><td style="padding:6px;border:1px solid #c8d3e1;">${supplier}</td><td style="padding:6px;border:1px solid #c8d3e1;text-align:right;background:#eaf3f8;">${money(value("0-10"))}</td><td style="padding:6px;border:1px solid #c8d3e1;text-align:right;background:#eaf3f8;">${money(value("11-30"))}</td><td style="padding:6px;border:1px solid #c8d3e1;text-align:right;background:#eaf3f8;">${money(value("31-60"))}</td><td style="padding:6px;border:1px solid #c8d3e1;text-align:right;background:#eaf3f8;">${money(value("61+"))}</td><td style="padding:6px;border:1px solid #c8d3e1;text-align:right;background:#e2f0d9;">${money(selected.reduce((sum, line) => sum + line.outstanding, 0))}</td></tr>`; }).join(""); return `<h3 style="margin:22px 0 8px;padding:8px 10px;background:#d9eaf7;color:#17365d;border-left:5px solid #2f5597;">${label}</h3><table style="border-collapse:collapse;width:100%;border:1px solid #b8c7d9;font-size:13px;"><thead><tr style="background:#17365d;color:#fff;"><th style="padding:7px;border:1px solid #b8c7d9;">Supplier</th><th style="padding:7px;border:1px solid #b8c7d9;background:#2f5597;">0-10 Days</th><th style="padding:7px;border:1px solid #b8c7d9;background:#2f5597;">11-30 Days</th><th style="padding:7px;border:1px solid #b8c7d9;background:#2f5597;">31-60 Days</th><th style="padding:7px;border:1px solid #b8c7d9;background:#2f5597;">61+ Days</th><th style="padding:7px;border:1px solid #b8c7d9;">Total Outstanding</th></tr></thead><tbody>${body || "<tr><td colspan=6 style=\"padding:8px\">No outstanding payables</td></tr>"}</tbody></table>`; };
  const normal = rows.filter((group) => !isConsignment(group.supplierName));
  const consignment = rows.filter((group) => isConsignment(group.supplierName));
  return `${table("Normal", rowsFor(normal))}${table("Consignment", rowsFor(consignment))}`;
}
export function buildSupplierPayablesEmailWorkbook(rows: Awaited<ReturnType<typeof loadCachedSupplierPayables>>["groups"]) {
  const book = XLSX.utils.book_new();
  const styleSheet = (sheet: XLSX.WorkSheet, values: unknown[]) => {
    const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
    const headerStyle = { fill: { fgColor: { rgb: "17365D" } }, font: { bold: true, color: { rgb: "FFFFFF" } }, alignment: { horizontal: "center", vertical: "center" } };
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const header = sheet[XLSX.utils.encode_cell({ r: 0, c: column })];
      if (header) header.s = headerStyle;
    }
    sheet["!cols"] = values.length ? Object.keys(values[0] as object).map((key) => ({ wch: Math.max(14, Math.min(26, key.length + 3)) })) : [];
  };
  for (const [name, groups] of [["Normal", rows.filter((group) => !isConsignment(group.supplierName))], ["Consignment", rows.filter((group) => isConsignment(group.supplierName))]] as const) {
    const values = groups.flatMap((group) => group.lines.map((line) => ({
      Supplier: line.supplierName ?? line.supplierId,
      "Supplier ID": line.supplierId,
      Company: line.company,
      "ERP Source": line.erpSlot ?? line.erpLabel ?? "",
      "PO Number": line.poNumber ?? "",
      Amount: line.amount,
      Total: line.total,
      "PO Date": line.poDate ?? "",
      "Due Date": line.dueDate ?? "",
      "Days Past Due": line.daysPastDue ?? "",
      Remark: line.remark ?? "",
      Currency: line.currency ?? "",
    })));
    const sheet = XLSX.utils.json_to_sheet(values);
    styleSheet(sheet, values);
    XLSX.utils.book_append_sheet(book, sheet, name);
  }
  const consignmentItems = buildConsignmentItemRows(rows);
  const consignmentItemSheet = XLSX.utils.json_to_sheet(consignmentItems);
  styleSheet(consignmentItemSheet, consignmentItems);
  XLSX.utils.book_append_sheet(book, consignmentItemSheet, "Consignment Items");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
export async function runSupplierPayablesDailyEmail(companyId: string, reportDate = defaultSupplierPayablesReportDate()) {
  await refreshSupplierPayables(companyId, reportDate);
  const loaded = await loadCachedSupplierPayables(companyId, reportDate);
  const config = builtinTemplateByKey(SUPPLIER_PAYABLE_OUTSTANDING_DAILY_KEY)!;
  const stored = await prisma.emailTemplate.findUnique({ where: { companyId_key: { companyId, key: SUPPLIER_PAYABLE_OUTSTANDING_DAILY_KEY } } });
  const recipients = parseEmailAddressList(stored?.recipients ?? config.recipients);
  if (!recipients.length) return "skipped";
  const rows = loaded.groups;
  const lines = rows.reduce((sum, group) => sum + group.lines.length, 0);
  const vars = { companyName: "", reportDate, generatedAt: formatAppDateTime(new Date()), summaryTableHtml: buildSupplierPayablesEmailPreview(rows), supplierCount: String(rows.length), lineCount: String(lines) };
  const result = await sendErpSyncFailureAlertEmail({ toEmails: recipients, ccEmails: parseEmailAddressList(stored?.ccRecipients ?? config.ccRecipients), subject: renderEmailTemplatePlaceholders(stored?.subject || config.subject, vars), html: renderEmailTemplatePlaceholders(stored?.bodyHtml || config.bodyHtml, vars), plain: `Supplier payable outstanding for ${reportDate}: ${lines} lines`, attachments: [{ fileName: `supplier-payable-outstanding-${reportDate}.xlsx`, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", contentBase64: buildSupplierPayablesEmailWorkbook(rows).toString("base64") }] });
  if (!result.success) throw new Error(result.message ?? "Failed to send supplier payable email");
  return "sent";
}
