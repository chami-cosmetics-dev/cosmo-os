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

const deliveryPaymentMethodSchema = z.enum(["cod", "bank_transfer", "card", "already_paid"]);

const riderPaymentLineSchema = z
  .object({
    paymentMethod: deliveryPaymentMethodSchema,
    amount: z.number().min(0.01).max(100000000),
    referenceNote: z.string().max(LIMITS.orderRemarkContent.max).optional(),
    bankReference: z.string().max(120).optional(),
    cardReference: z.string().max(120).optional(),
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

export const riderPaymentSchema = z
  .object({
    /** Legacy single-method collection (still supported). */
    paymentMethod: deliveryPaymentMethodSchema.optional(),
    collectedAmount: z.number().min(0).max(100000000).optional(),
    referenceNote: z.string().max(LIMITS.orderRemarkContent.max).optional(),
    bankReference: z.string().max(120).optional(),
    cardReference: z.string().max(120).optional(),
    /** Split payment: cash + card (etc). Sum of amounts must equal order total. */
    lines: z.array(riderPaymentLineSchema).min(1).max(5).optional(),
    idempotencyKey: z.string().max(120).optional(),
  })
  .superRefine((value, ctx) => {
    const hasLines = Boolean(value.lines && value.lines.length > 0);
    if (!hasLines) {
      if (!value.paymentMethod) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "paymentMethod is required when lines are omitted",
          path: ["paymentMethod"],
        });
      }
      if (value.collectedAmount == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "collectedAmount is required when lines are omitted",
          path: ["collectedAmount"],
        });
      }
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
      return;
    }

    const methods = value.lines!.map((line) => line.paymentMethod);
    if (new Set(methods).size !== methods.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Each payment method can only appear once in a split payment",
        path: ["lines"],
      });
    }
    if (value.lines!.length > 1 && methods.includes("already_paid")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "already_paid cannot be combined with other methods",
        path: ["lines"],
      });
    }
  });

export const riderDeliveryCompleteSchema = z.object({
  idempotencyKey: z.string().max(120).optional(),
  acceptedAt: z.string().datetime().optional(),
  arrivedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  oldItemCollectionStatus: z.enum(["collected", "not_collected"]).optional(),
  oldItemCollectionRemark: z.string().max(LIMITS.orderRemarkContent.max).optional(),
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
