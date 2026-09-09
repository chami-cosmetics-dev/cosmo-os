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

export async function fetchStandardSellingMap(cfg: OsfErpCredentials): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const fields = JSON.stringify(["item_code", "price_list_rate"]);
  const filters = JSON.stringify([
    ["price_list", "=", STANDARD_SELLING],
    ["selling", "=", 1],
  ]);
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const path =
      `/api/resource/Item Price?fields=${encodeURIComponent(fields)}` +
      `&filters=${encodeURIComponent(filters)}` +
      `&limit_start=${page * PAGE}&limit_page_length=${PAGE}`;
    const json = await vaultErpGetJson<{
      data?: Array<{ item_code?: string; price_list_rate?: number }>;
    }>(cfg, path);
    const rows = json.data ?? [];
    for (const row of rows) {
      const sku = row.item_code?.trim();
      const rate = Number(row.price_list_rate);
      if (sku && Number.isFinite(rate) && rate > 0) map.set(sku, rate);
    }
    if (rows.length < PAGE) break;
  }
  return map;
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

export async function fetchVaultPrices(
  cfg: OsfErpCredentials,
  skus: string[],
  asOfDate: string,
): Promise<Map<string, PriceInfo>> {
  const [mrpMap, rules] = await Promise.all([
    fetchStandardSellingMap(cfg),
    fetchItemCodePricingRules(cfg),
  ]);
  const out = new Map<string, PriceInfo>();
  for (const sku of skus) {
    const mrp = mrpMap.get(sku) ?? null;
    const pct = resolveDiscountPercent(rules, sku, asOfDate);
    out.set(sku, applyDiscount(mrp, pct));
  }
  return out;
}
