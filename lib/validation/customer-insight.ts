import { z } from "zod";

import {
  CONTACT_GENDER_OPTIONS,
  CONTACT_LANGUAGE_OPTIONS,
} from "@/lib/customer-insight/contact-profile-options";
import { CALL_CENTER_CATEGORY_VALUES } from "@/lib/contact-call-center-categories";
import { INSIGHT_FILTER_LIST_MAX } from "@/lib/customer-insight/filter-query-params";
import { PRODUCT_ITEM_STATUS_CATEGORIES } from "@/lib/product-item-status";
import {
  cuidSchema,
  emailSchema,
  LIMITS,
  trimmedString,
} from "@/lib/validation";
import { phoneDigitsOnly } from "@/lib/phone-lookup";

/** Phone search: trimmed, phone-like, ≥7 digits after normalize. */
export const customerInsightSearchQuerySchema = z
  .object({
    phone: trimmedString(1, LIMITS.mobile.max),
  })
  .superRefine((val, ctx) => {
    const digits = phoneDigitsOnly(val.phone);
    if (digits.length < 7) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Phone number must have at least 7 digits",
        path: ["phone"],
      });
    }
  });

export const customerInsightContactParamsSchema = z.object({
  contactId: cuidSchema,
});

const insightFilterListSchema = (maxLen: number) =>
  z
    .array(trimmedString(1, maxLen))
    .max(INSIGHT_FILTER_LIST_MAX)
    .optional();

export const customerInsightInvoicesQuerySchema = z.object({
  invoicesPage: z.coerce
    .number()
    .int()
    .min(LIMITS.pagination.pageMin)
    .max(LIMITS.pagination.pageMax)
    .default(1),
  invoicesPageSize: z.coerce.number().int().min(1).max(50).default(25),
  brand: insightFilterListSchema(200),
  item: insightFilterListSchema(500),
});

export const customerInsightProfilePatchSchema = z
  .object({
    name: trimmedString(1, LIMITS.name.max).optional(),
    email: z
      .union([emailSchema, z.literal(""), z.null()])
      .optional()
      .transform((v) => (v === "" ? null : v)),
    addPhoneNumber: z
      .string()
      .trim()
      .min(1)
      .max(LIMITS.mobile.max)
      .optional(),
    gender: z
      .union([z.enum(CONTACT_GENDER_OPTIONS), z.literal(""), z.null()])
      .optional()
      .transform((v) =>
        v === "" || v === undefined ? (v === undefined ? undefined : null) : v
      ),
    language: z
      .union([z.enum(CONTACT_LANGUAGE_OPTIONS), z.literal(""), z.null()])
      .optional()
      .transform((v) =>
        v === "" || v === undefined ? (v === undefined ? undefined : null) : v
      ),
    address: z
      .union([z.string().trim().max(LIMITS.address.max), z.null()])
      .optional()
      .transform((v) =>
        v === "" || v === undefined ? (v === undefined ? undefined : null) : v
      ),
    city: z
      .union([z.string().trim().max(LIMITS.city.max), z.null()])
      .optional()
      .transform((v) =>
        v === "" || v === undefined ? (v === undefined ? undefined : null) : v
      ),
    birthYear: z.coerce.number().int().min(1900).max(2100).optional().nullable(),
    birthMonth: z.coerce.number().int().min(1).max(12).optional().nullable(),
    birthDay: z.coerce.number().int().min(1).max(31).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.addPhoneNumber) {
      const digits = phoneDigitsOnly(data.addPhoneNumber);
      if (digits.length < 7) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Phone number must have at least 7 digits",
          path: ["addPhoneNumber"],
        });
      }
    }
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.email !== undefined ||
      data.addPhoneNumber !== undefined ||
      data.gender !== undefined ||
      data.language !== undefined ||
      data.address !== undefined ||
      data.city !== undefined ||
      data.birthYear !== undefined ||
      data.birthMonth !== undefined ||
      data.birthDay !== undefined,
    { message: "At least one profile field is required" }
  );

export const customerInsightContactedBodySchema = z.object({
  category: z.enum([
    "N/A",
    "Interested",
    "Not Interested",
    "Not Responding",
    "Wrong Number",
    "Black List",
    "Busy",
    "Interested-SMS",
  ]),
  note: z.string().trim().max(500).optional().nullable(),
  remark: z.string().trim().max(2000).optional().nullable(),
  outcome: z
    .enum(["general", "loyalty_informed", "responded", "not_responded"])
    .optional()
    .default("general"),
});

/** MM-DD calendar day (ignore year). */
const monthDaySchema = z
  .string()
  .trim()
  .regex(/^\d{1,2}-\d{1,2}$/, "Expected MM-DD")
  .transform((v) => {
    const [mRaw, dRaw] = v.split("-");
    const month = Number(mRaw);
    const day = Number(dRaw);
    return { month, day };
  })
  .refine(
    (v) => v.month >= 1 && v.month <= 12 && v.day >= 1 && v.day <= 31,
    "Invalid month-day"
  );

const optionalIsoDate = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
    .optional()
);

const customerInsightFilterFieldsSchema = z.object({
  brand: insightFilterListSchema(LIMITS.name.max),
  item: insightFilterListSchema(500),
  itemStatusCategory: z
    .array(z.enum(PRODUCT_ITEM_STATUS_CATEGORIES))
    .max(INSIGHT_FILTER_LIST_MAX)
    .optional(),
  city: trimmedString(1, 100).optional(),
  assignedMerchant: trimmedString(1, LIMITS.knownName.max).optional(),
  purchaseLocationId: cuidSchema.optional(),
  minTotal: z.coerce.number().min(0).optional(),
  maxTotal: z.coerce.number().min(0).optional(),
  birthdayFrom: monthDaySchema.optional(),
  birthdayTo: monthDaySchema.optional(),
  lastContactedFrom: optionalIsoDate,
  lastContactedTo: optionalIsoDate,
  loyaltyRegisteredFrom: optionalIsoDate,
  loyaltyRegisteredTo: optionalIsoDate,
  noPurchaseFrom: optionalIsoDate,
  noPurchaseTo: optionalIsoDate,
  lastPurchaseFrom: optionalIsoDate,
  lastPurchaseTo: optionalIsoDate,
  loyalty: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.enum(["standard", "gold", "platinum"]).optional()
  ),
  hasLastPurchase: optionalBoolQuery,
  /** Legacy presets still accepted. */
  noPurchaseMonths: z
    .union([z.literal("3"), z.literal("6"), z.literal(3), z.literal(6)])
    .optional()
    .transform((v) => {
      if (v === "3" || v === 3) return 3 as const;
      if (v === "6" || v === 6) return 6 as const;
      return undefined;
    }),
});

function refineCustomerInsightFilterRanges<
  T extends {
    minTotal?: number;
    maxTotal?: number;
    birthdayFrom?: unknown;
    birthdayTo?: unknown;
  },
>(val: T, ctx: z.RefinementCtx) {
  if (
    val.minTotal != null &&
    val.maxTotal != null &&
    val.minTotal > val.maxTotal
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "minTotal cannot exceed maxTotal",
      path: ["minTotal"],
    });
  }
  if ((val.birthdayFrom && !val.birthdayTo) || (!val.birthdayFrom && val.birthdayTo)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "birthdayFrom and birthdayTo must both be set",
      path: ["birthdayFrom"],
    });
  }
}

export const customerInsightFilterQuerySchema = customerInsightFilterFieldsSchema
  .extend({
    page: z.coerce
      .number()
      .int()
      .min(LIMITS.pagination.pageMin)
      .max(LIMITS.pagination.pageMax)
      .default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(25),
  })
  .superRefine(refineCustomerInsightFilterRanges);

/** Same filters as list endpoint; no pagination (CSV export). */
export const customerInsightFilterExportQuerySchema =
  customerInsightFilterFieldsSchema.superRefine(refineCustomerInsightFilterRanges);

export const customerInsightMergeBodySchema = z
  .object({
    sourceContactId: cuidSchema,
    targetContactId: cuidSchema,
  })
  .refine((v) => v.sourceContactId !== v.targetContactId, {
    message: "source and target must differ",
    path: ["sourceContactId"],
  });

export const customerInsightLoyaltyAssignBodySchema = z.object({
  tier: z.enum(["gold", "platinum"]),
  remark: z.string().trim().max(2000).optional().nullable(),
});

export const merchantLoyaltyOutreachBodySchema = z.object({
  contactId: cuidSchema,
  action: z.enum(["loyalty_informed", "responded", "not_responded"]),
  remark: z.string().trim().max(2000).optional().nullable(),
});

export const merchantCallUpdateBodySchema = z.object({
  contactId: cuidSchema,
  category: z.enum(CALL_CENTER_CATEGORY_VALUES),
  remark: z.string().trim().max(2000).optional().nullable(),
  /** Dashboard merchant slice — admin may pass selected merchant user id. */
  merchantUserId: cuidSchema.optional(),
});

export const customerInsightFilterOptionsQuerySchema = z.object({
  type: z
    .enum([
      "brands",
      "items",
      "cities",
      "merchants",
      "call-queue-merchants",
      "locations",
    ])
    .default("brands"),
  brand: insightFilterListSchema(LIMITS.name.max),
  q: trimmedString(1, 100).optional(),
});

const optionalBoolQuery = z
  .union([z.literal("true"), z.literal("1"), z.literal("false"), z.literal("0")])
  .optional()
  .transform((v) => (v == null ? undefined : v === "true" || v === "1"));

export const customerInsightCallQueueCandidatesQuerySchema = z.object({
  assignedMerchant: trimmedString(1, LIMITS.knownName.max),
  page: z.coerce.number().int().min(1).max(LIMITS.pagination.pageMax).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  pushToGold: optionalBoolQuery,
  pushToPlatinum: optionalBoolQuery,
  loyalty: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.enum(["standard", "gold", "platinum", "unassigned"]).optional()
  ),
  lastPurchaseFrom: optionalIsoDate,
  lastPurchaseTo: optionalIsoDate,
  brand: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    trimmedString(1, LIMITS.name.max).optional()
  ),
});

export const customerInsightCallQueueEligibleIdsQuerySchema = z.object({
  assignedMerchant: trimmedString(1, LIMITS.knownName.max),
  limit: z.coerce.number().int().min(1).max(5000).optional(),
  pushToGold: optionalBoolQuery,
  pushToPlatinum: optionalBoolQuery,
  loyalty: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.enum(["standard", "gold", "platinum", "unassigned"]).optional()
  ),
  lastPurchaseFrom: optionalIsoDate,
  lastPurchaseTo: optionalIsoDate,
  brand: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    trimmedString(1, LIMITS.name.max).optional()
  ),
});

export const customerInsightCallQueueExportQuerySchema = z.object({
  assignedMerchant: trimmedString(1, LIMITS.knownName.max).optional(),
});

export const customerInsightCallQueueReportQuerySchema = z.object({
  assignedMerchant: trimmedString(1, LIMITS.knownName.max).optional(),
  assignedFrom: optionalIsoDate,
  assignedTo: optionalIsoDate,
  status: z.enum(["pending", "completed"]).optional(),
  pushToGold: optionalBoolQuery,
  pushToPlatinum: optionalBoolQuery,
});

export const customerInsightCallQueueAssignBodySchema = z.object({
  assignedMerchant: trimmedString(1, LIMITS.knownName.max),
  contactIds: z.array(cuidSchema).min(1).max(200),
});

export const customerInsightMerchantMonitoringQuerySchema = z
  .object({
    fromYmd: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
    toYmd: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
    assignedMerchant: trimmedString(1, LIMITS.knownName.max).optional(),
    preset: z.enum(["today", "mtd", "custom"]).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.fromYmd > val.toYmd) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "fromYmd cannot be after toYmd",
        path: ["fromYmd"],
      });
    }
  });
