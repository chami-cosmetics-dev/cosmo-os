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
});

export type ErpnextSalesInvoiceWebhookPayload = z.infer<
  typeof erpnextSalesInvoiceWebhookSchema
>;
