import { z } from "zod";

const nullableString = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (!v?.trim() || v.trim().toLowerCase() === "none" ? null : v.trim()));

const optionalNumber = z.coerce.number().optional().nullable();

export const erpnextPurchaseReceiptWebhookSchema = z.object({
  name: z.string().min(1),
  company: z.string().min(1),
  supplier: z.string().min(1),
  supplier_name: nullableString,
  posting_date: nullableString,
  posting_time: nullableString,
  docstatus: optionalNumber,
  status: nullableString,
  amended_from: nullableString,
  owner: nullableString,
  creation: nullableString,
  items: z
    .array(
      z.object({
        name: z.string().min(1),
        item_code: z.string().min(1),
        item_name: nullableString,
        qty: z.coerce.number(),
        stock_qty: optionalNumber,
        warehouse: nullableString,
        stock_uom: nullableString,
      }),
    )
    .optional()
    .default([]),
});

export const erpnextSupplierStockReturnWebhookSchema = z.object({
  name: z.string().min(1),
  company: z.string().min(1),
  supplier: z.string().min(1),
  return_date: nullableString,
  docstatus: optionalNumber,
  amended_from: nullableString,
  owner: nullableString,
  creation: nullableString,
  items: z
    .array(
      z.object({
        name: z.string().min(1),
        item_code: z.string().min(1),
        item_name: nullableString,
        qty: z.coerce.number(),
        stock_uom: nullableString,
      }),
    )
    .optional()
    .default([]),
});

export const erpnextPurchaseInvoiceWebhookSchema = z.object({
  name: z.string().min(1),
  company: z.string().min(1),
  supplier: z.string().min(1),
  supplier_name: nullableString,
  posting_date: nullableString,
  docstatus: optionalNumber,
  status: nullableString,
  amended_from: nullableString,
  owner: nullableString,
  creation: nullableString,
  items: z
    .array(
      z.object({
        name: z.string().min(1),
        item_code: z.string().min(1),
        item_name: nullableString,
        qty: z.coerce.number(),
        rate: z.coerce.number(),
        amount: z.coerce.number(),
        purchase_receipt: nullableString,
        purchase_receipt_item: nullableString,
        stock_uom: nullableString,
      }),
    )
    .optional()
    .default([]),
});

export type ErpnextPurchaseReceiptWebhookPayload = z.infer<
  typeof erpnextPurchaseReceiptWebhookSchema
>;

export type ErpnextSupplierStockReturnWebhookPayload = z.infer<
  typeof erpnextSupplierStockReturnWebhookSchema
>;

export type ErpnextPurchaseInvoiceWebhookPayload = z.infer<
  typeof erpnextPurchaseInvoiceWebhookSchema
>;
