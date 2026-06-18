import { z } from "zod";

/**
 * ERPNext Sales Invoice webhook body (Cosmo OS + Vault OS share this handler).
 * ERP must include `customer_name` (Sales Invoice display name) — not only `customer` (often a phone ID).
 */
export const erpnextSalesInvoiceWebhookSchema = z.object({
  name: z.string(),
  customer: z.string(),
  customer_name: z.string().optional().nullable(),
  company: z.string(),
  posting_date: z.string().optional().nullable(),
  grand_total: z.number().optional().nullable(),
  net_total: z.number().optional().nullable(),
  po_no: z.string().optional().nullable(),
  currency: z.string().optional().nullable(),
  docstatus: z.number().optional().nullable(),
  outstanding_amount: z.number().optional().nullable(),
  set_warehouse: z.string().optional().nullable(),
  is_pos: z.union([z.number(), z.boolean()]).optional().nullable().transform((v) => (v == null ? null : Number(v))),
  is_return: z.union([z.number(), z.boolean()]).optional().nullable().transform((v) => (v == null ? null : Number(v))),
  return_against: z.string().optional().nullable(),
  payment_type: z.string().optional().nullable().default(null),
  custom_payment_type: z.string().optional().nullable().default(null),
  custom_merchant_coupon_code: z.string().optional().nullable().default(null),
  posa_pos_opening_shift: z.string().optional().nullable().default(null),
  owner: z.string().optional().nullable(),
  contact_email: z.string().optional().nullable(),
  contact_mobile: z.string().optional().nullable(),
  address_display: z.string().optional().nullable(),
  shipping_address: z.string().optional().nullable(),
  items: z
    .array(
      z.object({
        item_code: z.string(),
        item_name: z.string().optional().nullable(),
        qty: z.number(),
        rate: z.number(),
        amount: z.number().optional().nullable(),
      }),
    )
    .optional()
    .default([]),
  payments: z
    .array(
      z.object({
        mode_of_payment: z.string(),
        amount: z.number().optional().nullable(),
      }),
    )
    .optional()
    .default([]),
});

export type ErpnextSalesInvoiceWebhookPayload = z.infer<
  typeof erpnextSalesInvoiceWebhookSchema
>;
