import { z } from "zod";

import { LIMITS, emailSchema, trimmedString } from "@/lib/validation";

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

const optionalStaffEmail = z
  .union([emailSchema, z.literal(""), z.undefined()])
  .optional()
  .transform((v) => (v ? v : undefined));

function refineBadgeRange(
  val: { badgeStart: string; badgeEnd: string },
  ctx: z.RefinementCtx,
) {
  if (val.badgeEnd < val.badgeStart) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "badgeEnd must be on or after badgeStart",
      path: ["badgeEnd"],
    });
  }
}

const birthdayFields = {
  birthYear: z.number().int().min(1900).max(2100).optional(),
  birthMonth: z.number().int().min(1).max(12).optional(),
  birthDay: z.number().int().min(1).max(31).optional(),
};

function refineBirthdayParts(
  val: {
    birthYear?: number;
    birthMonth?: number;
    birthDay?: number;
  },
  ctx: z.RefinementCtx,
) {
  const any =
    val.birthYear != null || val.birthMonth != null || val.birthDay != null;
  const all =
    val.birthYear != null && val.birthMonth != null && val.birthDay != null;
  if (any && !all) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "birthYear, birthMonth, and birthDay must all be set",
      path: ["birthYear"],
    });
  }
}

export const registerUsersSaveBodySchema = z
  .object({
    name: trimmedString(1, LIMITS.name.max),
    phoneNumber: trimmedString(4, LIMITS.mobile.max),
    email: optionalStaffEmail,
    ...birthdayFields,
    location: trimmedString(1, LIMITS.locationName.max),
    badgeStart: isoDate,
    badgeEnd: isoDate,
  })
  .superRefine(refineBadgeRange)
  .superRefine(refineBirthdayParts);

export const registerUsersQrBodySchema = z
  .object({
    location: trimmedString(1, LIMITS.locationName.max),
    badgeStart: isoDate,
    badgeEnd: isoDate,
  })
  .superRefine(refineBadgeRange);

export const registerPortalEmailSchema = emailSchema.refine(
  (value) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(value),
  "Enter a valid email (e.g. name@gmail.com)",
);

export const registerPortalPhoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\D/g, ""))
  .refine((value) => /^\d{10}$/.test(value), "Phone must be 10 digits");

export const registerPortalSaveBodySchema = z
  .object({
    name: trimmedString(1, LIMITS.name.max),
    email: registerPortalEmailSchema,
    phoneNumber: registerPortalPhoneSchema,
    birthYear: z.coerce.number().int().min(1940).max(2100),
    birthMonth: z.coerce.number().int().min(1).max(12),
    birthDay: z.coerce.number().int().min(1).max(31),
  })
  .superRefine((val, ctx) => {
    const daysInMonth = new Date(val.birthYear, val.birthMonth, 0).getDate();
    if (val.birthDay > daysInMonth) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid day for that month",
        path: ["birthDay"],
      });
    }
  });

export const registerUsersLookupQuerySchema = z.object({
  phone: trimmedString(4, LIMITS.mobile.max),
});

export const registerUsersPageDataQuerySchema = z.object({
  day: isoDate.optional(),
});

export const registerUsersEmailTemplateBodySchema = z.object({
  header: z.string().trim().max(200),
  body: z.string().trim().max(5000),
  photoUrl: z.union([z.string().trim().url().max(2000), z.literal(""), z.null()]).optional(),
});

export const registerUsersHeaderBodySchema = z
  .object({
    location: trimmedString(1, LIMITS.locationName.max),
    badgeStart: isoDate,
    badgeEnd: isoDate,
  })
  .superRefine(refineBadgeRange);
