import { z } from "zod";

export const erpnextPaymentEntryWebhookSchema = z.object({
  name: z.string(),
  company: z.string(),
  docstatus: z.number().optional().nullable(),
  payment_type: z.string().optional().nullable(),
  mode_of_payment: z.string().optional().nullable(),
  party_type: z.string().optional().nullable(),
  party: z.string().optional().nullable(),
  paid_amount: z.number().optional().nullable(),
  references: z
    .array(
      z.object({
        reference_doctype: z.string(),
        reference_name: z.string(),
        allocated_amount: z.number().optional().nullable(),
      }),
    )
    .optional()
    .default([]),
});

export type ErpnextPaymentEntryWebhookPayload = z.infer<
  typeof erpnextPaymentEntryWebhookSchema
>;
