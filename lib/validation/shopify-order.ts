import { z } from "zod";
import { LIMITS } from "@/lib/validation";

const shopifyAddressSchema = z
  .object({
    first_name: z.string().optional().nullable(),
    last_name: z.string().optional().nullable(),
    address1: z.string().optional().nullable(),
    address2: z.string().optional().nullable(),
    city: z.string().optional().nullable(),
    province: z.string().optional().nullable(),
    country: z.string().optional().nullable(),
    zip: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    name: z.string().optional().nullable(),
    country_code: z.string().optional().nullable(),
    province_code: z.string().optional().nullable(),
  })
  .passthrough()
  .optional()
  .nullable();

const shopifyCustomerSchema = z
  .object({
    id: z.coerce.number(),
    email: z.string().optional().nullable(),
    first_name: z.string().optional().nullable(),
    last_name: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    default_address: shopifyAddressSchema,
  })
  .passthrough()
  .optional()
  .nullable();

const shopifyDiscountCodeSchema = z
  .object({
    code: z.union([z.string(), z.number()]).optional().nullable(),
    amount: z.string().optional(),
    type: z.string().optional(),
  })
  .passthrough()
  .transform((row) => ({
    ...row,
    code: row.code != null ? String(row.code).slice(0, LIMITS.couponCode.max) : "",
  }));

const shopifyDiscountApplicationSchema = z.object({}).passthrough();

const shopifyShippingLineSchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  title: z.string().optional(),
  code: z.string().optional(),
  price: z.string().optional(),
  discounted_price: z.string().optional(),
}).passthrough();

const numericString = z.union([z.string(), z.number()]).transform((v) => String(v));

const shopifyLineItemSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    /** Shopify sends null for custom line items, some gift lines, etc. */
    variant_id: z.union([z.number(), z.string()]).nullable().optional(),
    product_id: z.union([z.number(), z.string()]).optional().nullable(),
    sku: z.string().optional().nullable(),
    title: z.string().optional().nullable(),
    vendor: z.string().max(LIMITS.vendorName.max).optional().nullable(),
    price: numericString,
    quantity: z.coerce.number().int().min(1),
  })
  .passthrough();

export const shopifyOrderWebhookSchema = z.object({
  id: z.number(),
  source_name: z.string().optional().nullable(),
  user_id: z.number().optional().nullable(),
  location_id: z.union([z.string(), z.number()]).optional().nullable(),
  created_at: z.string().optional().nullable(),

  order_number: z.number().optional().nullable(),
  name: z.string().optional().nullable(),
  subtotal_price: z.string().optional().nullable(),
  total_discounts: z.string().optional().nullable(),
  total_tax: z.string().optional().nullable(),
  total_price: numericString,
  current_subtotal_price: z.string().optional().nullable(),
  current_total_discounts: z.string().optional().nullable(),
  current_total_tax: z.string().optional().nullable(),
  current_total_price: z.string().optional().nullable(),
  currency: z.string().optional().nullable(),
  financial_status: z.string().optional().nullable(),
  fulfillment_status: z.string().optional().nullable(),
  payment_gateway_names: z.array(z.string()).optional().default([]),
  email: z.string().optional().nullable(),
  contact_email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),

  shipping_address: shopifyAddressSchema,
  billing_address: shopifyAddressSchema,
  discount_codes: z.array(shopifyDiscountCodeSchema).optional().default([]),
  discount_applications: z.array(shopifyDiscountApplicationSchema).optional().default([]),
  shipping_lines: z.array(shopifyShippingLineSchema).optional().default([]),

  customer: shopifyCustomerSchema,
  line_items: z.array(shopifyLineItemSchema).min(0),
});

export type ShopifyOrderWebhookPayload = z.infer<typeof shopifyOrderWebhookSchema>;
