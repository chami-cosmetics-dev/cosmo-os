import {
  applyBestDiscountToProductItems,
  computedTotalsMatchShopify,
  productItemsTotal,
} from "@/lib/erp-best-discount";
import type { ErpCouponApiConfig } from "@/lib/erp-coupon-resolve";
import type { ErpSalesInvoiceItem } from "@/lib/erp-shopify-invoice-items";

function authHeaders(cfg: ErpCouponApiConfig): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `token ${cfg.apiKey}:${cfg.apiSecret}`,
  };
}

async function erpGetJson<T>(cfg: ErpCouponApiConfig, path: string): Promise<T | null> {
  const base = cfg.baseUrl.replace(/\/$/, "");
  const res = await fetch(`${base}${path}`, { headers: authHeaders(cfg) });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ERPNext GET ${path} [${res.status}]: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

function ruleAppliesOnDate(
  row: { valid_from?: string | null; valid_upto?: string | null },
  asOfDate: string,
): boolean {
  const from = row.valid_from?.trim() || null;
  const until = row.valid_upto?.trim() || null;
  if (from && asOfDate < from) return false;
  if (until && asOfDate > until) return false;
  return true;
}

function companyMatches(rowCompany: string | null | undefined, company: string): boolean {
  const value = rowCompany?.trim() ?? "";
  if (!value) return true;
  return value === company.trim();
}

export async function fetchCouponDiscountPercent(
  cfg: ErpCouponApiConfig,
  pricingRuleName: string | null,
): Promise<number> {
  const name = pricingRuleName?.trim();
  if (!name) return 0;
  const json = await erpGetJson<{
    data?: { discount_percentage?: number | string | null; rate_or_discount?: string | null };
  }>(
    cfg,
    `/api/resource/${encodeURIComponent("Pricing Rule")}/${encodeURIComponent(name)}?fields=${encodeURIComponent(
      JSON.stringify(["discount_percentage", "rate_or_discount"]),
    )}`,
  );
  if ((json?.data?.rate_or_discount ?? "Discount Percentage") !== "Discount Percentage") return 0;
  const pct = Number(json?.data?.discount_percentage);
  return Number.isFinite(pct) && pct > 0 ? pct : 0;
}

type ItemCodeRuleRow = {
  name?: string;
  disable?: number | boolean;
  coupon_code_based?: number | boolean;
  valid_from?: string | null;
  valid_upto?: string | null;
  company?: string | null;
  discount_percentage?: number | string | null;
  item_code?: string | null;
};

export async function fetchItemCodePromoPercents(
  cfg: ErpCouponApiConfig,
  skus: string[],
  asOfDate: string,
  company: string,
): Promise<Map<string, number>> {
  const unique = [...new Set(skus.map((sku) => sku.trim()).filter(Boolean))];
  const out = new Map<string, number>();
  if (unique.length === 0) return out;

  const fields = JSON.stringify([
    "name",
    "disable",
    "coupon_code_based",
    "valid_from",
    "valid_upto",
    "company",
    "discount_percentage",
    "`tabPricing Rule Item Code`.item_code",
  ]);
  const filters = JSON.stringify([
    ["disable", "=", 0],
    ["selling", "=", 1],
    ["apply_on", "=", "Item Code"],
    ["coupon_code_based", "=", 0],
    ["Pricing Rule Item Code", "item_code", "in", unique],
  ]);
  const json = await erpGetJson<{ data?: ItemCodeRuleRow[] }>(
    cfg,
    `/api/resource/${encodeURIComponent("Pricing Rule")}?fields=${encodeURIComponent(fields)}&filters=${encodeURIComponent(filters)}&limit_page_length=500`,
  );

  for (const row of json?.data ?? []) {
    if (row.coupon_code_based === 1 || row.coupon_code_based === true) continue;
    if (row.disable === 1 || row.disable === true) continue;
    if (!companyMatches(row.company, company)) continue;
    if (!ruleAppliesOnDate(row, asOfDate)) continue;
    const sku = row.item_code?.trim();
    if (!sku) continue;
    const pct = Number(row.discount_percentage);
    if (!Number.isFinite(pct) || pct <= 0) continue;
    const prev = out.get(sku) ?? 0;
    if (pct > prev) out.set(sku, pct);
  }
  return out;
}

type ItemPriceRow = {
  item_code?: string | null;
  price_list_rate?: number | string | null;
  valid_from?: string | null;
  valid_upto?: string | null;
  modified?: string | null;
  customer?: string | null;
};

export async function fetchStandardSellingRates(
  cfg: ErpCouponApiConfig,
  skus: string[],
  asOfDate: string,
): Promise<Map<string, number>> {
  const unique = [...new Set(skus.map((sku) => sku.trim()).filter(Boolean))];
  const out = new Map<string, { rate: number; validFrom: string; modified: string }>();
  if (unique.length === 0) return new Map();

  const fields = JSON.stringify([
    "item_code",
    "price_list_rate",
    "valid_from",
    "valid_upto",
    "modified",
    "customer",
  ]);
  const filters = JSON.stringify([
    ["price_list", "=", "Standard Selling"],
    ["selling", "=", 1],
    ["item_code", "in", unique],
  ]);
  const json = await erpGetJson<{ data?: ItemPriceRow[] }>(
    cfg,
    `/api/resource/${encodeURIComponent("Item Price")}?fields=${encodeURIComponent(fields)}&filters=${encodeURIComponent(filters)}&limit_page_length=500`,
  );

  for (const row of json?.data ?? []) {
    const sku = row.item_code?.trim();
    if (!sku || row.customer?.trim()) continue;
    if (!ruleAppliesOnDate(row, asOfDate)) continue;
    const rate = Number(row.price_list_rate);
    if (!Number.isFinite(rate) || rate <= 0) continue;
    const next = {
      rate,
      validFrom: row.valid_from?.trim() || "",
      modified: row.modified?.trim() || "",
    };
    const prev = out.get(sku);
    if (
      !prev ||
      next.validFrom > prev.validFrom ||
      (next.validFrom === prev.validFrom && next.modified > prev.modified)
    ) {
      out.set(sku, next);
    }
  }

  return new Map([...out.entries()].map(([sku, row]) => [sku, row.rate]));
}

export type CouponInvoiceItemPricing = {
  items: ErpSalesInvoiceItem[];
  usedBestDiscount: boolean;
  couponPercent: number;
};

/**
 * Price coupon invoices as max(coupon %, tabloid %) off Standard Selling.
 * If that grand total drifts from Shopify (customer already paid), keep Shopify nets.
 * Caller must not send coupon_code / pricing_rules on create — ERP would reprice.
 */
export async function resolveCouponInvoiceItemRates(input: {
  cfg: ErpCouponApiConfig;
  productItems: ErpSalesInvoiceItem[];
  netFallbackItems: ErpSalesInvoiceItem[];
  pricingRule: string | null;
  company: string;
  asOfDate: string;
  shopifyGrandTotal: number;
  shippingAmt: number;
}): Promise<CouponInvoiceItemPricing> {
  const skus = input.productItems.map((item) => item.item_code).filter(Boolean);
  try {
    const [couponPercent, itemPromoBySku, listRateBySku] = await Promise.all([
      fetchCouponDiscountPercent(input.cfg, input.pricingRule),
      fetchItemCodePromoPercents(input.cfg, skus, input.asOfDate, input.company),
      fetchStandardSellingRates(input.cfg, skus, input.asOfDate),
    ]);

    const computed = applyBestDiscountToProductItems(input.productItems, {
      couponPercent,
      itemPromoBySku,
      listRateBySku,
    });
    const computedGrand = productItemsTotal(computed) + (input.shippingAmt > 0 ? input.shippingAmt : 0);
    if (couponPercent <= 0 && itemPromoBySku.size === 0) {
      return { items: input.netFallbackItems, usedBestDiscount: false, couponPercent };
    }
    if (!computedTotalsMatchShopify(computedGrand, input.shopifyGrandTotal)) {
      console.warn(
        `[ERPNext] Best-discount total ${computedGrand} != Shopify ${input.shopifyGrandTotal} — keeping Shopify nets`,
      );
      return { items: input.netFallbackItems, usedBestDiscount: false, couponPercent };
    }
    console.log(
      `[ERPNext] Best discount coupon=${couponPercent}% tabloidSkus=${itemPromoBySku.size} grand=${computedGrand}`,
    );
    return { items: computed, usedBestDiscount: true, couponPercent };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[ERPNext] Best-discount lookup failed — keeping Shopify nets: ${msg.slice(0, 200)}`);
    return { items: input.netFallbackItems, usedBestDiscount: false, couponPercent: 0 };
  }
}

/** Coupon code on create retriggers ERP pricing. Keep a label only. */
export function couponFieldsForInvoiceCreate(
  fields: Record<string, string>,
  discountCodeLabel: string | null,
): Record<string, string> {
  const { coupon_code: _coupon, ...rest } = fields;
  const label = discountCodeLabel?.trim() || fields.coupon_code?.trim() || "";
  if (label && !rest.custom_coupon_code) {
    rest.custom_coupon_code = label;
  }
  return rest;
}
