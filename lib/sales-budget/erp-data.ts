import "server-only";

import { formatAppIsoDate } from "@/lib/format-datetime";
import { getLiveStockBalances } from "@/lib/item-trends/stock-balance-report";
import { getAllOsfErpInstances, type OsfErpCredentials } from "@/lib/osf/erp-stock";
import { fetchErpTaxStatusBySkus } from "@/lib/osf/erp-tax-status";
import { normalizeSkuKey, resolveErpSlots } from "@/lib/product-items/erp-priority-sync";
import { SALES_BUDGET_DISCOUNT_RULE_PREFIX } from "@/lib/sales-budget/config";
import { vaultErpGetJson } from "@/lib/vault-osf/erp-client";
import {
  fetchStandardSellingCandidates,
  isItemCodeSellingRule,
  mergePriceCandidates,
  ruleAppliesOnDate,
  type PriceCandidate,
  type PricingRuleRow,
} from "@/lib/vault-osf/erp-pricing";

/**
 * ERP inputs for Sales Budget: live "Stock Balance Summary - Item Wise" (regenerated on
 * every rebuild, like Stock Trends) + ERP1/ERP2 Item Tax Status. Cached per company until
 * the screen's Refresh (or the TTL) so filter changes don't regenerate the report.
 */
export type SalesBudgetErpData = {
  /** SKU key (upper-case) → warehouse → balance qty. */
  stockBySku: Map<string, Map<string, number>>;
  erp1TaxBySku: Map<string, string | null>;
  erp2TaxBySku: Map<string, string | null>;
  /** SKU key → ERP "Standard Selling" price (original price), merged across ERPs. */
  standardPriceBySku: Map<string, number>;
  /** SKU key → active "Final Discount" %, highest across rules / ERPs. */
  discountPercentBySku: Map<string, number>;
  fetchedAt: Date;
};

const CACHE_TTL_MS = 60 * 60 * 1000;
const RULE_PAGE = 500;
const RULE_MAX_PAGES = 40;

type DiscountRuleRow = PricingRuleRow & { title?: string | null };

/** Active, item-code, selling "Final Discount …" rule rows (one row per item code). */
async function fetchFinalDiscountRules(cfg: OsfErpCredentials): Promise<DiscountRuleRow[]> {
  const fields = JSON.stringify([
    "name",
    "title",
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
    ["title", "like", `${SALES_BUDGET_DISCOUNT_RULE_PREFIX}%`],
  ]);
  const rows: DiscountRuleRow[] = [];
  for (let page = 0; page < RULE_MAX_PAGES; page += 1) {
    const json = await vaultErpGetJson<{ data?: DiscountRuleRow[] }>(
      cfg,
      `/api/resource/Pricing Rule?fields=${encodeURIComponent(fields)}` +
        `&filters=${encodeURIComponent(filters)}` +
        `&limit_start=${page * RULE_PAGE}&limit_page_length=${RULE_PAGE}`,
    );
    const batch = json.data ?? [];
    rows.push(...batch);
    if (batch.length < RULE_PAGE) break;
  }
  return rows;
}

/** Rule %; when the % field is 0 / blank, the number in the title ("Final Discount 35%"). */
function rulePercent(row: DiscountRuleRow): number | null {
  const field = Number(row.discount_percentage);
  if (Number.isFinite(field) && field > 0) return field;
  const fromTitle = Number(row.title?.match(/(\d+(?:\.\d+)?)\s*%/)?.[1]);
  return Number.isFinite(fromTitle) && fromTitle > 0 ? fromTitle : null;
}

async function loadPricing(
  instances: Array<{ cfg: OsfErpCredentials }>,
): Promise<Pick<SalesBudgetErpData, "standardPriceBySku" | "discountPercentBySku">> {
  const today = formatAppIsoDate(new Date());
  const perInstance = await Promise.all(
    instances.map(async ({ cfg }) => ({
      prices: await fetchStandardSellingCandidates(cfg, today),
      rules: await fetchFinalDiscountRules(cfg),
    })),
  );

  const candidates = new Map<string, PriceCandidate>();
  const discountPercentBySku = new Map<string, number>();
  for (const part of perInstance) {
    mergePriceCandidates(candidates, part.prices);
    for (const row of part.rules) {
      if (!isItemCodeSellingRule(row) || !ruleAppliesOnDate(row, today)) continue;
      const sku = row.item_code?.trim();
      const pct = rulePercent(row);
      if (!sku || pct == null) continue;
      const key = normalizeSkuKey(sku);
      discountPercentBySku.set(key, Math.max(discountPercentBySku.get(key) ?? 0, pct));
    }
  }

  const standardPriceBySku = new Map<string, number>();
  for (const [sku, candidate] of candidates) {
    if (candidate.rate > 0) standardPriceBySku.set(normalizeSkuKey(sku), candidate.rate);
  }
  return { standardPriceBySku, discountPercentBySku };
}
const cache = new Map<string, SalesBudgetErpData>();
const inFlight = new Map<string, Promise<SalesBudgetErpData>>();

async function buildErpData(companyId: string, skus: string[]): Promise<SalesBudgetErpData> {
  const instances = await getAllOsfErpInstances(companyId);
  const slots = resolveErpSlots(instances);
  const erp1 = instances.find((i) => i.id === slots.erp1?.id) ?? null;
  const erp2 = instances.find((i) => i.id === slots.erp2?.id) ?? null;

  const [balances, erp1TaxBySku, erp2TaxBySku, pricing] = await Promise.all([
    instances.length > 0 ? getLiveStockBalances(companyId) : Promise.resolve([]),
    erp1 ? fetchErpTaxStatusBySkus(erp1.cfg, skus) : Promise.resolve(new Map<string, string | null>()),
    erp2 ? fetchErpTaxStatusBySkus(erp2.cfg, skus) : Promise.resolve(new Map<string, string | null>()),
    loadPricing(instances),
  ]);

  const stockBySku = new Map<string, Map<string, number>>();
  for (const row of balances) {
    const key = normalizeSkuKey(row.sku);
    const byWarehouse = stockBySku.get(key) ?? new Map<string, number>();
    byWarehouse.set(row.warehouse, (byWarehouse.get(row.warehouse) ?? 0) + row.qty);
    stockBySku.set(key, byWarehouse);
  }

  return { stockBySku, erp1TaxBySku, erp2TaxBySku, ...pricing, fetchedAt: new Date() };
}

/**
 * Cached ERP data; `refresh` regenerates the stock report and reloads tax status.
 * `skus` = catalog SKUs to read tax status for.
 */
export async function getSalesBudgetErpData(
  companyId: string,
  skus: string[],
  options: { refresh?: boolean } = {},
): Promise<SalesBudgetErpData> {
  const cached = cache.get(companyId);
  if (!options.refresh && cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
    return cached;
  }

  const existing = inFlight.get(companyId);
  if (existing) return existing;

  const promise = buildErpData(companyId, skus)
    .then((data) => {
      cache.set(companyId, data);
      return data;
    })
    .finally(() => inFlight.delete(companyId));
  inFlight.set(companyId, promise);
  return promise;
}
