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
    /**
     * Add a new primary phone while keeping the previous primary as secondary
     * (purchase history + search still match both).
     */
    addPhoneNumber: z
      .string()
      .trim()
      .min(1)
      .max(LIMITS.mobile.max)
      .optional(),
    gender: z
      .union([z.enum(CONTACT_GENDER_OPTIONS), z.literal(""), z.null()])
      .optional()
      .transform((v) => (v === "" || v === undefined ? (v === undefined ? undefined : null) : v)),
    language: z
      .union([z.enum(CONTACT_LANGUAGE_OPTIONS), z.literal(""), z.null()])
      .optional()
      .transform((v) => (v === "" || v === undefined ? (v === undefined ? undefined : null) : v)),
    address: z
      .union([z.string().trim().max(LIMITS.address.max), z.null()])
      .optional()
      .transform((v) => (v === "" || v === undefined ? (v === undefined ? undefined : null) : v)),
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
  note: z.string().trim().max(500).optional().nullable(),
});

export const customerInsightFilterQuerySchema = z
  .object({
    pushGold: z
      .enum(["true", "1", "false", "0"])
      .optional()
      .transform((v) => v === "true" || v === "1"),
    pushPlatinum: z
      .enum(["true", "1", "false", "0"])
      .optional()
      .transform((v) => v === "true" || v === "1"),
    loyalty: z.enum(["standard", "gold", "platinum"]).optional(),
    brand: trimmedString(1, LIMITS.name.max).optional(),
    minTotal: z.coerce.number().min(0).optional(),
    maxTotal: z.coerce.number().min(0).optional(),
    birthdayThisMonth: z
      .enum(["true", "1", "false", "0"])
      .optional()
      .transform((v) => v === "true" || v === "1"),
    page: z.coerce
      .number()
      .int()
      .min(LIMITS.pagination.pageMin)
      .max(LIMITS.pagination.pageMax)
      .default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(25),
  })
  .superRefine((val, ctx) => {
    if (val.pushGold && val.pushPlatinum) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only one of pushGold or pushPlatinum may be set",
        path: ["pushGold"],
      });
    }
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
  });
