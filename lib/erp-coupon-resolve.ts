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

export type ResolvedErpSalesInvoiceCoupons = {
  couponCode: string | null;
  merchantSalesPerson: string | null;
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
  },
): Promise<ResolvedErpSalesInvoiceCoupons> {
  const merchantShortCode = getMerchantCouponCode({
    sourceName: params.sourceName,
    discountCodes: params.discountCodes,
    rawPayload: params.rawPayload ?? null,
    assignedMerchantCouponCodes: params.assignedMerchantCouponCodes ?? null,
  });
  const discountCode = getDiscountCouponCode(params.discountCodes);

  let couponCode: string | null = null;
  if (discountCode) {
    if (await erpDocumentExists(cfg, "Coupon Code", discountCode)) {
      couponCode = discountCode;
    } else {
      console.warn(
        `[ERPNext] Discount coupon "${discountCode}" not found in ERP Coupon Code — omitting coupon_code`,
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

  return { couponCode, merchantSalesPerson };
}
