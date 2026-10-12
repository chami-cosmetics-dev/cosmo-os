/** Env-driven Wishlist Buddy settings. Pure parsing, so it can be unit tested. */

import type { StockLookupResult, StockSource } from "@/lib/wishlist-buddy/stock-sources";

/**
 * `WISHLIST_BUDDY_STORE_ALIASES="buddy-store-8866=u71ajc-11"`: treat a store (e.g. a personal test
 * store) as an already-linked Cosmo store when choosing the company and location. Avoids adding a
 * CompanyLocation for a test store, which other features (abandoned checkouts, loyalty push) would
 * then call with the main store's token.
 */
export function parseStoreAliases(raw: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const pair of (raw ?? "").split(",")) {
    const [from, to] = pair.split("=").map((s) => s?.trim().toLowerCase());
    if (from && to) map.set(from, to);
  }
  return map;
}

/**
 * `WISHLIST_BUDDY_EXCLUDE_WAREHOUSES="Main Warehouse - Cosmo"`: ERP warehouses that feed Shopify,
 * so they are sold out by definition and must not show as "stock elsewhere". Used together with
 * the location's `erpnextWarehouse`, which is often unset.
 */
export function parseWarehouseList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function resolveStoreHandleForLocation(storeHandle: string, aliasesRaw: string | undefined): string {
  return parseStoreAliases(aliasesRaw).get(storeHandle.toLowerCase()) ?? storeHandle;
}

export function excludedWarehousesFor(locationWarehouse: string | null | undefined, envRaw: string | undefined): string[] {
  const list = parseWarehouseList(envRaw);
  if (locationWarehouse?.trim()) list.push(locationWarehouse.trim());
  return [...new Set(list)];
}

export type StockLookupMode = "erp" | "off" | "demo";

/**
 * `WISHLIST_BUDDY_STOCK_LOOKUP`: `erp` (default) checks ERP1 + ERP2; `off` skips the check (no
 * "we'll call you" email); `demo` returns fake stock without calling any ERP, for testing on a
 * store with no ERP behind it. Demo is never allowed in a production build: it becomes `off`,
 * so customers can't be promised a call based on invented stock.
 */
export function resolveStockLookupMode(raw: string | undefined, nodeEnv: string | undefined): StockLookupMode {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "off") return "off";
  if (value === "demo") return nodeEnv === "production" ? "off" : "demo";
  return "erp";
}

/** Fake stock for `demo` mode. A SKU containing "NOSTOCK" has no stock anywhere. */
export function demoStockLookup(sku: string): StockLookupResult {
  if (/nostock/i.test(sku)) return { sources: [], failedInstances: [] };
  const source = (erpCompany: string, warehouse: string, availableQty: number): StockSource => ({
    instanceId: "demo",
    instanceLabel: "Demo (no ERP)",
    erpCompany,
    warehouse,
    availableQty,
    actualQty: availableQty,
    reservedQty: 0,
    projectedQty: availableQty,
  });
  return {
    sources: [
      source("Cosmetics.lk", "Negombo Shop - Cosmo (demo)", 3),
      source("Chami", "Chami Shop (demo)", 2),
    ],
    failedInstances: [],
  };
}

/** `WISHLIST_BUDDY_ERP_ORDER`: ERP instance label hints, first listed first. Default ERP2 then ERP1. */
export function erpOrderHints(raw: string | undefined): string[] {
  return parseWarehouseList(raw ?? "ERP_2,ERP_1");
}

/**
 * `WISHLIST_BUDDY_PRIORITY_WAREHOUSES`: warehouses listed first for staff requests (they include
 * the main warehouse). Default Main Warehouse - Cosmo.
 */
export function priorityWarehouses(raw: string | undefined): string[] {
  return parseWarehouseList(raw ?? "Main Warehouse - Cosmo");
}
