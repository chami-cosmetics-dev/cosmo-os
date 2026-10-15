import { z } from "zod";

import {
  GIFT_VOUCHER_CODE_MODES,
  GIFT_VOUCHER_CODE_PATTERN,
  GIFT_VOUCHER_DATE_FIELDS,
  GIFT_VOUCHER_MAX_QUANTITY,
  GIFT_VOUCHER_STATUSES,
  normalizeVoucherCode,
} from "@/lib/gift-vouchers/types";
import { trimmedString } from "@/lib/validation";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const giftVoucherGroupCreateSchema = z
  .object({
    name: trimmedString(1, 120),
    codePrefix: z
      .string()
      .transform((s) => s.trim().toUpperCase())
      .refine((s) => /^[A-Z0-9-]{1,20}$/.test(s), "Use 1-20 letters, digits or dashes"),
    mode: z.enum(GIFT_VOUCHER_CODE_MODES),
    /** Used when mode is "generate". */
    quantity: z.coerce.number().int().min(1).max(GIFT_VOUCHER_MAX_QUANTITY).optional(),
    /** Used when mode is "manual": the codes exactly as the creator entered them. */
    codes: z
      .array(z.string().transform(normalizeVoucherCode))
      .max(GIFT_VOUCHER_MAX_QUANTITY)
      .optional(),
    startDate: isoDate,
    endDate: isoDate,
  })
  .superRefine((v, ctx) => {
    if (v.endDate < v.startDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date must be on or after the start date" });
    }
    if (v.mode === "generate" && !v.quantity) {
      ctx.addIssue({ code: "custom", path: ["quantity"], message: "Enter how many codes to generate" });
    }
    if (v.mode === "manual") {
      const codes = v.codes ?? [];
      if (codes.length === 0) {
        ctx.addIssue({ code: "custom", path: ["codes"], message: "Add at least one batch code" });
      }
      const invalid = codes.find((code) => !GIFT_VOUCHER_CODE_PATTERN.test(code));
      if (invalid) {
        ctx.addIssue({ code: "custom", path: ["codes"], message: `"${invalid}" is not a valid code (letters, digits, - or _ only)` });
      }
      const seen = new Set<string>();
      const duplicate = codes.find((code) => seen.size === seen.add(code).size);
      if (duplicate) {
        ctx.addIssue({ code: "custom", path: ["codes"], message: `${duplicate} is listed more than once` });
      }
    }
  });

const optionalText = (max: number) =>
  z
    .string()
    .optional()
    .transform((s) => s?.trim() || undefined)
    .refine((s) => !s || s.length <= max, `Maximum ${max} character(s)`);

export const giftVoucherCodeListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25),
  groupId: optionalText(64),
  code: optionalText(60),
  status: z.enum(GIFT_VOUCHER_STATUSES).optional(),
  dateField: z.enum(GIFT_VOUCHER_DATE_FIELDS).default("used"),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export const giftVoucherCheckQuerySchema = z.object({
  code: trimmedString(1, 60),
});

/** Editable group fields. Codes, quantity and the group number are permanent. */
export const giftVoucherGroupUpdateSchema = z
  .object({
    name: trimmedString(1, 120),
    codePrefix: z
      .string()
      .transform((s) => s.trim().toUpperCase())
      .refine((s) => /^[A-Z0-9-]{1,20}$/.test(s), "Use 1-20 letters, digits or dashes"),
    startDate: isoDate,
    endDate: isoDate,
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: "End date must be on or after the start date",
    path: ["endDate"],
  });
