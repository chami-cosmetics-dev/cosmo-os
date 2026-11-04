import { z } from "zod";

import { LIMITS, trimmedString } from "@/lib/validation";

export const materialTransferShopLookupSchema = z.object({
  code: trimmedString(1, 80),
});

export const materialTransferLookupSchema = z.object({
  slot: z.enum(["erp1", "erp2"]),
  code: trimmedString(1, 80),
  sourceWarehouse: trimmedString(1, 200),
  targetWarehouse: trimmedString(0, 200).optional(),
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
  status: z.enum(["sent", "received", "requested", "confirming", "confirmed"]).optional(),
  scope: z.enum(["all", "shop"]),
  direction: z.enum(["store_to_shop", "shop_to_main"]).optional(),
  mismatch: z.literal("1").optional(),
});

export const materialTransferShopReturnSchema = z.object({
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

export const materialTransferConfirmSchema = z.object({
  lines: z
    .array(
      z.object({
        itemCode: trimmedString(1, LIMITS.sku.max),
        qty: z.number().int().min(0).max(100_000),
      }),
    )
    .min(1)
    .max(200),
});

export const shopItemRequestSuggestQuerySchema = z.object({
  q: z.string().optional(),
});

export const shopItemRequestLookupSchema = z.object({
  code: trimmedString(1, 80),
});

export const shopItemRequestCreateSchema = z.object({
  lines: z
    .array(
      z.object({
        itemCode: trimmedString(1, LIMITS.sku.max),
        neededQty: z.number().int().min(1).max(100_000),
      }),
    )
    .min(1)
    .max(100),
});

export const shopItemRequestListQuerySchema = z.object({
  status: z.enum(["pending", "done"]).optional(),
  scope: z.enum(["shop", "all"]).optional(),
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
