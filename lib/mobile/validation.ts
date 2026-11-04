import { z } from "zod";
import { cuidSchema, emailSchema, LIMITS, passwordSchema, trimmedString } from "@/lib/validation";

export const mobileLoginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  deviceName: z.string().max(120).optional(),
});

export const mobileDeliveryStatusFilterSchema = z
  .enum(["assigned", "accepted", "arrived", "completed", "failed", "active"])
  .optional();

/** List query for GET /api/mobile/v1/deliveries */
export const mobileDeliveriesQuerySchema = z.object({
  status: mobileDeliveryStatusFilterSchema,
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).max(10_000).optional().default(0),
  /** Asia/Colombo calendar day YYYY-MM-DD — filters completedAt (use with status=completed). */
  on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const deliveryPaymentMethodSchema = z.enum(["cod", "bank_transfer", "card", "already_paid"]);

/** Card-on-delivery: last 4 digits only. */
export const cardLast4Schema = z
  .string()
  .trim()
  .regex(/^\d{4}$/, "Enter the last 4 digits of the card");

const riderPaymentLineSchema = z
  .object({
    paymentMethod: deliveryPaymentMethodSchema,
    /** already_paid may be 0 (fully prepaid). Other methods need a positive amount. */
    amount: z.number().min(0).max(100000000),
    referenceNote: z.string().max(LIMITS.orderRemarkContent.max).optional(),
    bankReference: z.string().max(120).optional(),
    cardReference: z.string().max(120).optional(),
    cardLast4: z.string().max(4).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.paymentMethod !== "already_paid" && value.amount < 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Amount must be greater than 0",
        path: ["amount"],
      });
    }
    if (value.paymentMethod === "bank_transfer" && !value.bankReference?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Bank transfer reference is required",
        path: ["bankReference"],
      });
    }
    if (value.paymentMethod === "card") {
      const last4 = (value.cardLast4 ?? value.cardReference ?? "").trim();
      if (!/^\d{4}$/.test(last4)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Enter the last 4 digits of the card",
          path: ["cardLast4"],
        });
      }
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
    cardLast4: z.string().max(4).optional(),
    /** Existing Cloudinary URL, or omit and send cardSlipImageBase64. */
    cardSlipImageUrl: z.string().url().max(2000).optional(),
    /** JPEG/PNG data URI or raw base64 for card payment slip photo. */
    cardSlipImageBase64: z.string().max(6_000_000).optional(),
    /** Split payment: cash + card (etc). Sum of amounts must equal order total. */
    lines: z.array(riderPaymentLineSchema).min(1).max(5).optional(),
    /** Cash tendered by customer (for COD / cash portion). */
    customerGaveAmount: z.number().min(0).max(100000000).optional(),
    changeAmount: z.number().min(0).max(100000000).optional(),
    idempotencyKey: z.string().max(120).optional(),
  })
  .superRefine((value, ctx) => {
    const hasLines = Boolean(value.lines && value.lines.length > 0);
    const cashDue = hasLines
      ? value.lines!.filter((line) => line.paymentMethod === "cod").reduce((sum, line) => sum + line.amount, 0)
      : value.paymentMethod === "cod"
        ? (value.collectedAmount ?? 0)
        : 0;
    if (cashDue > 0.001) {
      if (value.customerGaveAmount == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Customer gave amount is required for cash collection",
          path: ["customerGaveAmount"],
        });
      } else if (value.customerGaveAmount + 0.001 < cashDue) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Customer gave amount must cover the cash due",
          path: ["customerGaveAmount"],
        });
      }
    }
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
      if (value.paymentMethod === "card") {
        const last4 = (value.cardLast4 ?? value.cardReference ?? "").trim();
        if (!/^\d{4}$/.test(last4)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Enter the last 4 digits of the card",
            path: ["cardLast4"],
          });
        }
      }
    } else {
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
    }

    const usesCard =
      value.paymentMethod === "card" ||
      Boolean(value.lines?.some((line) => line.paymentMethod === "card"));
    if (usesCard && !value.cardSlipImageUrl?.trim() && !value.cardSlipImageBase64?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Photo of the card payment slip is required",
        path: ["cardSlipImageBase64"],
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
  /** WGS84 GPS at door when completing. Optional if phone denies location. */
  completedLatitude: z.number().min(-90).max(90).optional(),
  completedLongitude: z.number().min(-180).max(180).optional(),
  completedAccuracyMeters: z.number().min(0).max(100_000).optional(),
  completedLocationAt: z.string().datetime().optional(),
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
