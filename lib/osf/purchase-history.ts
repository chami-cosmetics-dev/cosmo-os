import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { isNoisePurchaseSupplier, isUsablePurchaseDoc, erpGetJson } from "@/lib/osf/erp-purchases";
import type { OsfErpCredentials } from "@/lib/osf/erp-stock";

export type PurchaseHistoryRecord = {
  erpCompany?: string;
  reference: string;
  line: string;
  documentType: "Purchase Invoice";
  purchaseOrder: string | null;
  purchaseReceipt: string | null;
  supplierId: string;
  supplierName: string;
  date: string;
  postingTime: string | null;
  quantity: string;
  unitPrice: string | null;
  priceBasis: "NET_BEFORE_TAX_NO_HEADER_DISCOUNT" | "UNVERIFIED";
  currency: string | null;
  uom: string | null;
  stockUom: string | null;
  conversionFactor: string | null;
  invoiceTaxTotal: string | null;
  taxTemplate: string | null;
  lineDiscountPercent: string | null;
  invoiceDiscount: string | null;
};

const rowSchema = z.object({
  company: z.string(),
  name: z.string().min(1).max(200),
  supplier: z.string().min(1).max(200),
  supplier_name: z.string().nullish(),
  posting_date: z.iso.date(),
  posting_time: z.string().nullish(),
  item_code: z.string(),
  docstatus: z.number().int(),
  is_return: z.union([z.number(), z.boolean(), z.string()]).nullish(),
  status: z.string().nullish(),
  idx: z.coerce.number().int().positive(),
}).passthrough();

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 200) : null;
}

function decimal(value: unknown): string | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const s = String(value).trim();
  if (s.length > 64 || !/^-?\d+(?:\.\d+)?(?:e[+-]?\d{1,2})?$/i.test(s)) return null;
  const formatted = new Prisma.Decimal(s).toFixed();
  return formatted.length <= 80 ? formatted : null;
}

function positive(value: unknown) {
  const parsed = decimal(value);
  return parsed && parsed !== "0" && !parsed.startsWith("-") ? parsed : null;
}

const parentFields = [
  "name", "company", "supplier", "supplier_name", "posting_date", "posting_time", "currency", "docstatus", "status",
  "is_return", "total_taxes_and_charges", "taxes_and_charges", "discount_amount",
];
const childFields = [
  "idx", "item_code", "qty", "rate", "net_rate", "uom", "stock_uom", "conversion_factor",
  "discount_percentage", "purchase_order", "purchase_receipt", "item_tax_template",
].map((field) => "`tabPurchase Invoice Item`." + field);

export async function verifyExactErpItem(cfg: OsfErpCredentials, itemCode: string) {
  const query = new URLSearchParams({
    fields: JSON.stringify(["item_code"]),
    filters: JSON.stringify([["item_code", "=", itemCode]]),
    limit_page_length: "2",
  });
  const result = await erpGetJson<{ data: unknown[] }>(cfg, "/api/resource/Item?" + query, {
    signal: AbortSignal.timeout(3000), redirect: "error",
  });
  const rows = z.array(z.object({ item_code: z.string() })).max(2).parse(result.data);
  if (rows.some((row) => row.item_code !== itemCode)) throw new Error("Unexpected ERP item scope");
  if (rows.length > 1) return "MAPPING_AMBIGUOUS" as const;
  return rows.length === 1 ? "VERIFIED" as const : "MAPPING_UNAVAILABLE" as const;
}

const pageSize = 50;
const maxRows = 250;

export async function fetchPurchaseHistory(input: {
  cfg: OsfErpCredentials; erpCompany: string; itemCode: string; from: string; to: string;
}) {
  const records: PurchaseHistoryRecord[] = [];
  const seen = new Set<string>();
  let hasUnusableRows = false;
  let truncated = false;
  const signal = AbortSignal.timeout(8000);
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const query = new URLSearchParams({
      fields: JSON.stringify([...parentFields, ...childFields]),
      filters: JSON.stringify([
        ["company", "=", input.erpCompany], ["docstatus", "=", 1], ["is_return", "=", 0],
        ["posting_date", ">=", input.from], ["posting_date", "<=", input.to],
        ["Purchase Invoice Item", "item_code", "=", input.itemCode],
      ]),
      order_by: "posting_date desc, posting_time desc, name desc, `tabPurchase Invoice Item`.idx asc",
      limit_start: String(offset), limit_page_length: String(pageSize),
    });
    const body = await erpGetJson<{ data: unknown[] }>(input.cfg, "/api/resource/Purchase%20Invoice?" + query, {
      signal, redirect: "error",
    });
    if (!Array.isArray(body.data) || body.data.length > pageSize) throw new Error("Unexpected invoice response");

    for (const raw of body.data) {
      const parsed = rowSchema.safeParse(raw);
      if (!parsed.success) { hasUnusableRows = true; continue; }
      const row = parsed.data;
      if (row.company !== input.erpCompany || row.item_code !== input.itemCode ||
        row.posting_date < input.from || row.posting_date > input.to) throw new Error("Unexpected invoice scope");
      if (!(row.is_return === 0 || row.is_return === false || row.is_return === "0") ||
        !isUsablePurchaseDoc(row) || isNoisePurchaseSupplier(row)) continue;
      const quantity = positive(row.qty);
      if (!quantity) continue;

      const key = JSON.stringify([row.name, row.idx]);
      if (seen.has(key)) continue;
      seen.add(key);
      const time = /^(\d{1,2}):([0-5]\d):([0-5]\d)(?:\.(\d{1,6}))?$/.exec(row.posting_time ?? "");
      const postingTime = time && Number(time[1]) < 24
        ? time[1].padStart(2, "0") + ":" + time[2] + ":" + time[3] + "." + (time[4] ?? "").padEnd(6, "0")
        : null;
      const currency = optionalText(row.currency);
      const netRate = positive(row.net_rate);
      const invoiceTaxTotal = decimal(row.total_taxes_and_charges);
      const invoiceDiscount = decimal(row.discount_amount);
      const taxTemplate = optionalText(row.item_tax_template) ?? optionalText(row.taxes_and_charges);
      records.push({
        documentType: "Purchase Invoice", reference: row.name, line: String(row.idx),
        purchaseOrder: optionalText(row.purchase_order), purchaseReceipt: optionalText(row.purchase_receipt),
        supplierId: row.supplier, supplierName: optionalText(row.supplier_name) ?? row.supplier,
        date: row.posting_date, postingTime, quantity, unitPrice: netRate ?? positive(row.rate),
        priceBasis: netRate && invoiceTaxTotal === "0" && invoiceDiscount === "0" && !taxTemplate
          ? "NET_BEFORE_TAX_NO_HEADER_DISCOUNT" : "UNVERIFIED",
        currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : null,
        uom: optionalText(row.uom), stockUom: optionalText(row.stock_uom), conversionFactor: positive(row.conversion_factor),
        invoiceTaxTotal, taxTemplate, lineDiscountPercent: decimal(row.discount_percentage), invoiceDiscount,
      });
    }
    if (body.data.length < pageSize) break;
    if (offset + pageSize === maxRows) truncated = true;
  }
  records.sort((left, right) =>
    right.date.localeCompare(left.date) || (right.postingTime ?? "").localeCompare(left.postingTime ?? "") ||
    right.reference.localeCompare(left.reference) ||
    Number(left.line) - Number(right.line));
  return { records, truncated, hasUnusableRows };
}
