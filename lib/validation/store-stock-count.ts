import { z } from "zod";

import { cuidSchema, trimmedString } from "@/lib/validation";

export const storeStockCountItemsBodySchema = z.object({
  instanceId: cuidSchema,
  erpCompany: trimmedString(1, 140),
});

export const storeStockCountCreateReportSchema = z.object({
  title: trimmedString(1, 140),
  companies: z
    .array(
      z.object({
        instanceId: cuidSchema,
        instanceLabel: trimmedString(0, 140),
        erpCompany: trimmedString(1, 140),
      }),
    )
    .min(1)
    .max(20),
  warehouses: z
    .array(
      z.object({
        key: trimmedString(1, 300),
        label: trimmedString(1, 300),
        warehouse: trimmedString(1, 300),
        instanceId: cuidSchema,
        instanceLabel: trimmedString(0, 140),
        erpCompany: trimmedString(1, 140),
      }),
    )
    .min(1)
    .max(100)
    .optional(),
});

export const storeStockCountUpdateItemSchema = z.object({
  manualCount: z.number().int().min(0).nullable(),
});

export const storeStockCountSaveCountsSchema = z.object({
  items: z
    .array(
      z.object({
        itemId: cuidSchema,
        manualCount: z.number().int().min(0).nullable(),
      }),
    )
    .max(2000),
});

export const storeStockCountScanSchema = z.object({
  barcode: trimmedString(1, 200).optional(),
  barcodes: z.array(trimmedString(1, 200)).min(1).max(50).optional(),
}).refine((value) => Boolean(value.barcode || value.barcodes?.length), { message: "Barcode is required" });
export type StoreStockCountItemsBody = z.infer<typeof storeStockCountItemsBodySchema>;
export type StoreStockCountCreateReportBody = z.infer<typeof storeStockCountCreateReportSchema>;
