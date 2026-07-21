import { z } from "zod";
import { LIMITS } from "@/lib/validation";

const shopifyAddressSchema = z
  .object({
    first_name: z.string().optional().nullable(),
    last_name: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    name: z.string().optional().nullable(),
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

/**
 * Shopify REST checkout webhook payload (checkouts/create|update|delete).
 * Uses passthrough so Shopify can add fields without breaking ingest.
 */
export const shopifyCheckoutWebhookSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
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
  .transform((row) => ({
    ...row,
    id: String(row.id).slice(0, LIMITS.shopifyLocationId.max),
    email: row.email?.trim().slice(0, LIMITS.email.max) || null,
    phone: row.phone?.trim().slice(0, LIMITS.mobile.max) || null,
  }));

export type ShopifyCheckoutWebhookPayload = z.infer<typeof shopifyCheckoutWebhookSchema>;
