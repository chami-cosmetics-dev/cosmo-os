import { getMerchantCouponCode } from "@/lib/order-merchant-coupon";
import { getDiscountCouponCode } from "@/lib/shopify-discount-codes";

export type ErpCouponApiConfig = {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
};

function authHeaders(cfg: ErpCouponApiConfig): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `token ${cfg.apiKey}:${cfg.apiSecret}`,
  };
}

async function erpDocumentExists(
  cfg: ErpCouponApiConfig,
  doctype: string,
  name: string,
): Promise<boolean> {
  const base = cfg.baseUrl.replace(/\/$/, "");
  const res = await fetch(
    `${base}/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`,
    { headers: authHeaders(cfg) },
  );
  return res.ok;
}

async function listErpDocuments(
  cfg: ErpCouponApiConfig,
  doctype: string,
  filters: unknown[],
  fields: string[],
  limit = 5,
): Promise<Array<{ name: string }>> {
  const base = cfg.baseUrl.replace(/\/$/, "");
  const f = encodeURIComponent(JSON.stringify(filters));
  const fl = encodeURIComponent(JSON.stringify(fields));
  const res = await fetch(
    `${base}/api/resource/${encodeURIComponent(doctype)}?filters=${f}&fields=${fl}&limit_page_length=${limit}`,
    { headers: authHeaders(cfg) },
  );
  if (!res.ok) return [];
  const json = (await res.json()) as { data?: Array<{ name: string }> };
  return json.data ?? [];
}

/** Resolve ERP Coupon Code document name (case-insensitive). */
export async function resolveErpCouponCodeDocument(
  cfg: ErpCouponApiConfig,
  discountCode: string,
): Promise<string | null> {
  const trimmed = discountCode.trim();
  if (!trimmed) return null;

  for (const candidate of [trimmed, trimmed.toUpperCase(), trimmed.toLowerCase()]) {
    if (await erpDocumentExists(cfg, "Coupon Code", candidate)) return candidate;
  }

  const exactMatches = await listErpDocuments(
    cfg,
    "Coupon Code",
    [["name", "=", trimmed]],
    ["name"],
    5,
  );
  if (exactMatches.length === 1) return exactMatches[0].name;

  const lowered = trimmed.toLowerCase();
  const prefixMatches = await listErpDocuments(
    cfg,
    "Coupon Code",
    [["name", "like", `${trimmed}%`]],
    ["name"],
    20,
  );
  const caseInsensitive = prefixMatches.filter((row) => row.name.toLowerCase() === lowered);
  if (caseInsensitive.length === 1) return caseInsensitive[0].name;
  if (caseInsensitive.length > 1) {
    console.warn(
      `[ERPNext] Ambiguous Coupon Code matches for "${trimmed}": ${caseInsensitive.map((r) => r.name).join(", ")}`,
    );
  }

  return null;
}

/** Find Coupon Code document linked to a Pricing Rule (e.g. PRLE-0010 → SV20). */
export async function resolveErpCouponCodeFromPricingRule(
  cfg: ErpCouponApiConfig,
  pricingRuleName: string,
): Promise<string | null> {
  const rule = pricingRuleName.trim();
  if (!rule) return null;

  const matches = await listErpDocuments(
    cfg,
    "Coupon Code",
    [["pricing_rule", "=", rule]],
    ["name"],
    5,
  );
  if (matches.length === 1) return matches[0].name;
  return null;
}

/**
 * Shopify sends short MER codes (e.g. MER99); ERP Sales Person uses MER99-Name.
 */
export async function resolveErpSalesPersonForMerchantCode(
  cfg: ErpCouponApiConfig,
  shortCode: string,
): Promise<string | null> {
  const code = shortCode.trim();
  if (!code) return null;

  if (await erpDocumentExists(cfg, "Sales Person", code)) return code;

  const prefixMatches = await listErpDocuments(
    cfg,
    "Sales Person",
    [["name", "like", `${code}-%`]],
    ["name"],
    10,
  );
  const strict = prefixMatches.filter(
    (row) => row.name === code || row.name.startsWith(`${code}-`),
  );
  if (strict.length === 1) return strict[0].name;
  if (strict.length > 1) {
    console.warn(
      `[ERPNext] Ambiguous Sales Person matches for "${code}": ${strict.map((r) => r.name).join(", ")}`,
    );
    return null;
  }

  return null;
}

function normalizePaymentGateways(
  paymentGatewayPrimary?: string | null,
  paymentGatewayNames?: string[] | null,
): string[] {
  return [paymentGatewayPrimary, ...(paymentGatewayNames ?? [])]
    .map((g) => g?.trim().toLowerCase() ?? "")
    .filter(Boolean);
}

function isCodPaymentGateway(gateways: string[]): boolean {
  return gateways.some(
    (g) =>
      g.includes("cod") ||
      g.includes("cash on delivery") ||
      g.includes("cash payment on delivery"),
  );
}

/** CODHO* coupons are COD-only in ERP; prepaid gateways use SPVL5 instead. */
export function remapShopifyDiscountCodeForErpPayment(
  discountCode: string,
  paymentGatewayPrimary?: string | null,
  paymentGatewayNames?: string[] | null,
): string {
  const code = discountCode.trim();
  if (!code) return code;

  const gateways = normalizePaymentGateways(paymentGatewayPrimary, paymentGatewayNames);
  if (gateways.length === 0 || isCodPaymentGateway(gateways)) return code;

  if (code.toUpperCase().startsWith("CODHO")) return "SPVL5";
  return code;
}

export type ResolvedErpSalesInvoiceCoupons = {
  couponCode: string | null;
  merchantSalesPerson: string | null;
  /** Shopify discount code label (e.g. LOYALCS2), even when ERP coupon_code is omitted. */
  discountCodeLabel: string | null;
};

/**
 * Map Shopify discount_codes to ERP Sales Invoice coupon fields.
 * Discount codes → Coupon Code doctype (`coupon_code`).
 * MER / tracking codes → Sales Person (`custom_merchant_coupon_code`).
 */
export async function resolveErpSalesInvoiceCouponFields(
  cfg: ErpCouponApiConfig,
  params: {
    sourceName?: string | null;
    discountCodes: unknown;
    rawPayload?: unknown;
    assignedMerchantCouponCodes?: string[] | null;
    paymentGatewayPrimary?: string | null;
    paymentGatewayNames?: string[] | null;
  },
): Promise<ResolvedErpSalesInvoiceCoupons> {
  const merchantShortCode = getMerchantCouponCode({
    sourceName: params.sourceName,
    discountCodes: params.discountCodes,
    rawPayload: params.rawPayload ?? null,
    assignedMerchantCouponCodes: params.assignedMerchantCouponCodes ?? null,
  });
  const discountCode = getDiscountCouponCode(params.discountCodes);
  const erpDiscountCode = discountCode
    ? remapShopifyDiscountCodeForErpPayment(
        discountCode,
        params.paymentGatewayPrimary,
        params.paymentGatewayNames,
      )
    : null;

  let couponCode: string | null = null;
  if (erpDiscountCode) {
    couponCode = await resolveErpCouponCodeDocument(cfg, erpDiscountCode);
    if (!couponCode) {
      console.warn(
        `[ERPNext] Discount coupon "${erpDiscountCode}" not found in ERP Coupon Code — omitting coupon_code`,
      );
    }
  }

  let merchantSalesPerson: string | null = null;
  if (merchantShortCode) {
    merchantSalesPerson = await resolveErpSalesPersonForMerchantCode(cfg, merchantShortCode);
    if (!merchantSalesPerson) {
      console.warn(
        `[ERPNext] Merchant code "${merchantShortCode}" not found in Sales Person — omitting custom_merchant_coupon_code`,
      );
    }
  }

  return {
    couponCode,
    merchantSalesPerson,
    discountCodeLabel: discountCode,
  };
}
