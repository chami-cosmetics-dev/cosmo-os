import { z } from "zod";

/**
 * Application-wide validation constants.
 * All user input must be validated server-side - never trust the client.
 */

export const LIMITS = {
  email: { max: 254 },
  name: { min: 1, max: 100 },
  password: { min: 8, max: 128 },
  token: { length: 64 },
  roleName: { min: 2, max: 64 },
  description: { max: 500 },
  companyName: { max: 200 },
  employeeSize: { max: 50 },
  address: { max: 500 },
  itemName: { max: 255 },
  permissionKey: { max: 64 },
  nicNo: { max: 15 },
  gender: { max: 20 },
  mobile: { max: 100 },
  knownName: { max: 100 },
  employeeNumber: { max: 50 },
  epfNumber: { max: 50 },
  locationName: { max: 200 },
  departmentName: { max: 100 },
  designationName: { max: 100 },
  resignationReason: { max: 500 },
  emailTemplateSubject: { max: 200 },
  emailTemplateBody: { max: 10000 },
  emailTemplateRecipients: { max: 2000 },
  smsPortalUsername: { max: 200 },
  smsPortalPassword: { max: 128 },
  smsPortalMask: { max: 64 },
  smsPortalCampaign: { max: 64 },
  smsPortalUrl: { max: 500 },
} as const;

/** CUID format - Prisma default ID format (c + 24 alphanumeric) */
const cuidRegex = /^c[a-z0-9]{24,30}$/;
export const cuidSchema = z.string().regex(cuidRegex, "Invalid ID format");

/** Invite token - 64 char hex */
export const inviteTokenSchema = z
  .string()
  .length(LIMITS.token.length, "Invalid token format")
  .regex(/^[a-f0-9]+$/, "Invalid token format");

export const emailSchema = z
  .string()
  .email("Invalid email")
  .max(LIMITS.email.max, "Email too long")
  .transform((s) => s.toLowerCase().trim());

export const passwordSchema = z
  .string()
  .min(LIMITS.password.min, "Password too short")
  .max(LIMITS.password.max, "Password too long");

export const trimmedString = (min: number, max: number) =>
  z
    .string()
    .transform((s) => s.trim())
    .refine((s) => s.length >= min, `Minimum ${min} character(s)`)
    .refine((s) => s.length <= max, `Maximum ${max} character(s)`);

export const RESERVED_ROLE_NAMES = ["super_admin", "admin"] as const;

export function isReservedRoleName(name: string): boolean {
  const normalized = name.toLowerCase().trim();
  return RESERVED_ROLE_NAMES.includes(normalized as (typeof RESERVED_ROLE_NAMES)[number]);
}

/** SMS portal config update - password optional (omit to keep current) */
export const smsPortalConfigUpdateSchema = z.object({
  username: trimmedString(1, LIMITS.smsPortalUsername.max),
  password: z
    .string()
    .max(LIMITS.smsPortalPassword.max)
    .transform((s) => s.trim())
    .optional(),
  authUrl: trimmedString(1, LIMITS.smsPortalUrl.max),
  smsUrl: trimmedString(1, LIMITS.smsPortalUrl.max),
  smsMask: trimmedString(1, LIMITS.smsPortalMask.max),
  campaignName: trimmedString(1, LIMITS.smsPortalCampaign.max),
});
