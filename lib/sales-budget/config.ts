/**
 * Sales Budget screen config. Edit the merchant / shop lists here.
 * Client-safe (no server imports).
 */

export const SALES_BUDGET_TABS = ["online", "shop"] as const;
export type SalesBudgetTab = (typeof SALES_BUDGET_TABS)[number];

export const SALES_BUDGET_TAB_LABELS: Record<SalesBudgetTab, string> = {
  online: "ONLINE",
  shop: "SHOP",
};

/** SHOP tab Channel filter: shop sales placed online vs at the shop. `all` = combined. */
export const SALES_BUDGET_SHOP_CHANNELS = ["all", "online", "shop"] as const;
export type SalesBudgetShopChannel = (typeof SALES_BUDGET_SHOP_CHANNELS)[number];

export const SALES_BUDGET_SHOP_CHANNEL_LABELS: Record<SalesBudgetShopChannel, string> = {
  all: "All",
  online: "ONLINE",
  shop: "SHOP",
};

/**
 * Matches ERP Tax Status: `Vat` / `Non Vat` / `Vat / Non Vat`. `all` = no filter.
 * A SKU whose ERP1 and ERP2 statuses disagree (Vat vs Non Vat) counts as VAT/NON-VAT;
 * blank status counts as NON-VAT.
 */
export const SALES_BUDGET_VAT_FILTERS = ["all", "vat", "non_vat", "vat_non_vat"] as const;
export type SalesBudgetVatFilter = (typeof SALES_BUDGET_VAT_FILTERS)[number];

export const SALES_BUDGET_VAT_LABELS: Record<SalesBudgetVatFilter, string> = {
  all: "All",
  vat: "VAT",
  non_vat: "NON-VAT",
  vat_non_vat: "VAT/NON-VAT",
};

/** Value of the "All Merchants" / "All Shops" option = combined totals. */
export const SALES_BUDGET_ALL_ENTITIES = "all";

/**
 * ONLINE tab merchants are not a fixed list: every user with this role who has a merchant
 * coupon code (MER…) and NO Outlet (outlet staff are shop merchants — see
 * SALES_BUDGET_SHOPS[].outlet). Replacing a merchant in Users / Staff updates the screen.
 */
export const SALES_BUDGET_ONLINE_MERCHANT_ROLE = "merchant-level-02";

/**
 * A stock scope: ERP warehouses (exact names from "Stock Balance Summary - Item Wise")
 * and the OSF columns (Settings → OSF columns `key`) whose ROP counts for it.
 */
export type SalesBudgetStockScope = {
  /** ERP_1 + ERP_2 warehouses. */
  warehouses: string[];
  /**
   * OSF ROP columns. ERP_2 trading columns (lwk, mnk, ajs, dro, lmj, thewan) cover both
   * their Main and Shop warehouse with one ROP, so they count under the shop only.
   */
  ropColumns: string[];
};

/**
 * Shop sales breakdown: ERP_1 Cosmo shop warehouse + ERP_2 trading company shop warehouse.
 * `outlet` = the Outlet name in Settings → Outlets; the shop's online merchants are the active
 * staff assigned to that Outlet (Staff → Outlet) who have a merchant coupon code (MER…).
 */
export const SALES_BUDGET_SHOPS: ReadonlyArray<
  { name: string; outlet: string } & SalesBudgetStockScope
> = [
  {
    name: "OGF",
    outlet: "OGF",
    warehouses: ["OGF Shop Warehouse - Cosmo", "Shop Warehouse - LWK"],
    ropColumns: ["cosmo_shop_ogf", "lwk"],
  },
  {
    name: "Cool Planet",
    outlet: "CoolPlanet",
    warehouses: ["Cool Planet Nugegoda Shop Warehouse - Cosmo", "Shop Warehouse - MNK"],
    ropColumns: ["cosmo_shop_coolplanet", "mnk"],
  },
  {
    name: "Kiribathgoda",
    outlet: "Kiribathgoda",
    warehouses: ["Kiribathgoda Shop Warehouse - Cosmo", "Shop Warehouse - AJS"],
    ropColumns: ["cosmo_shop_kiribathgoda", "ajs"],
  },
  {
    name: "Maharagama",
    outlet: "Maharagama",
    warehouses: ["Maharagama Shop Warehouse - Cosmo", "Shop Warehouse - DRO"],
    ropColumns: ["cosmo_shop_maharagama", "dro"],
  },
  {
    name: "Galle",
    outlet: "Galle",
    warehouses: ["GCC Shop Warehouse - Cosmo", "Shop Warehouse - Chami"],
    ropColumns: ["cosmo_shop_gcc", "chami_shop_gcc"],
  },
  {
    name: "Negombo",
    outlet: "Negombo",
    warehouses: ["Negombo Shop Warehouse - Cosmo", "Shop Warehouse - DTD"],
    // DTD's OSF column key is "thewan".
    ropColumns: ["cosmo_shop_negombo", "thewan"],
  },
  {
    name: "Pepiliyana",
    outlet: "Pepiliyana",
    warehouses: ["Pepiliyana Shop Warehouse - Cosmo", "Shop Warehouse - LMJ"],
    ropColumns: ["cosmo_shop_pepiliyana", "lmj"],
  },
];

/**
 * ONLINE breakdown: ERP_1 Cosmo Main Warehouse + every ERP_2 trading company Main Warehouse.
 * Used by the ONLINE tab and by the SHOP tab's ONLINE channel.
 */
export const SALES_BUDGET_ONLINE: SalesBudgetStockScope = {
  warehouses: [
    "Main Warehouse - Cosmo",
    "Main Warehouse - AJS",
    "Main Warehouse - Chami",
    "Main Warehouse - DRO",
    "Main Warehouse - DTD",
    "Main Warehouse - KAD",
    "Main Warehouse - LMJ",
    "Main Warehouse - LWK",
    "Main Warehouse - MNK",
    "Main Warehouses - Pevi",
    "Main Warehouse - SPK",
    "Main Warehouse - Udara",
    "Main Warehouse - USP",
  ],
  // Main-only OSF columns; mixed Main+Shop trading columns count under their shop.
  ropColumns: ["cosmetics_lk", "chami", "kad", "pevi", "spk", "udara", "usp"],
};

/**
 * How Budgeted Qty (Target % × Highest Sale Qty) becomes whole units.
 * "ceil" rounds up, so low sellers are not budgeted at 0.
 */
export const BUDGET_ROUNDING: "ceil" | "round" | "floor" = "ceil";

/**
 * Priority hierarchy, highest first. A Common SKU takes the highest priority among its
 * variants (ABC_1 "Newly added" + ABC_2 "Top" → ABC is "Top"). Matched case-insensitively
 * by prefix, so "Discontinued" / "Newly Added" match too. Unknown values rank after these;
 * "no priority" only when no variant has one.
 */
export const SALES_BUDGET_PRIORITY_ORDER = ["Top", "Low", "Newly added", "Discontinue"];

/**
 * ERP Pricing Rules whose title starts with this (e.g. "Final Discount 30%") are the item
 * discounts. Discounted items: Selling Price = original × (1 − %), Compare at Price = original.
 * Not discounted: Selling Price = original, Compare at Price = 0. Original = ERP
 * "Standard Selling" Item Price. Other ERP pricing rules are ignored.
 */
export const SALES_BUDGET_DISCOUNT_RULE_PREFIX = "Final Discount";

/**
 * Selling price used for Budgeted Revenue when a Common SKU's variants differ in price
 * (e.g. 7,950 – 9,500). "min" = lowest (conservative), "max" = highest.
 */
export const BUDGET_REVENUE_PRICE: "min" | "max" = "min";

/** Brands whose SKUs are NOT grouped into a Common SKU (each SKU is its own row, e.g. shades). */
export const SALES_BUDGET_UNGROUPED_BRANDS = ["Golden Rose"];

/** Dropdown labels. ONLINE merchant options come from the API (`merchants`), not config. */
export const SALES_BUDGET_ENTITY_CONFIG: Record<
  SalesBudgetTab,
  { label: string; allLabel: string; options: readonly string[] }
> = {
  online: { label: "Merchant", allLabel: "All Merchants", options: [] },
  shop: { label: "Shop", allLabel: "All Shops", options: SALES_BUDGET_SHOPS.map((s) => s.name) },
};

export const SALES_BUDGET_PAGE_SIZE = 50;

/** One table row = one Common SKU (variants grouped by SKU stem). */
export type SalesBudgetRow = {
  commonSku: string;
  brand: string | null;
  productTitle: string | null;
  /** ERP Product Priority (ERP_1, else ERP_2), as on Stock Trends. */
  priority: string | null;
  /** Variant SKUs grouped under this Common SKU (after the VAT filter). */
  variantSkus: string[];
  sellingPriceMin: number | null;
  sellingPriceMax: number | null;
  compareAtPriceMin: number | null;
  compareAtPriceMax: number | null;
  /** Placeholder columns: null renders as "-". See lib/sales-budget/calculations.ts. */
  highestSaleQty: number | null;
  /** Selection's share of the total month target (same on every row); null = no target. */
  targetPercent: number | null;
  budgetedQty: number | null;
  currentStock: number | null;
  currentRop: number | null;
  budgetedRevenue: number | null;
  /** Budgeted Qty (and Revenue) come from an edit saved in next month's saved budget (snapshot). */
  savedEdit?: boolean;
};

/**
 * Month targets for the current view (Merchant Dashboard "Month target", current month).
 * `selected` is only set when a specific merchant / shop is picked.
 */
export type SalesBudgetTarget = {
  totalLabel: string;
  /** Null when no target is set (or it is 0). */
  total: number | null;
  selectedLabel: string | null;
  selected: number | null;
  /** selected / total × 100; 100 for "All"; null when either is missing. */
  percent: number | null;
};

export type SalesBudgetPageData = {
  rows: SalesBudgetRow[];
  total: number;
  page: number;
  limit: number;
  /** When the ERP stock report + tax status were last rebuilt (ISO). */
  erpFetchedAt: string;
  /** Brand / priority dropdown options for the current tab + merchant/shop + channel. */
  brands: string[];
  priorities: string[];
  /** ONLINE tab Merchant dropdown options (live from Users / Staff). */
  merchants: string[];
  target: SalesBudgetTarget;
  /** Budgeted Revenue summed over every row matching the filters (all pages). */
  budgetedRevenueTotal: number | null;
  /** Common SKUs of every row matching the filters (all pages); for edited-qty totals. */
  filteredSkus: string[];
  /** Next month's saved budget (snapshot) (Save button). */
  budgetFile: {
    targetMonth: string;
    /** Null when nothing is saved for the month yet. */
    lastUpdatedAt: string | null;
    lastSavedBy: string | null;
    /** Why Save is not allowed now; null = allowed. */
    blockedReason: string | null;
  };
};

/** Save: an item line whose saved Selling / Compare at Price differ from today's. */
export type BudgetPriceChange = {
  commonSku: string;
  /** VAT column label of the line. */
  vat: string;
  /** Number, a range text ("7,600 – 7,950"), or "" when missing. */
  oldSellingPrice: string | number;
  newSellingPrice: string | number;
  oldCompareAtPrice: string | number;
  newCompareAtPrice: string | number;
};

/** Saved Budgets list: one saved month. */
export type SavedBudgetListItem = {
  /** YYYY-MM the budget is for. */
  targetMonth: string;
  /** From the DB record (ISO). */
  lastUpdatedAt: string;
  /** Open while the month before targetMonth is running (saves allowed), then Locked. */
  status: "open" | "locked";
};

/** Saved Budgets viewer row: one item line of the saved snapshot (VAT line + Common SKU). */
export type SavedBudgetRow = {
  commonSku: string;
  /** VAT column label of the saved line. */
  vat: string;
  brand: string | null;
  productTitle: string | null;
  priority: string | null;
  highestSaleQty: number | null;
  targetPercent: number | null;
  budgetedQty: number | null;
  currentStock: number | null;
  currentRop: number | null;
  /** As saved: a number, or a range text ("7,600 – 7,950"); null when blank. */
  sellingPrice: number | string | null;
  compareAtPrice: number | string | null;
  budgetedRevenue: number | null;
  /** Budgeted Qty was edited by a user (snapshot edits). */
  edited: boolean;
};

export type SavedBudgetViewData = {
  targetMonth: string;
  lastUpdatedAt: string;
  rows: SavedBudgetRow[];
  total: number;
  page: number;
  limit: number;
  /** Merchants (ONLINE) or shops (SHOP) in the saved snapshot, for the dropdown. */
  entities: string[];
  brands: string[];
  priorities: string[];
  target: SalesBudgetTarget;
  /** Budgeted Revenue summed over every row matching the filters (all pages). */
  budgetedRevenueTotal: number | null;
};

/** Saved budget / Export sheet a merchant / shop view belongs to (the "All" channel has none). */
export function budgetSheetFor(
  tab: SalesBudgetTab,
  channel: SalesBudgetShopChannel | null,
): string | null {
  if (tab === "online") return "ONLINE";
  if (channel === "shop") return "SHOP-SHOP";
  if (channel === "online") return "SHOP-ONLINE";
  return null;
}

/** Value of the "All brands" / "All priorities" option. */
export const SALES_BUDGET_ALL_OPTION = "all";
/** Filter value for rows with no priority set in either ERP. */
export const SALES_BUDGET_NO_PRIORITY = "none";

/**
 * Export stream (one JSON object per line): progress percents while the file is built, then the
 * zip (base64) — or an error.
 */
export type SalesBudgetExportMessage =
  | { percent: number }
  | { name: string; file: string }
  | { error: string };
