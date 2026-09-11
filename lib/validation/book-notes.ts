import { z } from "zod";

import { BOOK_NOTE_ERP_PAYMENT_METHODS } from "@/lib/book-notes/split-lines";
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
  /**
   * Open this exact sheet instead of the caller's own one for the shop/date.
   * Sent when a row is opened from history, so an admin lands on the merchant's
   * sheet rather than starting a second one of their own.
   */
  bookNoteDayId: cuidSchema.optional(),
  /** History search: shop name, posting date, or sales invoice number. */
  q: z.string().trim().max(120).optional(),
});

/** Finance review: shop (optional = all) over a posting-date range. */
export const bookNoteFinanceReviewQuerySchema = z
  .object({
    companyLocationId: cuidSchema.optional(),
    from: ymdSchema,
    to: ymdSchema,
  })
  .superRefine((val, ctx) => {
    if (val.from > val.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "from must be on or before to",
        path: ["from"],
      });
    }
  });

export const bookNoteSuggestionsQuerySchema = z.object({
  companyLocationId: cuidSchema,
  q: trimmedString(2, 120),
  postingDate: ymdSchema.optional(),
});


const bookNoteSplitLineSchema = z.object({
  paymentMethod: z.enum(BOOK_NOTE_ERP_PAYMENT_METHODS),
  amount: moneySchema,
  cardLast4: z
    .string()
    .trim()
    .max(4)
    .optional()
    .nullable()
    .transform((v) => {
      const t = (v ?? "").trim();
      return t.length === 0 ? null : t;
    }),
  kokoReference: trimmedString(0, 120).optional().nullable(),
  bankReference: trimmedString(0, 120).optional().nullable(),
});

export const bookNotePutRowSchema = z
  .object({
    idxNo: z.string().trim().max(LIMITS.bookNoteIdxNo.max).default(""),
    salesInvoice: z.string().trim().max(LIMITS.bookNoteSalesInvoice.max),
    cash: moneySchema.default(0),
    card: moneySchema.default(0),
    cardReceiptRefLast4: z
      .string()
      .trim()
      .max(4)
      .optional()
      .nullable()
      .transform((v) => {
        const t = (v ?? "").trim();
        return t.length === 0 ? null : t;
      }),
    koko: moneySchema.default(0),
    bankTransfer: moneySchema.default(0),
    splitLines: z.array(bookNoteSplitLineSchema).max(LIMITS.bookNoteSplitLinesMax).optional().nullable(),
    orderId: cuidSchema.nullable().optional(),
  })
  .superRefine((row, ctx) => {
    const hasSplit =
      Array.isArray(row.splitLines) && row.splitLines.length > 0;

    if (hasSplit) {
      const positive = row.splitLines!.filter((sl) => sl.amount > 0);
      if (positive.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Split payment row needs at least one line with amount",
          path: ["splitLines"],
        });
      }
      row.splitLines!.forEach((sl, i) => {
        if (sl.amount <= 0) return;
        if (sl.paymentMethod === "Card" && sl.cardLast4 && !/^\d{4}$/.test(sl.cardLast4)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Card last 4 must be exactly 4 digits",
            path: ["splitLines", i, "cardLast4"],
          });
        }
      });
      return;
    }

    if (row.card > 0) {
      if (!row.cardReceiptRefLast4 || !/^\d{4}$/.test(row.cardReceiptRefLast4)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Card receipt last 4 digits required when card amount is entered",
          path: ["cardReceiptRefLast4"],
        });
      }
    } else if (row.cardReceiptRefLast4 && !/^\d{4}$/.test(row.cardReceiptRefLast4)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Card receipt reference must be exactly 4 digits",
        path: ["cardReceiptRefLast4"],
      });
    }
  });

export const bookNotePutBodySchema = z.object({
  companyLocationId: cuidSchema,
  postingDate: ymdSchema,
  /**
   * Save onto this exact sheet. Omitted for a merchant's own book note, which
   * is found by shop + date + submitter; sent when a sheet was opened from a
   * history row so the save lands on that one.
   */
  bookNoteDayId: cuidSchema.optional(),
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
  /** Push this exact sheet; defaults to the caller's own for the shop/date. */
  bookNoteDayId: cuidSchema.optional(),
});

export type BookNotePutBody = z.infer<typeof bookNotePutBodySchema>;
export type BookNotePutRow = z.infer<typeof bookNotePutRowSchema>;
