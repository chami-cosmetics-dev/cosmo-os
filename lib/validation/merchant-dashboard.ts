import { z } from "zod";

import { cuidSchema, LIMITS, trimmedString } from "@/lib/validation";

export const merchantDashboardYearMonthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Invalid yearMonth (YYYY-MM)");

export const merchantDashboardPageDataQuerySchema = z.object({
  merchantUserId: cuidSchema.optional(),
  yearMonth: merchantDashboardYearMonthSchema.optional(),
  showCustomerLists: z
    .enum(["true", "1", "false", "0"])
    .optional()
    .transform((v) => v === "true" || v === "1"),
  fromDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  toDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const merchantDashboardDayYmdSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid day (YYYY-MM-DD)");

export const merchantDashboardDailyInvoicesQuerySchema = z.object({
  merchantUserId: cuidSchema.optional(),
  day: merchantDashboardDayYmdSchema,
});

export const merchantDashboardSalesMovementQuerySchema = z.object({
  merchantUserId: cuidSchema.optional(),
});

export const merchantMonthlyTargetUpsertSchema = z.object({
  merchantUserId: cuidSchema,
  yearMonth: merchantDashboardYearMonthSchema,
  targetAmount: z
    .number()
    .finite()
    .positive()
    .max(1_000_000_000)
    .optional(),
  shopTargetAmount: z
    .number()
    .finite()
    .positive()
    .max(1_000_000_000)
    .nullable()
    .optional(),
  onlineTargetAmount: z
    .number()
    .finite()
    .positive()
    .max(1_000_000_000)
    .nullable()
    .optional(),
  wholesaleTargetAmount: z
    .number()
    .finite()
    .positive()
    .max(1_000_000_000)
    .nullable()
    .optional(),
  note: trimmedString(0, LIMITS.description.max).nullable().optional(),
}).refine(
  (data) =>
    data.targetAmount != null ||
    (data.shopTargetAmount != null && data.shopTargetAmount > 0) ||
    (data.onlineTargetAmount != null && data.onlineTargetAmount > 0) ||
    (data.wholesaleTargetAmount != null && data.wholesaleTargetAmount > 0),
  { message: "Provide targetAmount, channel targets, or wholesale target" },
);

export const birthdayWishSendSchema = z.object({
  contactId: cuidSchema,
  discountPercent: z.number().int().min(0).max(50),
  discountCode: trimmedString(0, 32).nullable().optional(),
  phoneNumber: trimmedString(0, LIMITS.mobile.max).optional(),
  message: trimmedString(1, 480).optional(),
});
