import { z } from "zod";

import { phoneDigitsOnly } from "@/lib/phone-lookup";
import { cuidSchema, LIMITS, trimmedString } from "@/lib/validation";

/** Phone search: trimmed, phone-like, ≥7 digits after normalize. */
export const customerInsightSearchQuerySchema = z
  .object({
    phone: trimmedString(1, LIMITS.mobile.max),
  })
  .superRefine((val, ctx) => {
    const digits = phoneDigitsOnly(val.phone);
    if (digits.length < 7) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Phone number must have at least 7 digits",
        path: ["phone"],
      });
    }
  });

export const customerInsightContactParamsSchema = z.object({
  contactId: cuidSchema,
});

export const customerInsightInvoicesQuerySchema = z.object({
  invoicesPage: z.coerce
    .number()
    .int()
    .min(LIMITS.pagination.pageMin)
    .max(LIMITS.pagination.pageMax)
    .default(1),
  invoicesPageSize: z.coerce.number().int().min(1).max(50).default(25),
});
