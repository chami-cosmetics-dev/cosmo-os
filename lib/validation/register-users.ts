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

export const registerPortalSaveBodySchema = z.object({
  name: trimmedString(1, LIMITS.name.max),
  email: emailSchema,
  phoneNumber: trimmedString(4, LIMITS.mobile.max),
});

export const registerUsersLookupQuerySchema = z.object({
  phone: trimmedString(4, LIMITS.mobile.max),
});

export const registerUsersPageDataQuerySchema = z.object({
  day: isoDate.optional(),
});
