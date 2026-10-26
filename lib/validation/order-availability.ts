import { z } from "zod";

import {
  MAX_LINE_QTY,
  MAX_RAW_LINES,
  PRIORITY_WAREHOUSE_SLOTS,
} from "@/lib/order-availability/types";
import { LIMITS, trimmedString } from "@/lib/validation";

export const orderAvailabilityRequestSchema = z.object({
  lines: z
    .array(
      z.object({
        sku: trimmedString(1, LIMITS.sku.max),
        qty: z.number().int().min(1).max(MAX_LINE_QTY).optional(),
      }),
    )
    .min(1)
    .max(MAX_RAW_LINES),
});

const warehouseField = trimmedString(1, LIMITS.erpWarehouseName.max).nullable();

export const orderAvailabilityPriorityWarehousesSchema = z
  .object({
    slots: z
      .array(
        z.object({
          priority: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
          warehouse: warehouseField,
        }),
      )
      .length(PRIORITY_WAREHOUSE_SLOTS.length),
  })
  .superRefine((value, ctx) => {
    const seenPriority = new Set<number>();
    const seenWarehouse = new Set<string>();
    for (const slot of value.slots) {
      if (seenPriority.has(slot.priority)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Each priority 1–4 can only be used once",
          path: ["slots"],
        });
        return;
      }
      seenPriority.add(slot.priority);
      if (!slot.warehouse) continue;
      const key = slot.warehouse.toLowerCase();
      if (seenWarehouse.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Each warehouse can only have one priority",
          path: ["slots"],
        });
        return;
      }
      seenWarehouse.add(key);
    }
    for (const priority of PRIORITY_WAREHOUSE_SLOTS) {
      if (!seenPriority.has(priority)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Send all four priority slots",
          path: ["slots"],
        });
        return;
      }
    }
  });
