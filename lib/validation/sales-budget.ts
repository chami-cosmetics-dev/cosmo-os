import { z } from "zod";

import {
  SALES_BUDGET_PAGE_SIZE,
  SALES_BUDGET_SHOP_CHANNELS,
  SALES_BUDGET_TABS,
  SALES_BUDGET_VAT_FILTERS,
} from "@/lib/sales-budget/config";

export const salesBudgetPageDataQuerySchema = z.object({
  tab: z.enum(SALES_BUDGET_TABS).default("online"),
  vat: z.enum(SALES_BUDGET_VAT_FILTERS).default("all"),
  /** SHOP tab only: channel (shop sales placed online vs at the shop; all = combined). */
  channel: z.enum(SALES_BUDGET_SHOP_CHANNELS).default("all"),
  /** Merchant (online) or shop name; omitted or "all" = combined totals. */
  entity: z.string().trim().max(80).optional(),
  /** Brand name; omitted or "all" = every brand. */
  brand: z.string().trim().max(120).optional(),
  /** ERP priority; omitted or "all" = every priority, "none" = no priority set. */
  priority: z.string().trim().max(64).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(SALES_BUDGET_PAGE_SIZE),
  /** "1" = regenerate the ERP stock report and reload tax status (Refresh button). */
  refresh: z
    .enum(["0", "1"])
    .optional()
    .transform((v) => v === "1"),
});

/** Save: edited Budgeted Qty of one merchant / shop view into next month's budget file. */
export const salesBudgetSaveBodySchema = z
  .object({
    /** Budget month the screen was saving for (YYYY-MM); the server rejects other months. */
    targetMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    /** The edited view; only needed with `changes` (the file Save works from any view). */
    tab: z.enum(SALES_BUDGET_TABS).optional(),
    /** SHOP tab: "online" or "shop" (the "all" channel is read-only). */
    channel: z.enum(SALES_BUDGET_SHOP_CHANNELS).nullable().optional(),
    /** A specific merchant (ONLINE) or shop (SHOP); "All" views are read-only. */
    entity: z.string().trim().min(1).max(80).optional(),
    vat: z.enum(SALES_BUDGET_VAT_FILTERS).optional(),
    /** Empty = file Save: create the month's file (calculated values) or record the save. */
    changes: z
      .array(
        z.object({
          commonSku: z.string().trim().min(1).max(120),
          budgetedQty: z.number().int().min(0).max(10_000_000),
        }),
      )
      .max(20_000),
    /**
     * Saved prices differ from today's: "ask" = stop and list them (409), "update" = write
     * today's prices too, "keep" = only update quantities.
     */
    prices: z.enum(["ask", "update", "keep"]).default("ask"),
  })
  .refine((b) => b.changes.length === 0 || (b.tab && b.entity && b.vat), {
    message: "Edits need the merchant / shop view they belong to",
  });

/** Saved Budgets viewer: one view of a saved month's file. */
export const salesBudgetSavedViewQuerySchema = z.object({
  tab: z.enum(SALES_BUDGET_TABS).default("online"),
  /** SHOP tab: SHOP-SHOP or SHOP-ONLINE sheet (the file has no combined channel). */
  channel: z.enum(["shop", "online"]).default("shop"),
  vat: z.enum(SALES_BUDGET_VAT_FILTERS).default("all"),
  /** Merchant (online) or shop name; omitted or "all" = combined. */
  entity: z.string().trim().max(80).optional(),
  brand: z.string().trim().max(120).optional(),
  priority: z.string().trim().max(64).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(SALES_BUDGET_PAGE_SIZE),
});
