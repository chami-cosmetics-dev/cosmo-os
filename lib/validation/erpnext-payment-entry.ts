import { z } from "zod";

export const erpnextPaymentEntryWebhookSchema = z.object({
  name: z.string(),
  company: z.string(),
  references: z
    .array(
      z.object({
        reference_doctype: z.string(),
        reference_name: z.string(),
      }),
    )
    .optional()
    .default([]),
});

export type ErpnextPaymentEntryWebhookPayload = z.infer<
  typeof erpnextPaymentEntryWebhookSchema
>;
