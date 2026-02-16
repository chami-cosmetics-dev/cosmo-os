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
    id: z.number(),
    email: z.string().optional().nullable(),
    first_name: z.string().optional().nullable(),
    last_name: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    default_address: shopifyAddressSchema,
  })
  .passthrough()
  .optional()
  .nullable();

const shopifyDiscountCodeSchema = z.object({
  code: z.string().transform((s) => s.slice(0, LIMITS.couponCode.max)),
  amount: z.string().optional(),
  type: z.string().optional(),
});

const shopifyDiscountApplicationSchema = z.object({}).passthrough();

const shopifyShippingLineSchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  title: z.string().optional(),
  code: z.string().optional(),
  price: z.string().optional(),
  discounted_price: z.string().optional(),
}).passthrough();

const shopifyLineItemSchema = z.object({
  id: z.union([z.number(), z.string()]),
  variant_id: z.number(),
  product_id: z.union([z.number(), z.string()]).optional().nullable(),
  sku: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  vendor: z.string().max(LIMITS.vendorName.max).optional().nullable(),
  price: z.string(),
  quantity: z.number().int().min(1),
});

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
  total_price: z.string(),
  current_subtotal_price: z.string().optional().nullable(),
  current_total_discounts: z.string().optional().nullable(),
  current_total_tax: z.string().optional().nullable(),
  current_total_price: z.string().optional().nullable(),
  currency: z.string().optional().nullable(),
  financial_status: z.string().optional().nullable(),
  fulfillment_status: z.string().optional().nullable(),
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
