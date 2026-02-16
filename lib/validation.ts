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
  locationShortName: { max: 50 },
  invoiceHeader: { max: 500 },
  invoiceSubHeader: { max: 500 },
  invoiceFooter: { max: 500 },
  shopifyLocationId: { max: 100 },
  shopifyShopName: { max: 200 },
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
  productTitle: { max: 500 },
  sku: { max: 100 },
  vendorName: { max: 200 },
  categoryName: { max: 500 },
  categoryFullName: { max: 1000 },
  shopifyWebhookSecret: { min: 32, max: 128 },
  shopifyWebhookSecretName: { max: 100 },
  pagination: { pageMin: 1, pageMax: 10000, limitMin: 1, limitMax: 100 },
} as const;

/** Parse and validate page number from query string */
export const pageSchema = z
  .string()
  .optional()
  .transform((s) => (s ? parseInt(s, 10) : 1))
  .pipe(
    z
      .number()
      .int()
      .min(LIMITS.pagination.pageMin)
      .max(LIMITS.pagination.pageMax)
  );

/** Parse and validate sort order - asc or desc */
export const sortOrderSchema = z
  .enum(["asc", "desc"])
  .optional()
  .transform((s) => s ?? "asc");

/** Parse and validate limit (page size) from query string */
export const limitSchema = z
  .string()
  .optional()
  .transform((s) => (s ? parseInt(s, 10) : 10))
  .pipe(
    z
      .number()
      .int()
      .min(LIMITS.pagination.limitMin)
      .max(LIMITS.pagination.limitMax)
  );

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

/** Password change - current password + new password with confirmation */
export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "New password must be different from current password",
    path: ["newPassword"],
  });

/** Profile update - only user-editable fields from invite form */
export const profileUpdateSchema = z.object({
  name: trimmedString(1, LIMITS.name.max),
  knownName: z.string().max(LIMITS.knownName.max).optional(),
  nicNo: z.string().max(LIMITS.nicNo.max).optional(),
  gender: z.string().max(LIMITS.gender.max).optional(),
  dateOfBirth: z.string().optional(),
  mobile: z.string().max(LIMITS.mobile.max).optional(),
});

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
