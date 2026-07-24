import { z } from "zod";

import { cuidSchema, LIMITS, trimmedString } from "@/lib/validation";

const columnKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9_]+$/, "column key must be lowercase slug [a-z0-9_]+");

export const osfColumnUpsertSchema = z.object({
  columns: z
    .array(
      z.object({
        key: columnKeySchema,
        label: trimmedString(1, LIMITS.locationShortName.max),
        companyLocationId: cuidSchema.nullable().optional(),
        erpnextInstanceId: cuidSchema.nullable().optional(),
        directWarehouses: z.array(trimmedString(1, 200)).max(50).optional(),
        includeInStock: z.boolean().optional().default(true),
        includeInRop: z.boolean().optional().default(true),
        sortOrder: z.number().int().min(0).max(10_000).optional().default(0),
        active: z.boolean().optional().default(true),
      }),
    )
    .max(100),
});

export const osfBuyerUpsertSchema = z.object({
  buyers: z
    .array(
      z.object({
        name: trimmedString(1, 100),
        brands: z.array(trimmedString(1, 200)).max(500).optional().default([]),
        sortOrder: z.number().int().min(0).max(10_000).optional().default(0),
        active: z.boolean().optional().default(true),
      }),
    )
    .max(100),
});

export const osfProfilePatchSchema = z.object({
  shopAvailability: z.enum(["allowed", "not_allowed"]).nullable().optional(),
  ogfPrice: z
    .union([z.number().finite().min(0).max(1_000_000), z.null()])
    .optional(),
  reorderThresholdPercent: z
    .union([z.number().int().min(1).max(100), z.null()])
    .optional(),
  rops: z
    .record(
      columnKeySchema,
      z.union([z.number().int().min(0).max(1_000_000), z.null()]),
    )
    .optional(),
});

export const osfGenerateBodySchema = z.object({
  salesMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "salesMonth must be YYYY-MM"),
  asOfDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "asOfDate must be YYYY-MM-DD")
    .optional(),
  includeInactive: z.boolean().optional().default(false),
  belowThresholdOnly: z.boolean().optional().default(false),
  vendorIds: z.array(cuidSchema).max(100).optional(),
  itemStatusCategories: z.array(trimmedString(1, 80)).max(50).optional(),
  skuPrefix: trimmedString(1, LIMITS.sku.max).optional(),
});

export type OsfColumnUpsertInput = z.infer<typeof osfColumnUpsertSchema>;
export type OsfBuyerUpsertInput = z.infer<typeof osfBuyerUpsertSchema>;
export type OsfProfilePatchInput = z.infer<typeof osfProfilePatchSchema>;
export type OsfGenerateBodyInput = z.infer<typeof osfGenerateBodySchema>;

const osfColumnAccessKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(120);

export const osfColumnAccessAssignmentSchema = z.object({
  userId: cuidSchema,
  columnKeys: z.array(osfColumnAccessKeySchema).max(500),
});

export const osfColumnAccessPutSchema = z.union([
  osfColumnAccessAssignmentSchema,
  z.object({
    assignments: z.array(osfColumnAccessAssignmentSchema).min(1).max(200),
  }),
]);

export type OsfColumnAccessPutInput = z.infer<typeof osfColumnAccessPutSchema>;

/** Exact SKU query for purchasing supplier-compare / sku detail endpoints. */
export const purchasingSkuQuerySchema = z.object({
  sku: trimmedString(1, LIMITS.sku.max),
});

const osfAsOfDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "asOfDate must be YYYY-MM-DD");

export const osfAssistPageDataQuerySchema = z.object({
  asOfDate: osfAsOfDateSchema.optional(),
  priority: trimmedString(0, 80).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  q: trimmedString(0, LIMITS.sku.max).optional(),
});

export const osfAssistRopsPutSchema = z.object({
  items: z
    .array(
      z.object({
        sku: trimmedString(1, LIMITS.sku.max),
        ropQty: z.number().int().min(0).max(1_000_000),
      }),
    )
    .min(1)
    .max(200),
});

export type OsfAssistPageDataQuery = z.infer<typeof osfAssistPageDataQuerySchema>;
export type OsfAssistRopsPutInput = z.infer<typeof osfAssistRopsPutSchema>;
