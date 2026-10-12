import { z } from "zod";

import { LIMITS, trimmedString } from "@/lib/validation";

export const materialTransferLookupSchema = z.object({
  slot: z.enum(["erp1", "erp2"]),
  code: trimmedString(1, 80),
  sourceWarehouse: trimmedString(1, 200),
  company: trimmedString(0, 200).optional(),
});

export const materialTransferSubmitSchema = z.object({
  slot: z.enum(["erp1", "erp2"]),
  company: trimmedString(0, 200).optional(),
  sourceWarehouse: trimmedString(1, 200),
  targetWarehouse: trimmedString(1, 200),
  lines: z
    .array(
      z.object({
        itemCode: trimmedString(1, LIMITS.sku.max),
        itemName: trimmedString(0, LIMITS.itemName.max).optional(),
        barcode: trimmedString(0, 80).optional(),
        qty: z.number().int().min(1).max(100_000),
        uom: trimmedString(0, 40).optional(),
      }),
    )
    .min(1)
    .max(200),
});

export const materialTransferHistoryQuerySchema = z.object({
  status: z.enum(["sent", "received"]).optional(),
  scope: z.enum(["all", "shop"]),
});

export const materialTransferCountSchema = z
  .object({
    code: trimmedString(0, 80).optional(),
    itemCode: trimmedString(0, LIMITS.sku.max).optional(),
    qty: z.number().int().min(0).max(100_000).optional(),
  })
  .refine((value) => Boolean(value.code?.trim()) || (Boolean(value.itemCode) && value.qty != null), {
    message: "Scan a barcode or enter a qty",
  });
