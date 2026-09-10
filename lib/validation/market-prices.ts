import { z } from "zod";

export const marketPriceLayerSchema = z.enum(["mrp", "promo", "ogf"]);

export const marketPriceSortSchema = z.enum(["gap_desc", "gap_asc", "sku", "title"]);

export const marketPricePageDataQuerySchema = z.object({
  layer: marketPriceLayerSchema.optional().default("ogf"),
  sort: marketPriceSortSchema.optional().default("gap_desc"),
  filter: z.string().max(100).optional(),
  competitor: z.string().max(80).optional(),
  brand: z.string().max(120).optional(),
  priority: z.string().max(64).optional(),
  q: z.string().max(100).optional(),
  fastMover: z
    .enum(["0", "1", "true", "false"])
    .optional()
    .transform((v) => v === "1" || v === "true"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const marketPriceLinksQuerySchema = z.object({
  sku: z.string().trim().min(1, "SKU is required").max(80),
  competitor: z.string().trim().max(80).optional(),
});

export const marketPriceLinkCreateSchema = z.object({
  sku: z.string().trim().min(1, "SKU is required").max(80),
  competitorSlug: z.string().trim().min(1, "Competitor is required").max(80),
  productUrl: z.string().trim().url("Valid product URL is required").max(1000),
  competitorTitle: z.string().trim().min(1, "Competitor title is required").max(255),
  listedPriceLkr: z.coerce.number().positive("Price must be greater than zero"),
  inStock: z.boolean().optional().default(true),
  checkDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  notes: z.string().trim().max(500).nullish(),
  packSizeNormalized: z.string().trim().max(50).nullish(),
  sizeMismatchConfirmed: z.boolean().optional().default(false),
});

export const marketPriceLinkUpdateSchema = z.object({
  productUrl: z.string().trim().url("Valid product URL is required").max(1000).optional(),
  competitorTitle: z.string().trim().min(1, "Competitor title is required").max(255).optional(),
  listedPriceLkr: z.coerce.number().positive("Price must be greater than zero").optional(),
  inStock: z.boolean().optional(),
  checkDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .optional(),
  notes: z.string().trim().max(500).nullish(),
  packSizeNormalized: z.string().trim().max(50).nullish(),
  sizeMismatchConfirmed: z.boolean().optional(),
});

export const marketPriceImportBodySchema = z.object({
  csv: z.string().optional(),
  commitToken: z.string().trim().optional(),
});
