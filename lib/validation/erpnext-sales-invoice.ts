import { z } from "zod";

export const erpnextSalesInvoiceWebhookSchema = z.object({
  name: z.string(),
  customer: z.string(),
  company: z.string(),
  posting_date: z.string().optional().nullable(),
  grand_total: z.number().optional().nullable(),
  net_total: z.number().optional().nullable(),
  po_no: z.string().optional().nullable(),
  currency: z.string().optional().nullable(),
  docstatus: z.number().optional().nullable(),
  outstanding_amount: z.number().optional().nullable(),
  set_warehouse: z.string().optional().nullable(),
  is_pos: z.number().optional().nullable(),
  payment_type: z.string().optional().nullable().default(null),
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
