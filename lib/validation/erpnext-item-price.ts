import { z } from "zod";

import { LIMITS } from "@/lib/validation";

/** ERPNext sends literal "None" for unset string fields. */
const erpString = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (!v?.trim() || v.trim().toLowerCase() === "none" ? null : v.trim()));

const erpFlag = z
  .union([z.number(), z.boolean()])
  .optional()
  .nullable()
  .transform((v) => (v == null ? null : Number(v)));

/**
 * ERPNext Item Price webhook body (create/update).
 * Configure ERP webhook on Item Price with header `x-erpnext-secret`.
 */
export const erpnextItemPriceWebhookSchema = z.object({
  name: z.string().min(1).max(140),
  item_code: z.string().min(1).max(LIMITS.sku.max),
  item_name: erpString,
  price_list: z.string().min(1).max(140),
  price_list_rate: z.number(),
  currency: erpString,
  selling: erpFlag,
  buying: erpFlag,
  uom: erpString,
});

export type ErpnextItemPriceWebhookPayload = z.infer<typeof erpnextItemPriceWebhookSchema>;
