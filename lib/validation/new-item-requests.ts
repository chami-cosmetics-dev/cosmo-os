import { z } from "zod";

import { NEW_ITEM_REQUEST_STATUSES } from "@/lib/new-item-requests/types";
import { canonicalPhoneForErpCustomerId } from "@/lib/phone-lookup";
import { LIMITS, trimmedString } from "@/lib/validation";

const requiredHttpUrl = z
  .string()
  .transform((value) => value.trim())
  .refine(
    (value) =>
      value.length > 0 &&
      (value.startsWith("http://") || value.startsWith("https://")) &&
      URL.canParse(value) &&
      value.length <= LIMITS.logoUrl.max,
    "Enter a valid http or https link",
  );

const optionalName = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  })
  .refine((value) => !value || value.length <= LIMITS.name.max, "Name is too long");

const optionalPhone = z
  .string()
  .optional()
  .transform((value) => value?.trim() ?? "")
  .refine((value) => !value || canonicalPhoneForErpCustomerId(value) !== null, "Enter a valid Sri Lankan phone number")
  .transform((value) => (value ? canonicalPhoneForErpCustomerId(value)! : undefined));

const optionalDescription = z
  .string()
  .optional()
  .transform((value) => value?.trim() ?? "")
  .refine(
    (value) => value.length <= LIMITS.newItemRequestDescription.max,
    "Description is too long",
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
  productName: trimmedString(
    LIMITS.newItemRequestProductName.min,
    LIMITS.newItemRequestProductName.max,
  ),
  description: optionalDescription,
  storeUrl: requiredHttpUrl,
  customerName: optionalName,
  customerPhone: optionalPhone,
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
  status: z.enum(["already_have", "ordered", "closed"]),
});

export const newItemRequestVoteBodySchema = z.object({
  customerName: trimmedString(1, LIMITS.name.max),
  customerPhone: z
    .string()
    .transform((value) => canonicalPhoneForErpCustomerId(value))
    .refine((value): value is string => value !== null, "Enter a valid Sri Lankan phone number"),
  customerEmail: z
    .string()
    .trim()
    .toLowerCase()
    .max(LIMITS.email.max)
    .optional()
    .transform((value) => (value ? value : undefined))
    .pipe(z.email("Enter a valid email address").optional()),
});

export type NewItemRequestVoteBody = z.infer<typeof newItemRequestVoteBodySchema>;

export function newItemRequestListQueryFromSearch(search: URLSearchParams) {
  return newItemRequestListQuerySchema.safeParse({
    status: search.get("status") ?? undefined,
    brand: search.get("brand") ?? undefined,
    createdFrom: search.get("createdFrom") ?? undefined,
    createdTo: search.get("createdTo") ?? undefined,
  });
}
