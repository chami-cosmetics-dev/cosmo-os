import { z } from "zod";
import { LIMITS } from "@/lib/validation";

const shopifyVariantSchema = z.object({
  id: z.number(),
  title: z.string().optional().nullable(),
  sku: z.string().optional().nullable(),
  price: z.string(),
  compare_at_price: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  inventory_quantity: z.number().optional().nullable(),
  image_id: z.number().optional().nullable(),
});

const shopifyImageSchema = z.object({
  id: z.number(),
  src: z.string(),
  variant_ids: z.array(z.number()).optional(),
});

const shopifyCategorySchema = z
  .object({
    name: z.string().optional(),
    full_name: z.string().optional(),
  })
  .optional()
  .nullable();

export const shopifyProductWebhookSchema = z.object({
  id: z.number(),
  title: z.string().max(LIMITS.productTitle.max),
  handle: z.string().optional().nullable(),
  vendor: z.string().max(LIMITS.vendorName.max).optional().nullable(),
  product_type: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  tags: z.string().optional().nullable(),
  image: shopifyImageSchema.optional().nullable(),
  images: z.array(shopifyImageSchema).optional(),
  variants: z.array(shopifyVariantSchema).min(1),
  category: shopifyCategorySchema,
});

export type ShopifyProductWebhookPayload = z.infer<typeof shopifyProductWebhookSchema>;
