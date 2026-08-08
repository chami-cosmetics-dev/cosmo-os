import { z } from "zod";

import { cuidSchema, LIMITS, trimmedString } from "@/lib/validation";

export const merchantDashboardYearMonthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Invalid yearMonth (YYYY-MM)");

export const merchantDashboardPageDataQuerySchema = z.object({
  merchantUserId: cuidSchema.optional(),
  yearMonth: merchantDashboardYearMonthSchema.optional(),
});

export const merchantMonthlyTargetUpsertSchema = z.object({
  merchantUserId: cuidSchema,
  yearMonth: merchantDashboardYearMonthSchema,
  targetAmount: z
    .number()
    .finite()
    .positive()
    .max(1_000_000_000),
  note: trimmedString(0, LIMITS.description.max).nullable().optional(),
});
