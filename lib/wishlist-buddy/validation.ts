import { z } from "zod";

import { canonicalPhoneForErpCustomerId } from "@/lib/phone-lookup";
import { LIMITS } from "@/lib/validation";
import { STOCK_REQUEST_STATUSES } from "@/lib/wishlist-buddy/constants";

/** Numeric Shopify ID from either `123` or `gid://shopify/ProductVariant/123`. */
export function shopifyNumericId(raw: string | number | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const match = String(raw).trim().match(/(\d+)$/);
  return match ? match[1] : null;
}

/** Storefront "Notify me when available" form, posted through the Shopify app proxy. */
export const notifyRequestBodySchema = z.object({
  variantId: z
    .union([z.string(), z.number()])
    .transform((v) => shopifyNumericId(v))
    .refine((v): v is string => v !== null, "Invalid product variant"),
  name: z.string().trim().min(1, "Please enter your name").max(LIMITS.name.max),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(LIMITS.email.max)
    .pipe(z.email("Please enter a valid email address")),
  phone: z
    .string()
    .transform((v) => canonicalPhoneForErpCustomerId(v))
    .refine((v): v is string => v !== null, "Please enter a valid Sri Lankan phone number"),
  /** Honeypot: hidden on the form, so only bots fill it. */
  website: z.string().max(0).optional().or(z.literal("")),
});

export type NotifyRequestBody = z.infer<typeof notifyRequestBodySchema>;

export const stockRequestPatchBodySchema = z
  .object({
    status: z.enum(STOCK_REQUEST_STATUSES).optional(),
    remark: z.string().trim().max(2000).nullable().optional(),
    soldFromInstanceId: z.string().trim().max(64).nullable().optional(),
    soldFromWarehouse: z.string().trim().max(200).nullable().optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), "Nothing to update");

export type StockRequestPatchBody = z.infer<typeof stockRequestPatchBodySchema>;

/** `open` = New + Contacted (still waiting for a call or a restock email). */
export const STOCK_REQUEST_LIST_FILTERS = ["open", ...STOCK_REQUEST_STATUSES] as const;
export type StockRequestListFilter = (typeof STOCK_REQUEST_LIST_FILTERS)[number];

export const stockRequestListQuerySchema = z.object({
  status: z.enum(STOCK_REQUEST_LIST_FILTERS).optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
