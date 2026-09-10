import type { OsfErpCredentials } from "@/lib/osf/erp-stock";
import { vaultErpGetJson } from "@/lib/vault-osf/erp-client";
import type { PriceInfo } from "@/lib/vault-osf/types";

const PAGE = 500;
const MAX_PAGES = 80;
export const STANDARD_SELLING = "Standard Selling";

export type PricingRuleRow = {
  name?: string;
  disable?: number | boolean;
  apply_on?: string | null;
  selling?: number | boolean;
  coupon_code_based?: number | boolean;
  valid_from?: string | null;
  valid_upto?: string | null;
  rate_or_discount?: string | null;
  discount_percentage?: number | string | null;
  item_code?: string | null;
};

export function ruleAppliesOnDate(
  row: Pick<PricingRuleRow, "valid_from" | "valid_upto" | "disable">,
  asOfDate: string,
): boolean {
  if (row.disable === 1 || row.disable === true) return false;
  const from = row.valid_from?.trim() || null;
  const until = row.valid_upto?.trim() || null;
  if (from && asOfDate < from) return false;
  if (until && asOfDate > until) return false;
  return true;
}

export function isItemCodeSellingRule(row: PricingRuleRow): boolean {
  if (row.apply_on !== "Item Code") return false;
  if (row.selling !== 1 && row.selling !== true) return false;
  if (row.coupon_code_based === 1 || row.coupon_code_based === true) return false;
  if ((row.rate_or_discount ?? "Discount Percentage") !== "Discount Percentage") return false;
  return true;
}

export function resolveDiscountPercent(
  rules: PricingRuleRow[],
  sku: string,
  asOfDate: string,
): number | null {
  let best: number | null = null;
  for (const row of rules) {
    if (!isItemCodeSellingRule(row)) continue;
    if (!ruleAppliesOnDate(row, asOfDate)) continue;
    if ((row.item_code ?? "").trim() !== sku) continue;
    const pct = Number(row.discount_percentage);
    if (!Number.isFinite(pct) || pct <= 0) continue;
    if (best == null || pct > best) best = pct;
  }
  return best;
}

export function applyDiscount(mrp: number | null, percent: number | null): PriceInfo {
  if (mrp == null || !Number.isFinite(mrp)) {
    return { mrp: null, discountPercent: percent, discountedPrice: null };
  }
  if (percent == null) return { mrp, discountPercent: null, discountedPrice: null };
  return {
    mrp,
    discountPercent: percent,
    discountedPrice: mrp * (1 - percent / 100),
  };
}

export type ItemPriceRow = {
  item_code?: string | null;
  price_list_rate?: number | string | null;
  valid_from?: string | null;
  valid_upto?: string | null;
  modified?: string | null;
  customer?: string | null;
};

/** A Standard Selling price row that is in force on the as-of date. */
export type PriceCandidate = {
  rate: number;
  validFrom: string | null;
  modified: string | null;
};

/** Item Price rows carry an optional validity window; honour it against the as-of date. */
export function itemPriceApplies(row: ItemPriceRow, asOfDate: string): boolean {
  const from = row.valid_from?.trim() || null;
  const until = row.valid_upto?.trim() || null;
  if (from && asOfDate < from) return false;
  if (until && asOfDate > until) return false;
  return true;
}

/**
 * Newest first: latest valid_from wins, then latest `modified`. A SKU priced in
 * both ERP instances resolves to whichever row was made effective most recently
 * instead of whichever page happened to load last.
 */
export function comparePriceCandidates(a: PriceCandidate, b: PriceCandidate): number {
  const af = a.validFrom ?? "";
  const bf = b.validFrom ?? "";
  if (af !== bf) return af < bf ? 1 : -1;
  const am = a.modified ?? "";
  const bm = b.modified ?? "";
  if (am !== bm) return am < bm ? 1 : -1;
  return 0;
}

export function collectStandardSellingCandidates(
  rows: ItemPriceRow[],
  asOfDate: string,
): Map<string, PriceCandidate> {
  const map = new Map<string, PriceCandidate>();
  for (const row of rows) {
    const sku = row.item_code?.trim();
    if (!sku) continue;
    // Customer-specific rows are not the general MRP.
    if (row.customer?.trim()) continue;
    if (!itemPriceApplies(row, asOfDate)) continue;
    const rate = Number(row.price_list_rate);
    // A zero or negative rate is never a real MRP; leave the cell blank instead.
    if (!Number.isFinite(rate) || rate <= 0) continue;
    const next: PriceCandidate = {
      rate,
      validFrom: row.valid_from?.trim() || null,
      modified: row.modified?.trim() || null,
    };
    const prev = map.get(sku);
    if (!prev || comparePriceCandidates(next, prev) < 0) map.set(sku, next);
  }
  return map;
}

export function mergePriceCandidates(
  into: Map<string, PriceCandidate>,
  add: Map<string, PriceCandidate>,
): Map<string, PriceCandidate> {
  for (const [sku, cand] of add) {
    const prev = into.get(sku);
    if (!prev || comparePriceCandidates(cand, prev) < 0) into.set(sku, cand);
  }
  return into;
}

export async function fetchStandardSellingCandidates(
  cfg: OsfErpCredentials,
  asOfDate: string,
): Promise<Map<string, PriceCandidate>> {
  const rows: ItemPriceRow[] = [];
  const fields = JSON.stringify([
    "item_code",
    "price_list_rate",
    "valid_from",
    "valid_upto",
    "modified",
    "customer",
  ]);
  const filters = JSON.stringify([
    ["price_list", "=", STANDARD_SELLING],
    ["selling", "=", 1],
  ]);
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const path =
      `/api/resource/Item Price?fields=${encodeURIComponent(fields)}` +
      `&filters=${encodeURIComponent(filters)}` +
      `&limit_start=${page * PAGE}&limit_page_length=${PAGE}`;
    const json = await vaultErpGetJson<{ data?: ItemPriceRow[] }>(cfg, path);
    const batch = json.data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return collectStandardSellingCandidates(rows, asOfDate);
}

export async function fetchItemCodePricingRules(
  cfg: OsfErpCredentials,
): Promise<PricingRuleRow[]> {
  const fields = JSON.stringify([
    "name",
    "disable",
    "apply_on",
    "selling",
    "coupon_code_based",
    "valid_from",
    "valid_upto",
    "rate_or_discount",
    "discount_percentage",
    "`tabPricing Rule Item Code`.item_code",
  ]);
  const filters = JSON.stringify([
    ["disable", "=", 0],
    ["selling", "=", 1],
    ["apply_on", "=", "Item Code"],
  ]);
  const rows: PricingRuleRow[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const path =
      `/api/resource/Pricing Rule?fields=${encodeURIComponent(fields)}` +
      `&filters=${encodeURIComponent(filters)}` +
      `&limit_start=${page * PAGE}&limit_page_length=${PAGE}`;
    const json = await vaultErpGetJson<{ data?: PricingRuleRow[] }>(cfg, path);
    const batch = json.data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

/**
 * MRP is read from every configured ERP instance, not just ERP1: the Vault
 * catalog spans both, so single-instance reads left priced items blank.
 */
export async function fetchVaultPrices(
  cfgs: OsfErpCredentials[],
  skus: string[],
  asOfDate: string,
): Promise<Map<string, PriceInfo>> {
  const perInstance = await Promise.all(
    cfgs.map(async (cfg) => ({
      prices: await fetchStandardSellingCandidates(cfg, asOfDate),
      rules: await fetchItemCodePricingRules(cfg),
    })),
  );
  const mrpMap = new Map<string, PriceCandidate>();
  const rules: PricingRuleRow[] = [];
  for (const part of perInstance) {
    mergePriceCandidates(mrpMap, part.prices);
    rules.push(...part.rules);
  }
  const out = new Map<string, PriceInfo>();
  for (const sku of skus) {
    const mrp = mrpMap.get(sku)?.rate ?? null;
    const pct = resolveDiscountPercent(rules, sku, asOfDate);
    out.set(sku, applyDiscount(mrp, pct));
  }
  return out;
}
