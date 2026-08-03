import { z } from "zod";
import { LIMITS } from "@/lib/validation";

const shopifyAddressSchema = z
  .object({
    first_name: z.string().optional().nullable(),
    last_name: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    name: z.string().optional().nullable(),
    company: z.string().optional().nullable(),
    address1: z.string().optional().nullable(),
    address2: z.string().optional().nullable(),
    city: z.string().optional().nullable(),
    province: z.string().optional().nullable(),
    province_code: z.string().optional().nullable(),
    zip: z.string().optional().nullable(),
    country: z.string().optional().nullable(),
    country_code: z.string().optional().nullable(),
  })
  .passthrough()
  .optional()
  .nullable();

const shopifyCustomerSchema = z
  .object({
    id: z.coerce.number().optional(),
    email: z.string().optional().nullable(),
    first_name: z.string().optional().nullable(),
    last_name: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
  })
  .passthrough()
  .optional()
  .nullable();

const numericString = z.union([z.string(), z.number()]).transform((v) => String(v));

const shopifyCheckoutLineItemSchema = z
  .object({
    title: z.string().optional().nullable(),
    quantity: z.coerce.number().optional().nullable(),
    price: numericString.optional().nullable(),
  })
  .passthrough();

function normalizeCheckoutKey(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  const key = String(value).trim();
  if (!key) return null;
  return key.slice(0, LIMITS.shopifyLocationId.max);
}

/**
 * Shopify REST checkout webhook payload (checkouts/create|update|delete).
 * Uses passthrough so Shopify can add fields without breaking ingest.
 *
 * As of API 2026-04, Shopify removed `id` from checkout webhooks — use `token`.
 * Older payloads may still send `id` (and sometimes both).
 */
export const shopifyCheckoutWebhookSchema = z
  .object({
    id: z.union([z.number(), z.string()]).optional().nullable(),
    token: z.string().optional().nullable(),
    cart_token: z.string().optional().nullable(),
    email: z.string().optional().nullable(),
    created_at: z.string().optional().nullable(),
    updated_at: z.string().optional().nullable(),
    completed_at: z.string().optional().nullable(),
    abandoned_checkout_url: z.string().optional().nullable(),
    total_price: numericString.optional().nullable(),
    currency: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    customer: shopifyCustomerSchema,
    billing_address: shopifyAddressSchema,
    shipping_address: shopifyAddressSchema,
    line_items: z.array(shopifyCheckoutLineItemSchema).optional().default([]),
  })
  .passthrough()
  .superRefine((row, ctx) => {
    const id = normalizeCheckoutKey(row.id);
    const token = normalizeCheckoutKey(row.token);
    if (!id && !token) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Either id or token is required",
        path: ["id"],
      });
    }
  })
  .transform((row) => {
    const id = normalizeCheckoutKey(row.id);
    const token = normalizeCheckoutKey(row.token);
    // Prefer token (Shopify 2026-04+); fall back to numeric id for older payloads.
    const checkoutKey = (token ?? id)!;

    return {
      ...row,
      id: checkoutKey,
      token,
      email: row.email?.trim().slice(0, LIMITS.email.max) || null,
      phone: row.phone?.trim().slice(0, LIMITS.mobile.max) || null,
    };
  });

export type ShopifyCheckoutWebhookPayload = z.infer<typeof shopifyCheckoutWebhookSchema>;
