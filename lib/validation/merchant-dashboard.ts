import { z } from "zod";

import { cuidSchema, LIMITS, trimmedString } from "@/lib/validation";

export const merchantDashboardYearMonthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Invalid yearMonth (YYYY-MM)");

export const merchantDashboardPageDataQuerySchema = z.object({
  merchantUserId: cuidSchema.optional(),
  yearMonth: merchantDashboardYearMonthSchema.optional(),
});

export const merchantDashboardDayYmdSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid day (YYYY-MM-DD)");

export const merchantDashboardDailyInvoicesQuerySchema = z.object({
  merchantUserId: cuidSchema.optional(),
  day: merchantDashboardDayYmdSchema,
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

export const birthdayWishSendSchema = z.object({
  contactId: cuidSchema,
  discountPercent: z.number().int().min(0).max(50),
  discountCode: trimmedString(0, 32).nullable().optional(),
  phoneNumber: trimmedString(0, LIMITS.mobile.max).optional(),
  message: trimmedString(1, 480).optional(),
});
