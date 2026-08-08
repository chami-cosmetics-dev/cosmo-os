import { z } from "zod";

import { LIMITS, trimmedString } from "@/lib/validation";

export const storeAllocationLookupQuerySchema = z.object({
  q: trimmedString(1, Math.max(LIMITS.sku.max, 64)),
});

export const storeAllocationPlanQuerySchema = z.object({
  sku: trimmedString(1, LIMITS.sku.max),
  takeQty: z.coerce.number().int().min(0).max(1_000_000),
});

export const storeAllocationExportBodySchema = z.object({
  sku: trimmedString(1, LIMITS.sku.max),
  description: trimmedString(0, LIMITS.productTitle.max),
  barcode: z.union([trimmedString(0, 64), z.null()]).optional(),
  companyReorderQty: z.number().finite().min(0).max(1_000_000),
  takeQty: z.number().int().min(0).max(1_000_000),
  locations: z
    .array(
      z.object({
        columnKey: trimmedString(1, 64),
        label: trimmedString(1, LIMITS.locationShortName.max),
        qty: z.number().int().min(0).max(1_000_000),
      }),
    )
    .min(1)
    .max(200),
});

export type StoreAllocationLookupQuery = z.infer<typeof storeAllocationLookupQuerySchema>;
export type StoreAllocationPlanQuery = z.infer<typeof storeAllocationPlanQuerySchema>;
export type StoreAllocationExportBody = z.infer<typeof storeAllocationExportBodySchema>;
