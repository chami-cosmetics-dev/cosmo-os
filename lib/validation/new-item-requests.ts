import { z } from "zod";

import { LIMITS, trimmedString } from "@/lib/validation";
import { NEW_ITEM_REQUEST_STATUSES } from "@/lib/new-item-requests/types";

const optionalHttpUrl = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  })
  .refine(
    (value) =>
      !value ||
      ((value.startsWith("http://") || value.startsWith("https://")) &&
        URL.canParse(value) &&
        value.length <= LIMITS.logoUrl.max),
    "Enter a valid http or https link",
  );

const ymd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format")
  .optional();

export const newItemRequestSuggestQuerySchema = z.object({
  q: z.string().optional().default(""),
});

export const newItemRequestCreateFieldsSchema = z.object({
  brandName: trimmedString(1, LIMITS.vendorName.max),
  description: trimmedString(
    LIMITS.newItemRequestDescription.min,
    LIMITS.newItemRequestDescription.max,
  ),
  storeUrl: optionalHttpUrl,
});

export const newItemRequestListQuerySchema = z.object({
  status: z.enum(NEW_ITEM_REQUEST_STATUSES).optional().default("open"),
  brand: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : undefined;
    }),
  createdFrom: ymd,
  createdTo: ymd,
});

export const newItemRequestStatusBodySchema = z.object({
  status: z.enum(["already_have", "closed"]),
});

export function newItemRequestListQueryFromSearch(search: URLSearchParams) {
  return newItemRequestListQuerySchema.safeParse({
    status: search.get("status") ?? undefined,
    brand: search.get("brand") ?? undefined,
    createdFrom: search.get("createdFrom") ?? undefined,
    createdTo: search.get("createdTo") ?? undefined,
  });
}
