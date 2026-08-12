import { z } from "zod";

import {
  CONTACT_GENDER_OPTIONS,
  CONTACT_LANGUAGE_OPTIONS,
} from "@/lib/customer-insight/contact-profile-options";
import {
  cuidSchema,
  emailSchema,
  LIMITS,
  trimmedString,
} from "@/lib/validation";
import { phoneDigitsOnly } from "@/lib/phone-lookup";

/** Phone search: trimmed, phone-like, ≥7 digits after normalize. */
export const customerInsightSearchQuerySchema = z
  .object({
    phone: trimmedString(1, LIMITS.mobile.max),
  })
  .superRefine((val, ctx) => {
    const digits = phoneDigitsOnly(val.phone);
    if (digits.length < 7) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Phone number must have at least 7 digits",
        path: ["phone"],
      });
    }
  });

export const customerInsightContactParamsSchema = z.object({
  contactId: cuidSchema,
});

export const customerInsightInvoicesQuerySchema = z.object({
  invoicesPage: z.coerce
    .number()
    .int()
    .min(LIMITS.pagination.pageMin)
    .max(LIMITS.pagination.pageMax)
    .default(1),
  invoicesPageSize: z.coerce.number().int().min(1).max(50).default(25),
});

export const customerInsightProfilePatchSchema = z
  .object({
    name: trimmedString(1, LIMITS.name.max).optional(),
    email: z
      .union([emailSchema, z.literal(""), z.null()])
      .optional()
      .transform((v) => (v === "" ? null : v)),
    addPhoneNumber: z
      .string()
      .trim()
      .min(1)
      .max(LIMITS.mobile.max)
      .optional(),
    gender: z
      .union([z.enum(CONTACT_GENDER_OPTIONS), z.literal(""), z.null()])
      .optional()
      .transform((v) =>
        v === "" || v === undefined ? (v === undefined ? undefined : null) : v
      ),
    language: z
      .union([z.enum(CONTACT_LANGUAGE_OPTIONS), z.literal(""), z.null()])
      .optional()
      .transform((v) =>
        v === "" || v === undefined ? (v === undefined ? undefined : null) : v
      ),
    address: z
      .union([z.string().trim().max(LIMITS.address.max), z.null()])
      .optional()
      .transform((v) =>
        v === "" || v === undefined ? (v === undefined ? undefined : null) : v
      ),
    birthYear: z.coerce.number().int().min(1900).max(2100).optional().nullable(),
    birthMonth: z.coerce.number().int().min(1).max(12).optional().nullable(),
    birthDay: z.coerce.number().int().min(1).max(31).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.addPhoneNumber) {
      const digits = phoneDigitsOnly(data.addPhoneNumber);
      if (digits.length < 7) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Phone number must have at least 7 digits",
          path: ["addPhoneNumber"],
        });
      }
    }
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.email !== undefined ||
      data.addPhoneNumber !== undefined ||
      data.gender !== undefined ||
      data.language !== undefined ||
      data.address !== undefined ||
      data.birthYear !== undefined ||
      data.birthMonth !== undefined ||
      data.birthDay !== undefined,
    { message: "At least one profile field is required" }
  );

export const customerInsightContactedBodySchema = z.object({
  category: z.enum([
    "N/A",
    "Interested",
    "Not Interested",
    "Not Responding",
    "Wrong Number",
    "Black List",
    "Busy",
    "Interested-SMS",
  ]),
  note: z.string().trim().max(500).optional().nullable(),
  remark: z.string().trim().max(2000).optional().nullable(),
  outcome: z
    .enum(["general", "loyalty_informed", "responded", "not_responded"])
    .optional()
    .default("general"),
});

/** MM-DD calendar day (ignore year). */
const monthDaySchema = z
  .string()
  .trim()
  .regex(/^\d{1,2}-\d{1,2}$/, "Expected MM-DD")
  .transform((v) => {
    const [mRaw, dRaw] = v.split("-");
    const month = Number(mRaw);
    const day = Number(dRaw);
    return { month, day };
  })
  .refine(
    (v) => v.month >= 1 && v.month <= 12 && v.day >= 1 && v.day <= 31,
    "Invalid month-day"
  );

const optionalIsoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .optional();

export const customerInsightFilterQuerySchema = z
  .object({
    brand: trimmedString(1, LIMITS.name.max).optional(),
    item: trimmedString(1, LIMITS.name.max).optional(),
    minTotal: z.coerce.number().min(0).optional(),
    maxTotal: z.coerce.number().min(0).optional(),
    birthdayFrom: monthDaySchema.optional(),
    birthdayTo: monthDaySchema.optional(),
    lastContactedFrom: optionalIsoDate,
    lastContactedTo: optionalIsoDate,
    loyaltyRegisteredFrom: optionalIsoDate,
    loyaltyRegisteredTo: optionalIsoDate,
    noPurchaseFrom: optionalIsoDate,
    noPurchaseTo: optionalIsoDate,
    /** Legacy presets still accepted. */
    noPurchaseMonths: z
      .union([z.literal("3"), z.literal("6"), z.literal(3), z.literal(6)])
      .optional()
      .transform((v) => {
        if (v === "3" || v === 3) return 3 as const;
        if (v === "6" || v === 6) return 6 as const;
        return undefined;
      }),
    page: z.coerce
      .number()
      .int()
      .min(LIMITS.pagination.pageMin)
      .max(LIMITS.pagination.pageMax)
      .default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(25),
  })
  .superRefine((val, ctx) => {
    if (
      val.minTotal != null &&
      val.maxTotal != null &&
      val.minTotal > val.maxTotal
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "minTotal cannot exceed maxTotal",
        path: ["minTotal"],
      });
    }
    if ((val.birthdayFrom && !val.birthdayTo) || (!val.birthdayFrom && val.birthdayTo)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "birthdayFrom and birthdayTo must both be set",
        path: ["birthdayFrom"],
      });
    }
  });

export const customerInsightMergeBodySchema = z
  .object({
    sourceContactId: cuidSchema,
    targetContactId: cuidSchema,
  })
  .refine((v) => v.sourceContactId !== v.targetContactId, {
    message: "source and target must differ",
    path: ["sourceContactId"],
  });

export const customerInsightLoyaltyAssignBodySchema = z.object({
  tier: z.enum(["gold", "platinum"]),
  remark: z.string().trim().max(2000).optional().nullable(),
});

export const merchantLoyaltyOutreachBodySchema = z.object({
  contactId: cuidSchema,
  action: z.enum(["loyalty_informed", "responded", "not_responded"]),
  remark: z.string().trim().max(2000).optional().nullable(),
});

export const customerInsightFilterOptionsQuerySchema = z.object({
  type: z.enum(["brands", "items"]).default("brands"),
  brand: trimmedString(1, LIMITS.name.max).optional(),
  q: trimmedString(1, 100).optional(),
});
