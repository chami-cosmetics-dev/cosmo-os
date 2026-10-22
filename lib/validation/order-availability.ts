import { z } from "zod";

import { MAX_LINE_QTY, MAX_RAW_LINES } from "@/lib/order-availability/types";
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
