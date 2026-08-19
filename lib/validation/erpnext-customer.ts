import { z } from "zod";

// ERPNext sends literal "None" for unset string fields instead of null/empty.
const erpString = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (!v?.trim() || v.trim().toLowerCase() === "none" ? null : v.trim()));

/**
 * ERPNext Customer webhook body (Cosmo OS).
 *
 * Expected to receive the Customer document fields (root or under `data`).
 * We only use the fields relevant for syncing ContactMaster:
 * - name (ERP Customer doc id)
 * - customer_name (display)
 * - mobile_no / email_id
 * - owner (creator/cashier user)
 * - customer_group (loyalty group on ERP side)
 * - company (ERPNext company name mapping)
 */
export const erpnextCustomerWebhookSchema = z.object({
  name: z.string(),
  customer_name: erpString,
  mobile_no: erpString,
  email_id: erpString,
  owner: erpString,

  customer_group: erpString,
  /** Optional — Customer doctype often has no company; Cosmo auths by webhook secret. */
  company: erpString,

  // Optional audit timestamps (ERPNext sends strings)
  creation: erpString,
  modified: erpString,
});

export type ErpnextCustomerWebhookPayload = z.infer<
  typeof erpnextCustomerWebhookSchema
>;

