import type ExcelJS from "exceljs";

import { normalizeContactEmail, normalizeContactPhone } from "@/lib/contact-identifiers";
import { formatAppIsoDate, parseAppCalendarDayStart } from "@/lib/format-datetime";

import { customerGroupKey } from "@/lib/vault-supplement-import/contact-resolve";
import {
  PURCHASE_HEADERS,
  REJECT_REASON,
  matchPurchaseHeaders,
  type PurchaseHeader,
} from "@/lib/vault-supplement-import/headers";
import { roundMoney } from "@/lib/vault-supplement-import/invoice-merge";
import { loadXlsxWorkbook } from "@/lib/vault-supplement-import/xlsx-load";

export type ParsedPurchaseLine = {
  rowNumber: number;
  customerName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  district: string | null;
  invoiceNo: string;
  invoiceDate: Date;
  itemCode: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  lineAmount: number;
  currency: string;
  paymentMethod: string | null;
  location: string | null;
  merchant: string | null;
  sourceRef: string;
};

export type RejectedPurchaseRow = {
  rowNumber: number;
  reason: string;
};

export type PurchaseCustomerGroup = {
  key: string;
  phone: string | null;
  email: string | null;
  name: string;
  address: string | null;
  city: string | null;
  district: string | null;
  lines: ParsedPurchaseLine[];
};

export type ParsePurchasesResult =
  | { ok: false; error: string }
  | {
      ok: true;
      rowsRead: number;
      lines: ParsedPurchaseLine[];
      rejected: RejectedPurchaseRow[];
      customers: PurchaseCustomerGroup[];
    };

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return formatAppIsoDate(value);
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") {
    if ("result" in value && value.result != null && value.result !== undefined) {
      return cellText(value.result as ExcelJS.CellValue);
    }
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text ?? "").join("").trim();
    }
    if ("formula" in value) return "";
  }
  return String(value).trim();
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function lineKey(sourceRef: string, invoiceNo: string, itemCode: string): string {
  return `${sourceRef}\u0000${invoiceNo}\u0000${itemCode}`;
}

function classifyRow(
  rowNumber: number,
  values: Map<PurchaseHeader, string>,
): { ok: true; line: ParsedPurchaseLine } | { ok: false; reason: string } {
  const customerName = values.get("customer_name")?.trim() ?? "";
  if (!customerName) return { ok: false, reason: REJECT_REASON.customerName };

  const phone = normalizeContactPhone(values.get("phone"));
  const email = normalizeContactEmail(values.get("email"));
  if (!phone && !email) return { ok: false, reason: REJECT_REASON.phoneOrEmail };

  const invoiceNo = values.get("invoice_no")?.trim() ?? "";
  if (!invoiceNo) return { ok: false, reason: REJECT_REASON.invoiceNumber };

  const invoiceDateRaw = values.get("invoice_date")?.trim() ?? "";
  const invoiceDate = parseAppCalendarDayStart(invoiceDateRaw);
  if (!invoiceDate) return { ok: false, reason: REJECT_REASON.invoiceDate };

  const itemCode = values.get("item_code")?.trim() ?? "";
  if (!itemCode) return { ok: false, reason: REJECT_REASON.itemCode };

  const itemName = values.get("item_name")?.trim() ?? "";
  if (!itemName) return { ok: false, reason: REJECT_REASON.itemName };

  const quantityRaw = values.get("quantity")?.trim() ?? "";
  const quantity = Number(quantityRaw);
  if (!quantityRaw || !Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, reason: REJECT_REASON.quantity };
  }

  const unitPriceRaw = values.get("unit_price")?.trim() ?? "";
  const unitPrice = Number(unitPriceRaw);
  if (!unitPriceRaw || !Number.isFinite(unitPrice)) {
    return { ok: false, reason: REJECT_REASON.unitPrice };
  }

  const lineAmountRaw = values.get("line_amount")?.trim() ?? "";
  let lineAmount: number;
  if (!lineAmountRaw) {
    lineAmount = roundMoney(quantity * unitPrice);
  } else {
    lineAmount = Number(lineAmountRaw);
    if (!Number.isFinite(lineAmount)) return { ok: false, reason: REJECT_REASON.lineAmount };
    lineAmount = roundMoney(lineAmount);
  }

  const sourceRef = values.get("source_ref")?.trim() ?? "";
  if (!sourceRef) return { ok: false, reason: REJECT_REASON.sourceRef };

  const currency = values.get("currency")?.trim() || "LKR";

  return {
    ok: true,
    line: {
      rowNumber,
      customerName,
      phone,
      email,
      address: blankToNull(values.get("address") ?? ""),
      city: blankToNull(values.get("city") ?? ""),
      district: blankToNull(values.get("district") ?? ""),
      invoiceNo,
      invoiceDate,
      itemCode,
      itemName,
      quantity,
      unitPrice,
      lineAmount,
      currency,
      paymentMethod: blankToNull(values.get("payment_method") ?? ""),
      location: blankToNull(values.get("location") ?? ""),
      merchant: blankToNull(values.get("merchant") ?? ""),
      sourceRef,
    },
  };
}

function preferText(current: string | null, next: string | null): string | null {
  return next?.trim() ? next.trim() : current;
}

export function groupPurchaseCustomers(lines: ParsedPurchaseLine[]): PurchaseCustomerGroup[] {
  const groups = new Map<string, PurchaseCustomerGroup>();
  const emailToPhoneKey = new Map<string, string>();

  for (const line of lines) {
    const key = customerGroupKey(line.phone, line.email);
    if (!key) continue;
    if (line.phone && line.email) emailToPhoneKey.set(line.email, key);

    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        key,
        phone: line.phone,
        email: line.email,
        name: line.customerName,
        address: line.address,
        city: line.city,
        district: line.district,
        lines: [line],
      });
      continue;
    }
    existing.lines.push(line);
    existing.phone = existing.phone ?? line.phone;
    existing.email = existing.email ?? line.email;
    existing.name = line.customerName || existing.name;
    existing.address = preferText(existing.address, line.address);
    existing.city = preferText(existing.city, line.city);
    existing.district = preferText(existing.district, line.district);
  }

  for (const [key, group] of [...groups.entries()]) {
    if (!key.startsWith("email:") || !group.email) continue;
    const phoneKey = emailToPhoneKey.get(group.email);
    if (!phoneKey || phoneKey === key) continue;
    const phoneGroup = groups.get(phoneKey);
    if (!phoneGroup) continue;
    phoneGroup.lines.push(...group.lines);
    phoneGroup.email = phoneGroup.email ?? group.email;
    phoneGroup.address = preferText(phoneGroup.address, group.address);
    phoneGroup.city = preferText(phoneGroup.city, group.city);
    phoneGroup.district = preferText(phoneGroup.district, group.district);
    groups.delete(key);
  }

  return [...groups.values()];
}

export async function parsePurchasesWorkbook(buffer: Buffer): Promise<ParsePurchasesResult> {
  const workbook = await loadXlsxWorkbook(buffer);
  const sheet =
    workbook.getWorksheet("Purchases") ??
    workbook.worksheets.find((candidate) => candidate.name.trim().toLowerCase() === "purchases");
  if (!sheet) {
    return { ok: false, error: "Purchases sheet is missing" };
  }

  const headerRow = sheet.getRow(1);
  const headerCells: string[] = [];
  const lastColumn = Math.max(headerRow.cellCount, PURCHASE_HEADERS.length);
  for (let column = 1; column <= lastColumn; column += 1) {
    headerCells.push(cellText(headerRow.getCell(column).value));
  }

  const matched = matchPurchaseHeaders(headerCells);
  if (!matched.ok) return { ok: false, error: matched.error };

  const rejected: RejectedPurchaseRow[] = [];
  const byLine = new Map<string, ParsedPurchaseLine>();
  let rowsRead = 0;

  const lastRow = sheet.rowCount;
  for (let rowNumber = 2; rowNumber <= lastRow; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const values = new Map<PurchaseHeader, string>();
    let any = false;
    for (const header of PURCHASE_HEADERS) {
      const column = matched.index.get(header);
      if (column == null) continue;
      const text = cellText(row.getCell(column + 1).value);
      if (text) any = true;
      values.set(header, text);
    }
    if (!any) continue;
    rowsRead += 1;

    const classified = classifyRow(rowNumber, values);
    if (!classified.ok) {
      rejected.push({ rowNumber, reason: classified.reason });
      continue;
    }
    const line = classified.line;
    byLine.set(lineKey(line.sourceRef, line.invoiceNo, line.itemCode), line);
  }

  const lines = [...byLine.values()].sort((a, b) => a.rowNumber - b.rowNumber);
  return {
    ok: true,
    rowsRead,
    lines,
    rejected,
    customers: groupPurchaseCustomers(lines),
  };
}
