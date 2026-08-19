import { z } from "zod";

import { LIMITS, trimmedString } from "@/lib/validation";

/** Body for PATCH /api/admin/orders/[id]/replaced-by */
export const replacedByOrderBodySchema = z.object({
  replacedByOrderNumber: z.union([
    trimmedString(1, LIMITS.sku.max),
    z.null(),
  ]),
});

export type ReplacedByOrderBody = z.infer<typeof replacedByOrderBodySchema>;
