import { z } from "zod";

import { LIMITS } from "@/lib/validation";

const MERCHANT_ORDERS_LIMIT_MAX = 50;

export const merchantOrdersQuerySchema = z
  .object({
    email: z.string().trim().max(LIMITS.email.max).optional().default(""),
    phone: z.string().trim().max(LIMITS.mobile.max).optional().default(""),
    page: z.coerce
      .number()
      .int()
      .min(LIMITS.pagination.pageMin)
      .max(LIMITS.pagination.pageMax)
      .optional()
      .default(1),
    limit: z.coerce
      .number()
      .int()
      .min(LIMITS.pagination.limitMin)
      .max(MERCHANT_ORDERS_LIMIT_MAX)
      .optional()
      .default(20),
  })
  .superRefine((value, ctx) => {
    if (!value.email && !value.phone) {
      ctx.addIssue({
        code: "custom",
        message: "email or phone is required",
        path: ["email"],
      });
    }
    if (value.email && !z.string().email().safeParse(value.email).success) {
      ctx.addIssue({
        code: "custom",
        message: "Invalid email",
        path: ["email"],
      });
    }
  })
  .transform((value) => ({
    email: value.email ? value.email.toLowerCase() : undefined,
    phone: value.phone || undefined,
    page: value.page,
    limit: value.limit,
  }));

export type MerchantOrdersQuery = z.infer<typeof merchantOrdersQuerySchema>;
