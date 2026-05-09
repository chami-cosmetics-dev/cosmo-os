import { z } from "zod";
import { cuidSchema, emailSchema, LIMITS, passwordSchema, trimmedString } from "@/lib/validation";

export const mobileLoginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  deviceName: z.string().max(120).optional(),
});

export const mobileDeliveryStatusFilterSchema = z
  .enum(["assigned", "accepted", "arrived", "completed", "failed"])
  .optional();

export const riderPaymentSchema = z
  .object({
    paymentMethod: z.enum(["cod", "bank_transfer", "card", "already_paid"]),
    collectedAmount: z.number().min(0).max(100000000),
    referenceNote: z.string().max(LIMITS.orderRemarkContent.max).optional(),
    bankReference: z.string().max(120).optional(),
    cardReference: z.string().max(120).optional(),
    idempotencyKey: z.string().max(120).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.paymentMethod === "bank_transfer" && !value.bankReference?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Bank transfer reference is required",
        path: ["bankReference"],
      });
    }

    if (value.paymentMethod === "card" && !value.cardReference?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Card invoice/reference number is required",
        path: ["cardReference"],
      });
    }
  });

export const riderDeliveryCompleteSchema = z.object({
  idempotencyKey: z.string().max(120).optional(),
  acceptedAt: z.string().datetime().optional(),
  arrivedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
});

export const riderDeliveryFailSchema = z.object({
  reason: trimmedString(1, LIMITS.orderRemarkContent.max),
  idempotencyKey: z.string().max(120).optional(),
});

export const riderCashHandoverCreateSchema = z.object({
  handoverDate: z.string().datetime().optional(),
  totalHandedOverCash: z.number().min(0).max(100000000),
  notes: z.string().max(LIMITS.orderRemarkContent.max).optional(),
  idempotencyKey: z.string().max(120).optional(),
});

export const mobileRouteIdSchema = cuidSchema;
