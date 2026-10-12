import { z } from "zod";

import { LIMITS, trimmedString } from "@/lib/validation";

export const vatStatusLookupQuerySchema = z.object({
  sku: trimmedString(1, LIMITS.sku.max),
});

export const vatStatusSuggestQuerySchema = z.object({
  q: trimmedString(1, LIMITS.sku.max),
});
