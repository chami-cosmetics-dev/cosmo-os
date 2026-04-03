import { z } from "zod";

import { cuidSchema, emailSchema, LIMITS, trimmedString } from "@/lib/validation";

const addressField = z.string().max(LIMITS.address.max).optional();

/** Optional shipping/billing address payload for manual orders */
export const manualOrderAddressSchema = z
  .object({
    name: z.string().max(LIMITS.name.max).optional(),
    address1: addressField,
    address2: addressField,
    city: z.string().max(120).optional(),
    province: z.string().max(120).optional(),
    zip: z.string().max(40).optional(),
    country: z.string().max(120).optional(),
  })
  .optional();

export const manualInvoicePrefixSchema = z
  .string()
  .trim()
  .regex(/^\d+$/, "Prefix must contain digits only")
  .min(LIMITS.manualInvoicePrefix.min)
  .max(LIMITS.manualInvoicePrefix.max);

export const manualInvoiceSeqPaddingSchema = z.coerce
  .number()
  .int()
  .min(LIMITS.manualInvoiceSeqPadding.min)
  .max(LIMITS.manualInvoiceSeqPadding.max);

const discountPercentField = z.coerce
  .number()
  .min(0, "Minimum 0%")
  .max(100, "Maximum 100%");

export const createManualOrderLineSchema = z.object({
  productItemId: cuidSchema,
  quantity: z.coerce.number().int().min(1).max(99999),
  discountPercent: discountPercentField.optional(),
});

export const createManualOrderBodySchema = z.object({
  companyLocationId: cuidSchema,
  lines: z.array(createManualOrderLineSchema).min(1).max(200),
  orderDiscountPercent: discountPercentField.optional(),
  shippingChargeOptionId: cuidSchema.optional(),
  assignedMerchantId: cuidSchema.optional().nullable(),
  customerName: trimmedString(1, LIMITS.name.max).optional(),
  customerEmail: z
    .union([emailSchema, z.literal("")])
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : v)),
  customerPhone: z.string().max(LIMITS.mobile.max).optional(),
  shippingAddress: manualOrderAddressSchema,
  billingAddress: manualOrderAddressSchema,
});

export type CreateManualOrderBody = z.infer<typeof createManualOrderBodySchema>;

export const shippingChargeCreateSchema = z.object({
  label: trimmedString(1, LIMITS.shippingChargeLabel.max),
  amount: z.coerce.number().min(0).max(99999999.99),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
});

export const shippingChargeUpdateSchema = shippingChargeCreateSchema.partial();
