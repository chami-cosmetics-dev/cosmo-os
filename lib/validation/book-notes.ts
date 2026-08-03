import { z } from "zod";

import { cuidSchema, LIMITS, trimmedString } from "@/lib/validation";

const ymdSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)");

const moneySchema = z.coerce
  .number()
  .finite()
  .min(0)
  .transform((n) => Math.round(n * 100) / 100);

export const bookNotePageDataQuerySchema = z.object({
  companyLocationId: cuidSchema.optional(),
  postingDate: ymdSchema.optional(),
});

export const bookNoteSuggestionsQuerySchema = z.object({
  companyLocationId: cuidSchema,
  q: trimmedString(2, 120),
  postingDate: ymdSchema.optional(),
});

export const bookNotePutRowSchema = z.object({
  idxNo: z.string().trim().max(LIMITS.bookNoteIdxNo.max).default(""),
  salesInvoice: z.string().trim().max(LIMITS.bookNoteSalesInvoice.max),
  cash: moneySchema.default(0),
  card: moneySchema.default(0),
  koko: moneySchema.default(0),
  bankTransfer: moneySchema.default(0),
  orderId: cuidSchema.nullable().optional(),
});

export const bookNotePutBodySchema = z.object({
  companyLocationId: cuidSchema,
  postingDate: ymdSchema,
  rows: z.array(bookNotePutRowSchema).max(LIMITS.bookNoteRowsMax),
});

export const bookNoteRetrieveQuerySchema = z
  .object({
    companyLocationId: cuidSchema,
    postingDate: ymdSchema.optional(),
    from: ymdSchema.optional(),
    to: ymdSchema.optional(),
  })
  .superRefine((val, ctx) => {
    const hasSingle = Boolean(val.postingDate);
    const hasRange = Boolean(val.from || val.to);
    if (hasSingle && hasRange) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Use postingDate or from/to, not both",
      });
      return;
    }
    if (!hasSingle && !(val.from && val.to)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide postingDate or both from and to",
      });
      return;
    }
    if (val.from && val.to && val.from > val.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "from must be on or before to",
      });
    }
  });

/** Send saved (or inline) book note day to ERP verify Server Script. */
export const bookNoteSendToErpBodySchema = z.object({
  companyLocationId: cuidSchema,
  postingDate: ymdSchema,
});

export type BookNotePutBody = z.infer<typeof bookNotePutBodySchema>;
export type BookNotePutRow = z.infer<typeof bookNotePutRowSchema>;
