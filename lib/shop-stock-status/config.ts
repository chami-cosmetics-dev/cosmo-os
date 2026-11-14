/**
 * Shop Stock Status screen config + API types. Client-safe (no server imports).
 */

import type { StockHealthStatus } from "@/lib/stock-health/config";

export type ShopStockColumn = {
  key: string;
  label: string;
  /** ERP warehouses whose live stock goes into this column (any ERP). */
  warehouses: string[];
  /** OSF ROP columns whose ROP goes into this column. */
  ropColumnKeys: string[];
};

/**
 * Shops: the ERP1 Cosmo shop warehouse + the ERP2 trading company's shop warehouse.
 * Online: the ERP1 Cosmo Main Warehouse + every ERP2 trading company's Main Warehouse.
 * Warehouses not listed (e.g. Stores / Goods In Transit) are not in any column.
 */
export const SHOP_STOCK_COLUMNS: ShopStockColumn[] = [
  {
    key: "ogf",
    label: "OGF",
    warehouses: ["OGF Shop Warehouse - Cosmo", "Shop Warehouse - LWK"],
    ropColumnKeys: ["cosmo_shop_ogf", "lwk"],
  },
  {
    key: "cool_planet",
    label: "Cool Planet",
    warehouses: ["Cool Planet Nugegoda Shop Warehouse - Cosmo", "Shop Warehouse - MNK"],
    ropColumnKeys: ["cosmo_shop_coolplanet", "mnk"],
  },
  {
    key: "kiribathgoda",
    label: "Kiribathgoda",
    warehouses: ["Kiribathgoda Shop Warehouse - Cosmo", "Shop Warehouse - AJS"],
    ropColumnKeys: ["cosmo_shop_kiribathgoda", "ajs"],
  },
  {
    key: "maharagama",
    label: "Maharagama",
    warehouses: ["Maharagama Shop Warehouse - Cosmo", "Shop Warehouse - DRO"],
    ropColumnKeys: ["cosmo_shop_maharagama", "dro"],
  },
  {
    key: "galle",
    label: "Galle",
    warehouses: ["GCC Shop Warehouse - Cosmo", "Shop Warehouse - Chami"],
    ropColumnKeys: ["cosmo_shop_gcc", "chami_shop_gcc"],
  },
  {
    key: "negombo",
    label: "Negombo",
    warehouses: ["Negombo Shop Warehouse - Cosmo", "Shop Warehouse - DTD"],
    ropColumnKeys: ["cosmo_shop_negombo", "thewan"],
  },
  {
    key: "pepiliyana",
    label: "Pepiliyana",
    warehouses: ["Pepiliyana Shop Warehouse - Cosmo", "Shop Warehouse - LMJ"],
    ropColumnKeys: ["cosmo_shop_pepiliyana", "lmj"],
  },
  {
    key: "online",
    label: "Online",
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
      "Main Warehouse - SPK",
      "Main Warehouse - Udara",
      "Main Warehouse - USP",
      "Main Warehouses - Pevi",
    ],
    // The other trading companies' ROP sits in their shop columns above.
    ropColumnKeys: ["cosmetics_lk", "chami", "kad", "spk", "pevi", "udara", "usp"],
  },
];

/**
 * Online tab: the Online column per company — only Main Warehouses with their own OSF ROP
 * column (AJS, DRO, DTD, LMJ, LWK, MNK's ROP sits in their shop columns).
 */
export const ONLINE_STOCK_COLUMNS: ShopStockColumn[] = [
  { key: "cosmo", label: "Cosmetics.lk", warehouses: ["Main Warehouse - Cosmo"], ropColumnKeys: ["cosmetics_lk"] },
  { key: "chami", label: "Chami", warehouses: ["Main Warehouse - Chami"], ropColumnKeys: ["chami"] },
  { key: "kad", label: "KAD", warehouses: ["Main Warehouse - KAD"], ropColumnKeys: ["kad"] },
  { key: "spk", label: "SPK", warehouses: ["Main Warehouse - SPK"], ropColumnKeys: ["spk"] },
  { key: "pevi", label: "Pevi", warehouses: ["Main Warehouses - Pevi"], ropColumnKeys: ["pevi"] },
  { key: "udara", label: "Udara", warehouses: ["Main Warehouse - Udara"], ropColumnKeys: ["udara"] },
  { key: "usp", label: "USP", warehouses: ["Main Warehouse - USP"], ropColumnKeys: ["usp"] },
];

export const SHOP_STOCK_TABS = ["shops", "online"] as const;
export type ShopStockTab = (typeof SHOP_STOCK_TABS)[number];

export const SHOP_STOCK_TAB_LABELS: Record<ShopStockTab, string> = {
  shops: "SHOPS",
  online: "ONLINE",
};

export const SHOP_STOCK_TAB_COLUMNS: Record<ShopStockTab, ShopStockColumn[]> = {
  shops: SHOP_STOCK_COLUMNS,
  online: ONLINE_STOCK_COLUMNS,
};

/** Stock as % of ROP: below this = Fail (red). */
export const SHOP_STOCK_PASS_PERCENT = 50;
/** Above this = green; from the pass % up to and including this = yellow. */
export const SHOP_STOCK_FULL_PERCENT = 100;

export type ShopStockBand = "fail" | "pass" | "full";

/** null = no ROP in that column ("-", not counted). */
export type ShopStockCell = { stock: number; rop: number; percent: number | null };

export type ShopStockRow = {
  commonSku: string;
  itemName: string | null;
  priority: StockHealthStatus;
  /** By `SHOP_STOCK_COLUMNS` key. */
  cells: Record<string, ShopStockCell>;
  fail: number;
  pass: number;
};

export type ShopStockStatus = {
  /** Rows per tab (same Common SKUs, by `SHOP_STOCK_TAB_COLUMNS`). */
  tabs: Record<ShopStockTab, ShopStockRow[]>;
  fetchedAt: string;
};

export const SHOP_STOCK_BAND_LABELS: Record<ShopStockBand, string> = {
  fail: "Red · below 50%",
  pass: "Yellow · 50–100%",
  full: "Green · above 100%",
};

export function shopStockBandOf(percent: number): ShopStockBand {
  if (percent < SHOP_STOCK_PASS_PERCENT) return "fail";
  return percent <= SHOP_STOCK_FULL_PERCENT ? "pass" : "full";
}
