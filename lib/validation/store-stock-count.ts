import { z } from "zod";

import { cuidSchema, trimmedString } from "@/lib/validation";

export const storeStockCountItemsBodySchema = z.object({
  instanceId: cuidSchema,
  erpCompany: trimmedString(1, 140),
});

export type StoreStockCountItemsBody = z.infer<typeof storeStockCountItemsBodySchema>;
