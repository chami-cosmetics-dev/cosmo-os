import type { Order, CompanyLocation, ErpnextInstance } from "@prisma/client";
import type { ShopifyOrderWebhookPayload } from "@/lib/validation/shopify-order";
import { prisma } from "@/lib/prisma";
import { ERP_SYNC_SUCCESS_CLEAR } from "@/lib/failed-erp-sync-auto-retry";
import { buildPhoneLookupVariants, canonicalPhoneForErpCustomerId } from "@/lib/phone-lookup";
import {
  erpShopifySyncSkipLogMessage,
  getErpShopifySyncSkipReason,
} from "@/lib/erp-shopify-sync-eligibility";
import { LIMITS } from "@/lib/validation";
import { resolveErpSalesInvoiceCouponFields } from "@/lib/erp-coupon-resolve";
import {
  buildErpItemsFromShopifyLineItems,
  sumErpInvoiceItemsTotal,
  type ErpSalesInvoiceItem,
} from "@/lib/erp-shopify-invoice-items";
import { resolveShopifyShippingLineTotal } from "@/lib/order-shipping-display";
import { orderHasFreeShippingCoupon } from "@/lib/shopify-discount-codes";

function resolveOrderShippingAmountForErp(input: {
  discountCodes?: unknown;
  shippingLines?: unknown;
  totalShipping?: { toString(): string } | string | number | null;
}): number {
  if (orderHasFreeShippingCoupon(input.discountCodes)) return 0;
  const fromLines = resolveShopifyShippingLineTotal(input.shippingLines);
  if (fromLines > 0) return fromLines;
  const stored = input.totalShipping != null ? parseFloat(String(input.totalShipping)) : 0;
  return Number.isFinite(stored) && stored > 0 ? stored : 0;
}

export type LocationWithErpInstance = CompanyLocation & {
  erpnextInstance: ErpnextInstance | null;
};

type ErpConfig = {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
  cashMop: string;
  codMop: string;
  cardDeliveryMop: string;
  bankTransferMop: string;
  kokoMop: string;
  webxpayMop: string;
  taxesAndCharges: string;
  shippingRule: string;
  shippingItem: string;
  shippingChargeAccount: string;
};

export function getErpConfig(instance: ErpnextInstance | null): ErpConfig {
  return {
    baseUrl: (instance?.baseUrl ?? process.env.ERPNEXT_BASE_URL ?? "").replace(/\/$/, ""),
    apiKey: instance?.apiKey ?? process.env.ERPNEXT_API_KEY ?? "",
    apiSecret: instance?.apiSecret ?? process.env.ERPNEXT_API_SECRET ?? "",
    cashMop: instance?.cashMop ?? process.env.ERPNEXT_CASH_MOP ?? "Cash",
    codMop: instance?.codMop ?? process.env.ERPNEXT_COD_MOP ?? "Cash On Delivery",
    cardDeliveryMop: instance?.cardDeliveryMop ?? process.env.ERPNEXT_CARD_DELIVERY_MOP ?? "Credit Card",
    bankTransferMop: instance?.bankTransferMop ?? process.env.ERPNEXT_BANK_TRANSFER_MOP ?? "Wire Transfer",
    kokoMop: instance?.kokoMop ?? process.env.ERPNEXT_KOKO_MOP ?? "Koko",
    webxpayMop: instance?.webxpayMop ?? process.env.ERPNEXT_WEBXPAY_MOP ?? "",
    taxesAndCharges: instance?.taxesAndCharges ?? process.env.ERPNEXT_TAXES_AND_CHARGES ?? "",
    shippingRule: instance?.shippingRule ?? process.env.ERPNEXT_SHIPPING_RULE ?? "",
    shippingItem: instance?.shippingItem ?? process.env.ERPNEXT_SHIPPING_ITEM ?? "",
    shippingChargeAccount: instance?.shippingChargeAccount ?? process.env.ERPNEXT_SHIPPING_CHARGE_ACCOUNT ?? "",
  };
}

function authHeaders(cfg: ErpConfig): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `token ${cfg.apiKey}:${cfg.apiSecret}`,
  };
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ERPNext stores posting_date/posting_time as naive datetimes in Asia/Colombo timezone.
// Sending UTC time causes NegativeStockError when stock was added earlier the same day
// (ERPNext sees the SI as posted before the stock entry).
function toColomboDT(): { date: string; time: string } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}:${get("second")}`,
  };
}

type ShopifyAddress = {
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  country?: string | null;
  zip?: string | null;
  phone?: string | null;
} | null | undefined;

function formatAddressHtml(addr: ShopifyAddress): string | null {
  if (!addr) return null;
  const fullName = addr.name?.trim() || [addr.first_name, addr.last_name].filter(Boolean).join(" ").trim();
  const lines: string[] = [];
  if (fullName) lines.push(fullName);
  if (addr.address1) lines.push(addr.address1);
  if (addr.address2) lines.push(addr.address2);
  const cityLine = [addr.city, addr.province, addr.zip].filter(Boolean).join(", ");
  if (cityLine) lines.push(cityLine);
  if (addr.country) lines.push(addr.country);
  if (addr.phone) lines.push(addr.phone);
  return lines.length > 0 ? lines.join("<br>") : null;
}

function resolveErpPaymentType(cfg: ErpConfig, gateways: string[]): string | null {
  for (const g of gateways) {
    const lower = g.toLowerCase().trim();
    if (lower.includes("koko")) return cfg.kokoMop;
    if (lower.includes("webxpay")) return cfg.webxpayMop || null;
    if (lower === "cc" || lower === "cc checkout") return cfg.bankTransferMop;
    if (lower.includes("credit card") || lower.includes("card delivery") || lower.includes("card payment")) return cfg.cardDeliveryMop;
    if (lower.includes("bank transfer") || lower.includes("bank draft") || lower.includes("wire")) return cfg.bankTransferMop;
    if (lower.includes("cash on delivery") || lower === "cod") return cfg.codMop;
    if (lower.includes("cash")) return cfg.cashMop;
  }
  // Return null for unrecognised gateways — passing an unknown value to ERPNext's
  // custom_payment_type Link field causes a LinkValidationError.
  if (gateways.length > 0) {
    console.warn(`[ERPNext] resolveErpPaymentType: no mapping for gateways ${JSON.stringify(gateways)} — custom_payment_type will be omitted`);
  }
  return null;
}

/** Mode of payment for prepaid gateways (Koko, WebXPay, cc checkout, bank transfer). */
function resolvePrepaidMop(cfg: ErpConfig, gateways: string[]): string | null {
  const lower = gateways.map((g) => g.toLowerCase().trim());
  if (lower.some((g) => g.includes("koko"))) return cfg.kokoMop;
  if (cfg.webxpayMop && lower.some((g) => g.includes("webxpay"))) return cfg.webxpayMop;
  if (lower.some((g) => g === "cc" || g === "cc checkout")) return cfg.bankTransferMop;
  if (lower.some((g) => g.includes("bank"))) return cfg.bankTransferMop;
  return null;
}

async function ensureErpAddress(
  cfg: ErpConfig,
  customerName: string,
  addr: ShopifyAddress,
  addrType: "Billing" | "Shipping",
): Promise<string | null> {
  if (!addr) return null;
  const address1 = addr.address1?.trim() ?? null;
  const city = addr.city?.trim() ?? null;
  if (!address1 && !city) return null;

  try {
    // Find existing address by title — link-based child-table filters are not supported in all ERPNext versions
    const filter = encodeURIComponent(
      JSON.stringify([["address_title", "=", `${customerName}-${addrType}`]]),
    );
    const fields = encodeURIComponent(JSON.stringify(["name"]));
    const existing = await erpnextGet<Array<{ name: string }>>(
      cfg,
      `/api/resource/Address?filters=${filter}&fields=${fields}&limit=1`,
    );
    if (existing && existing.length > 0) return existing[0].name;

    // Create new Address document
    const newAddr = await erpnextPost<{ name: string }>(cfg, "/api/resource/Address", {
      doctype: "Address",
      address_title: `${customerName}-${addrType}`,
      address_type: addrType,
      address_line1: address1 ?? "N/A",
      address_line2: addr.address2?.trim() || null,
      city: city ?? "N/A",
      state: addr.province?.trim() || null,
      country: addr.country?.trim() || "Sri Lanka",
      pincode: addr.zip?.trim() || null,
      phone: addr.phone?.trim() || null,
      is_primary_address: addrType === "Billing" ? 1 : 0,
      is_shipping_address: addrType === "Shipping" ? 1 : 0,
      links: [{ link_doctype: "Customer", link_name: customerName }],
    });
    return newAddr.name;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Extract status code from "ERPNext GET ... [STATUS]: body" format
    const statusMatch = msg.match(/\[(\d+)\]:/);
    const summary = statusMatch
      ? `HTTP ${statusMatch[1]} — ${msg.slice(msg.indexOf("]:") + 2).trim().slice(0, 150)}`
      : msg.slice(0, 200);
    console.warn(`[ERPNext] Could not create ${addrType} address for "${customerName}": ${summary}`);
    return null;
  }
}

async function erpnextPost<T>(cfg: ErpConfig, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method: "POST",
    headers: authHeaders(cfg),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ERPNext POST ${path} [${res.status}]: ${text.slice(0, 500)}`);
  }
  const json = (await res.json()) as { data: T };
  return json.data;
}

async function erpnextGet<T>(cfg: ErpConfig, path: string): Promise<T | null> {
  const res = await fetch(`${cfg.baseUrl}${path}`, { headers: authHeaders(cfg) });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ERPNext GET ${path} [${res.status}]: ${text.slice(0, 500)}`);
  }
  const json = (await res.json()) as { data: T };
  return json.data;
}

type ErpSalesInvoiceCreateResult = { name: string; debit_to: string; grand_total: number };

type CreateErpSalesInvoiceOpts = {
  /** Header discount when coupon_code cannot be applied on the SI. */
  discountFallback?: number;
  /** Shopify coupon label to store on custom_coupon_code when coupon_code is stripped. */
  couponLabel?: string | null;
  /** Net-rate line items for coupon retry after ERP rejects list-rate + coupon_code. */
  netRateItems?: ErpSalesInvoiceItem[];
  /** Internal guard: prevents the merchant-coupon retry handler from firing recursively. */
  skipMerchantRetry?: boolean;
  /** Internal guard: prevents the custom_payment_type fallback retry from firing recursively. */
  skipPaymentTypeRetry?: boolean;
};

function withCouponDiscountFallback(
  body: Record<string, unknown>,
  opts?: CreateErpSalesInvoiceOpts,
  couponLabel?: string | null,
): Record<string, unknown> {
  const retryBody: Record<string, unknown> = { ...body };
  const fallback = opts?.discountFallback ?? 0;
  if (fallback > 0 && retryBody.discount_amount == null) {
    retryBody.discount_amount = fallback;
    retryBody.apply_discount_on = "Net Total";
  }
  const label = couponLabel ?? opts?.couponLabel ?? null;
  if (label && !retryBody.custom_coupon_code) {
    retryBody.custom_coupon_code = label;
  }
  return retryBody;
}

async function erpnextSaveSalesInvoice(
  cfg: ErpConfig,
  name: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const doc = await erpnextGet<Record<string, unknown>>(
    cfg,
    `/api/resource/Sales Invoice/${encodeURIComponent(name)}`,
  );
  if (!doc) throw new Error(`Sales Invoice ${name} not found`);

  const res = await fetch(`${cfg.baseUrl}/api/resource/Sales Invoice/${encodeURIComponent(name)}`, {
    method: "PUT",
    headers: authHeaders(cfg),
    body: JSON.stringify({ ...doc, ...patch }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ERPNext PUT Sales Invoice ${name} [${res.status}]: ${text.slice(0, 500)}`);
  }
}

async function erpnextSubmitSalesInvoice(cfg: ErpConfig, name: string): Promise<void> {
  const path = `/api/resource/Sales Invoice/${encodeURIComponent(name)}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const doc = await erpnextGet<Record<string, unknown>>(cfg, path);
    if (!doc) throw new Error(`Sales Invoice ${name} not found before submit`);

    const res = await fetch(`${cfg.baseUrl}/api/method/frappe.client.submit`, {
      method: "POST",
      headers: authHeaders(cfg),
      body: JSON.stringify({ doc: { ...doc, doctype: "Sales Invoice" } }),
    });

    if (res.ok) return;

    const text = await res.text().catch(() => "");
    if (text.includes("TimestampMismatchError") && attempt < 3) {
      console.warn(`[ERPNext] SI ${name} submit timestamp mismatch — retry ${attempt}/3`);
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
      continue;
    }

    throw new Error(`ERPNext submit Sales Invoice ${name} [${res.status}]: ${text.slice(0, 500)}`);
  }
}

async function postErpSalesInvoiceCreate(
  cfg: ErpConfig,
  siBody: Record<string, unknown>,
  opts?: CreateErpSalesInvoiceOpts,
): Promise<ErpSalesInvoiceCreateResult> {
  try {
    return await erpnextPost<ErpSalesInvoiceCreateResult>(cfg, "/api/resource/Sales Invoice", siBody);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("417") && msg.includes("shipping_rule") && cfg.shippingRule) {
      console.warn("[ERPNext] SI creation failed — mandatory shipping_rule, retrying with rule:", msg.slice(0, 200));
      return erpnextPost<ErpSalesInvoiceCreateResult>(cfg, "/api/resource/Sales Invoice", {
        ...siBody,
        shipping_rule: cfg.shippingRule,
      });
    }
    if (!opts?.skipPaymentTypeRetry && msg.includes("417") && msg.includes("custom_payment_type") && !siBody.custom_payment_type) {
      console.warn(`[ERPNext] SI creation failed — custom_payment_type mandatory but unresolved, retrying with codMop fallback: ${msg.slice(0, 200)}`);
      return postErpSalesInvoiceCreate(cfg, { ...siBody, custom_payment_type: cfg.codMop }, { ...opts, skipPaymentTypeRetry: true });
    }
    if (!opts?.skipMerchantRetry && msg.includes("417") && (msg.includes("Merchant Coupon Code") || msg.includes("custom_merchant_coupon_code"))) {
      const originalMerchant = typeof siBody.custom_merchant_coupon_code === "string" && siBody.custom_merchant_coupon_code !== "SHOPIFY"
        ? siBody.custom_merchant_coupon_code
        : null;
      console.warn("[ERPNext] SI creation failed — Merchant Coupon Code invalid, retrying without it:", msg.slice(0, 200));
      const { custom_merchant_coupon_code: _merchant, ...withoutMerchant } = siBody;
      const retryOpts = { ...opts, skipMerchantRetry: true };
      try {
        return await postErpSalesInvoiceCreate(cfg, withoutMerchant, retryOpts);
      } catch (retryErr) {
        if (originalMerchant) {
          // Order has a real merchant — don't replace with SHOPIFY, propagate so it appears in failed sync
          console.warn(`[ERPNext] SI retry without merchant failed for real merchant "${originalMerchant}" — not falling back to SHOPIFY`);
          throw retryErr;
        }
        console.warn("[ERPNext] SI retry without merchant failed — falling back to SHOPIFY Sales Person");
        return postErpSalesInvoiceCreate(cfg, {
          ...withoutMerchant,
          custom_merchant_coupon_code: "SHOPIFY",
        }, retryOpts);
      }
    }
    if (msg.includes("417") && /coupon/i.test(msg) && "coupon_code" in siBody) {
      const couponLabel =
        (typeof siBody.coupon_code === "string" && siBody.coupon_code) ||
        opts?.couponLabel ||
        null;
      console.warn("[ERPNext] SI creation failed — coupon_code invalid, retrying with discount fallback:", msg.slice(0, 200));
      const { coupon_code: _coupon, ...withoutCoupon } = siBody;
      const retryBody = withCouponDiscountFallback(withoutCoupon, opts, couponLabel);
      if (opts?.netRateItems?.length) {
        retryBody.items = opts.netRateItems;
      }
      return postErpSalesInvoiceCreate(cfg, retryBody, opts);
    }
    if (msg.includes("417") && /coupon/i.test(msg) && "custom_coupon_code" in siBody) {
      console.warn("[ERPNext] SI creation failed — custom_coupon_code invalid, retrying without it:", msg.slice(0, 200));
      const { custom_coupon_code: _custom, ...withoutCustom } = siBody;
      return postErpSalesInvoiceCreate(
        cfg,
        withCouponDiscountFallback(withoutCustom, opts, opts?.couponLabel ?? null),
        opts,
      );
    }
    if (cfg.taxesAndCharges && msg.includes("417")) {
      console.warn("[ERPNext] SI creation failed — retrying without taxes_and_charges:", msg.slice(0, 200));
      const { taxes_and_charges: _t, ...siBodyClean } = siBody;
      return erpnextPost<ErpSalesInvoiceCreateResult>(cfg, "/api/resource/Sales Invoice", siBodyClean);
    }
    if (msg.includes("payment_terms") && !("payment_terms_template" in siBody)) {
      console.warn("[ERPNext] SI creation failed — payment_terms error (customer has broken template), retrying with cleared payment_terms_template:", msg.slice(0, 200));
      return postErpSalesInvoiceCreate(cfg, { ...siBody, payment_terms_template: "" }, opts);
    }
    throw err;
  }
}

async function createErpSalesInvoice(
  cfg: ErpConfig,
  siBody: Record<string, unknown>,
  opts?: CreateErpSalesInvoiceOpts,
): Promise<ErpSalesInvoiceCreateResult> {
  const submitNow = siBody.docstatus === 1;
  const couponCode = typeof siBody.coupon_code === "string" ? siBody.coupon_code.trim() : "";

  if (submitNow && couponCode) {
    console.log(`[ERPNext] Creating draft Sales Invoice with coupon ${couponCode} before submit`);
    try {
      const draft = await postErpSalesInvoiceCreate(cfg, { ...siBody, docstatus: 0 }, opts);
      await erpnextSaveSalesInvoice(cfg, draft.name, {
        coupon_code: couponCode,
        custom_coupon_code: couponCode,
      });
      const draftCheck = await erpnextGet<{ coupon_code?: string | null }>(
        cfg,
        `/api/resource/Sales Invoice/${encodeURIComponent(draft.name)}?fields=${encodeURIComponent(JSON.stringify(["coupon_code"]))}`,
      );
      console.log(
        `[ERPNext] Draft ${draft.name} coupon_code before submit: ${draftCheck?.coupon_code?.trim() || "(empty)"}`,
      );
      await erpnextSubmitSalesInvoice(cfg, draft.name);
      const submitted = await erpnextGet<{
        name: string;
        debit_to: string;
        grand_total: number;
        coupon_code?: string | null;
      }>(
        cfg,
        `/api/resource/Sales Invoice/${encodeURIComponent(draft.name)}?fields=${encodeURIComponent(JSON.stringify(["name", "debit_to", "grand_total", "coupon_code"]))}`,
      );
      if (!submitted) throw new Error(`Sales Invoice ${draft.name} missing after submit`);
      if (!submitted.coupon_code) {
        console.warn(`[ERPNext] SI ${draft.name} submitted but coupon_code is still empty`);
      }
      return {
        name: submitted.name,
        debit_to: submitted.debit_to,
        grand_total: submitted.grand_total,
      };
    } catch (draftErr) {
      const msg = draftErr instanceof Error ? draftErr.message : String(draftErr);
      throw new Error(`[ERPNext] Draft+submit coupon SI failed: ${msg.slice(0, 400)}`);
    }
  }

  return postErpSalesInvoiceCreate(cfg, siBody, opts);
}

async function buildErpSalesInvoiceCouponFields(
  cfg: ErpConfig,
  params: {
    sourceName?: string | null;
    discountCodes: unknown;
    rawPayload?: unknown;
    assignedMerchantCouponCodes?: string[] | null;
    paymentGatewayPrimary?: string | null;
    paymentGatewayNames?: string[] | null;
  },
): Promise<{ fields: Record<string, string>; discountCodeLabel: string | null }> {
  const resolved = await resolveErpSalesInvoiceCouponFields(cfg, params);
  const fields: Record<string, string> = {};
  if (resolved.couponCode) {
    fields.coupon_code = resolved.couponCode;
  } else if (resolved.discountCodeLabel) {
    fields.custom_coupon_code = resolved.discountCodeLabel;
  }
  if (resolved.merchantSalesPerson) {
    fields.custom_merchant_coupon_code = resolved.merchantSalesPerson;
  }
  return { fields, discountCodeLabel: resolved.discountCodeLabel };
}

async function erpnextSetDocumentField(
  cfg: ErpConfig,
  doctype: string,
  name: string,
  fieldname: string,
  value: string,
): Promise<boolean> {
  try {
    const form = new URLSearchParams({ doctype, name, fieldname, value });
    const res = await fetch(`${cfg.baseUrl}/api/method/frappe.client.set_value`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `token ${cfg.apiKey}:${cfg.apiSecret}`,
      },
      body: form.toString(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureErpSalesInvoiceCouponLabels(
  cfg: ErpConfig,
  invoiceName: string,
  couponCode: string,
): Promise<void> {
  const trimmed = couponCode.trim();
  if (!trimmed) return;

  const current = await erpnextGet<{
    coupon_code?: string | null;
    custom_coupon_code?: string | null;
  }>(
    cfg,
    `/api/resource/Sales Invoice/${encodeURIComponent(invoiceName)}?fields=${encodeURIComponent(JSON.stringify(["coupon_code", "custom_coupon_code"]))}`,
  );
  if (current?.coupon_code?.trim() && current?.custom_coupon_code?.trim()) return;

  for (const field of ["custom_coupon_code", "coupon_code"] as const) {
    const existing = current?.[field]?.trim();
    if (existing) continue;
    const ok = await erpnextSetDocumentField(cfg, "Sales Invoice", invoiceName, field, trimmed);
    if (ok) {
      console.log(`[ERPNext] Set ${field}=${trimmed} on Sales Invoice ${invoiceName}`);
    } else {
      console.warn(`[ERPNext] Could not set ${field} on Sales Invoice ${invoiceName}`);
    }
  }
}

async function erpnextSetCustomerField(
  cfg: ErpConfig,
  customerId: string,
  fieldname: string,
  value: string,
): Promise<boolean> {
  try {
    const form = new URLSearchParams({
      doctype: "Customer",
      name: customerId,
      fieldname,
      value,
    });
    const res = await fetch(`${cfg.baseUrl}/api/method/frappe.client.set_value`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `token ${cfg.apiKey}:${cfg.apiSecret}`,
      },
      body: form.toString(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function syncExistingErpCustomer(
  cfg: ErpConfig,
  existing: { name: string; customer_name?: string | null },
  displayName: string,
  canonicalMobile: string | null,
): Promise<string> {
  if (existing.customer_name && existing.customer_name !== displayName) {
    const ok = await erpnextSetCustomerField(cfg, existing.name, "customer_name", displayName);
    if (ok) {
      console.log(`[ERPNext] Updated customer_name "${existing.customer_name}" → "${displayName}"`);
    } else {
      console.warn(`[ERPNext] Could not update customer_name for "${existing.name}"`);
    }
  }

  if (canonicalMobile) {
    const ok = await erpnextSetCustomerField(cfg, existing.name, "mobile_no", canonicalMobile);
    if (!ok) {
      console.warn(`[ERPNext] Could not update mobile_no for "${existing.name}"`);
    }
  }

  return existing.name;
}

async function findErpCustomerByPhone(
  cfg: ErpConfig,
  phone: string,
): Promise<{ name: string; customer_name: string } | null> {
  const phoneVariants = buildPhoneLookupVariants(phone.trim()).slice(0, 20).map((v) => v.slice(0, LIMITS.mobile.max));
  if (phoneVariants.length === 0) return null;

  const phoneFilter = encodeURIComponent(JSON.stringify([["mobile_no", "in", phoneVariants]]));
  const byMobile = await erpnextGet<Array<{ name: string; customer_name: string }>>(
    cfg,
    `/api/resource/Customer?filters=${phoneFilter}&fields=${encodeURIComponent(JSON.stringify(["name", "customer_name"]))}&limit=1`,
  );
  if (byMobile && byMobile.length > 0) return byMobile[0];

  const phoneId = canonicalPhoneForErpCustomerId(phone);
  if (!phoneId) return null;

  const byName = await erpnextGet<{ name: string; customer_name?: string }>(
    cfg,
    `/api/resource/Customer/${encodeURIComponent(phoneId)}`,
  );
  if (!byName) return null;
  return { name: byName.name, customer_name: byName.customer_name ?? byName.name };
}

async function ensureCustomer(
  cfg: ErpConfig,
  customerName: string,
  email: string | null,
  phone: string | null,
  erpnextCompany: string,
): Promise<string> {
  const displayName = customerName.trim() || "Guest";
  const canonicalMobile = phone ? canonicalPhoneForErpCustomerId(phone) : null;

  // 1. Phone is primary — same name can map to different customers per number
  if (phone?.trim()) {
    const existing = await findErpCustomerByPhone(cfg, phone);
    if (existing) {
      console.log(`[ERPNext] Found existing customer by phone → "${existing.name}" (display: "${displayName}")`);
      return syncExistingErpCustomer(cfg, existing, displayName, canonicalMobile);
    }
  }

  // 2. No phone on order — fall back to legacy name match (guest / missing contact)
  if (!phone?.trim()) {
    const encoded = encodeURIComponent(displayName);
    const byName = await erpnextGet<{ name: string }>(cfg, `/api/resource/Customer/${encoded}`);
    if (byName) return byName.name;
  }

  // 3. Create — use canonical phone as ERP document name when available
  const erpCustomerId = canonicalMobile ?? displayName;
  const res = await fetch(`${cfg.baseUrl}/api/resource/Customer`, {
    method: "POST",
    headers: authHeaders(cfg),
    body: JSON.stringify({
      doctype: "Customer",
      ...(canonicalMobile ? { name: canonicalMobile } : {}),
      customer_name: displayName,
      customer_type: "Individual",
      customer_group: "Individual",
      territory: "All Territories",
      default_company: erpnextCompany,
      custom_total_purchasing_value: 0,
      ...(email ? { email_id: email } : {}),
      ...(canonicalMobile ? { mobile_no: canonicalMobile } : {}),
    }),
  });

  if (res.status === 409) {
    if (phone?.trim()) {
      const raced = await findErpCustomerByPhone(cfg, phone);
      if (raced) {
        return syncExistingErpCustomer(cfg, raced, displayName, canonicalMobile);
      }
    }
    console.log(`[ERPNext] Customer "${erpCustomerId}" already exists — skipping create`);
    return erpCustomerId;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ERPNext POST /api/resource/Customer [${res.status}]: ${text.slice(0, 500)}`);
  }

  return erpCustomerId;
}

async function createPrepaidPaymentEntry(
  cfg: ErpConfig,
  invoiceName: string,
  company: string,
  customerName: string,
  debitTo: string,
  totalAmount: number,
  dateStr: string,
  mopName: string,
): Promise<void> {
  const mop = await erpnextGet<{
    name: string;
    accounts: Array<{ company: string; default_account: string }>;
  }>(cfg, `/api/resource/Mode%20of%20Payment/${encodeURIComponent(mopName)}`);

  const paidTo = mop?.accounts?.find((a) => a.company === company)?.default_account;
  if (!paidTo) {
    throw new Error(`No account mapped for "${mopName}" mode of payment under company "${company}"`);
  }

  const pe = await erpnextPost<{ name: string }>(cfg, "/api/resource/Payment Entry", {
    doctype: "Payment Entry",
    payment_type: "Receive",
    company,
    posting_date: dateStr,
    mode_of_payment: mop.name,
    party_type: "Customer",
    party: customerName,
    paid_from: debitTo,
    paid_to: paidTo,
    reference_no: invoiceName,
    reference_date: dateStr,
    paid_amount: totalAmount,
    received_amount: totalAmount,
    source_exchange_rate: 1,
    target_exchange_rate: 1,
    references: [
      {
        reference_doctype: "Sales Invoice",
        reference_name: invoiceName,
        allocated_amount: totalAmount,
      },
    ],
    docstatus: 1,
  });

  console.log(`[ERPNext] Payment Entry ${pe.name} created for Sales Invoice ${invoiceName} (${mopName})`);
}

function detectDeliveryMop(
  cfg: ErpConfig,
  paymentGatewayPrimary: string | null,
  paymentGatewayNames: string[],
): string | null {
  const gateways = [paymentGatewayPrimary, ...paymentGatewayNames]
    .map((g) => g?.toLowerCase().trim() ?? "")
    .filter(Boolean);

  if (gateways.some((g) => g.includes("cash on delivery") || g === "cod")) {
    return cfg.codMop;
  }
  if (gateways.some((g) => g.includes("card payment on delivery") || g.includes("card on delivery") || g.includes("card_on_delivery"))) {
    return cfg.cardDeliveryMop;
  }
  if (gateways.some((g) => g === "cash" || g === "manual")) {
    return cfg.cashMop;
  }
  return null;
}

/** Resolve ERP Mode of Payment from Vault order payment gateways (invoice-complete default). */
export function resolveOrderPaymentMop(
  cfg: ErpConfig,
  paymentGatewayPrimary: string | null,
  paymentGatewayNames: string[],
): string | null {
  const gateways = [paymentGatewayPrimary, ...paymentGatewayNames].filter(Boolean) as string[];
  return (
    detectDeliveryMop(cfg, paymentGatewayPrimary, paymentGatewayNames) ??
    resolvePrepaidMop(cfg, gateways) ??
    resolveErpPaymentType(cfg, gateways)
  );
}

export type CreateDeliveryPaymentEntryOptions = {
  /** Explicit ERP Mode of Payment name (finance invoice-complete / PE retry). */
  mopNameOverride?: string;
  /** When true, throw if no MOP can be resolved (invoice complete / explicit retry). */
  requireMop?: boolean;
};

export async function createDeliveryPaymentEntry(
  order: {
    name: string | null;
    shopifyOrderId: string;
    sourceName: string | null;
    paymentGatewayPrimary: string | null;
    paymentGatewayNames: string[];
  },
  location: LocationWithErpInstance,
  completedAt: Date,
  options?: CreateDeliveryPaymentEntryOptions,
): Promise<void> {
  const cfg = getErpConfig(location.erpnextInstance);
  if (!cfg.baseUrl || !cfg.apiKey || !cfg.apiSecret) {
    if (options?.mopNameOverride) {
      throw new Error("ERPNext credentials are not configured for this location");
    }
    return;
  }
  if (!location.erpnextCompany) {
    if (options?.mopNameOverride) {
      throw new Error("ERPNext company is not configured for this location");
    }
    return;
  }

  const isErpOrder = order.sourceName?.startsWith("erpnext") ?? false;

  let mopName: string | null = options?.mopNameOverride?.trim() || null;
  if (!mopName) {
    mopName = resolveOrderPaymentMop(cfg, order.paymentGatewayPrimary, order.paymentGatewayNames);
    if (!mopName && isErpOrder) {
      mopName = cfg.codMop || null;
    }
  }
  if (!mopName) {
    if (options?.mopNameOverride) {
      throw new Error(`ERPNext Mode of Payment "${options.mopNameOverride}" is not configured`);
    }
    if (options?.requireMop) {
      throw new Error("No ERP payment mode matched for this order's payment method");
    }
    console.log(`[ERPNext] No delivery MOP matched for order ${order.name} — skipping PE`);
    return;
  }

  // ERP2: order.name IS the invoice name — look up directly by document name
  // Shopify/ERP1: look up by po_no (invoice was created by Vault OS with po_no = order name)
  let invoice: { name: string; outstanding_amount: number; debit_to: string; customer: string } | null = null;

  if (isErpOrder && order.name) {
    const fields = encodeURIComponent(JSON.stringify(["name", "outstanding_amount", "debit_to", "customer"]));
    invoice = await erpnextGet<{ name: string; outstanding_amount: number; debit_to: string; customer: string }>(
      cfg,
      `/api/resource/Sales Invoice/${encodeURIComponent(order.name)}?fields=${fields}`,
    );
    if (!invoice) {
      console.warn(`[ERPNext] Sales Invoice "${order.name}" not found in ERP — skipping delivery PE`);
      return;
    }
  } else {
    const orderPoNo = (order.name ?? order.shopifyOrderId).slice(0, 140);
    const filters = encodeURIComponent(
      JSON.stringify([
        ["po_no", "=", orderPoNo],
        ["company", "=", location.erpnextCompany],
        ["docstatus", "=", "1"],
      ]),
    );
    const fields = encodeURIComponent(
      JSON.stringify(["name", "outstanding_amount", "debit_to", "customer"]),
    );
    const list = await erpnextGet<
      Array<{ name: string; outstanding_amount: number; debit_to: string; customer: string }>
    >(cfg, `/api/resource/Sales Invoice?filters=${filters}&fields=${fields}&limit=1`);

    if (!list || list.length === 0) {
      console.warn(`[ERPNext] No submitted Sales Invoice for po_no="${orderPoNo}" — skipping delivery PE`);
      return;
    }
    invoice = list[0];
  }

  if (invoice.outstanding_amount <= 0) {
    console.log(`[ERPNext] Sales Invoice ${invoice.name} already fully paid — skipping delivery PE`);
    return;
  }

  const mop = await erpnextGet<{
    name: string;
    accounts: Array<{ company: string; default_account: string }>;
  }>(cfg, `/api/resource/Mode%20of%20Payment/${encodeURIComponent(mopName)}`);

  if (!mop) throw new Error(`ERPNext Mode of Payment "${mopName}" not found`);

  const paidTo = mop.accounts.find((a) => a.company === location.erpnextCompany)?.default_account;
  if (!paidTo) throw new Error(`No account mapped for "${mopName}" under company "${location.erpnextCompany}"`);

  const dateStr = toDateStr(completedAt);
  const pe = await erpnextPost<{ name: string }>(cfg, "/api/resource/Payment Entry", {
    doctype: "Payment Entry",
    payment_type: "Receive",
    company: location.erpnextCompany,
    posting_date: dateStr,
    mode_of_payment: mop.name,
    party_type: "Customer",
    party: invoice.customer,
    paid_from: invoice.debit_to,
    paid_to: paidTo,
    reference_no: invoice.name,
    reference_date: dateStr,
    paid_amount: invoice.outstanding_amount,
    received_amount: invoice.outstanding_amount,
    source_exchange_rate: 1,
    target_exchange_rate: 1,
    references: [
      {
        reference_doctype: "Sales Invoice",
        reference_name: invoice.name,
        allocated_amount: invoice.outstanding_amount,
      },
    ],
    docstatus: 1,
  });

  console.log(`[ERPNext] Delivery PE ${pe.name} created for Sales Invoice ${invoice.name} (${mopName})`);
}

/**
 * Create a credit note (return Sales Invoice) in ERPNext for an order whose
 * invoice_complete was reverted by a finance user. Non-fatal — caller must catch.
 */
export async function createErpnextCreditNote(
  order: { id: string; name: string | null; orderNumber: string | null; erpnextInvoiceId?: string | null },
  location: LocationWithErpInstance,
): Promise<{ creditNoteName: string }> {
  const cfg = getErpConfig(location.erpnextInstance);
  if (!cfg.baseUrl || !cfg.apiKey || !cfg.apiSecret) {
    throw new Error("[ERPNext] createErpnextCreditNote: ERP credentials not configured");
  }
  if (!location.erpnextCompany) {
    throw new Error("[ERPNext] createErpnextCreditNote: location has no erpnextCompany");
  }

  const orderName = order.name ?? order.orderNumber;
  if (!orderName) throw new Error("[ERPNext] createErpnextCreditNote: order has no name");

  // For ERP-native orders (erpnextInvoiceId set), the SI name IS the invoice id — fetch directly.
  // For Shopify-sourced orders, find the SI by po_no (Shopify order name stored there).
  let originalSiName: string;
  if (order.erpnextInvoiceId) {
    originalSiName = order.erpnextInvoiceId;
  } else {
    const filters = encodeURIComponent(
      JSON.stringify([
        ["po_no", "=", orderName],
        ["company", "=", location.erpnextCompany],
        ["docstatus", "=", "1"],
      ]),
    );
    const fields = encodeURIComponent(
      JSON.stringify(["name"]),
    );
    const list = await erpnextGet<Array<{ name: string }>>(
      cfg,
      `/api/resource/Sales Invoice?filters=${filters}&fields=${fields}&limit=1`,
    );
    if (!list || list.length === 0) {
      throw new Error(`[ERPNext] createErpnextCreditNote: no submitted SI found for po_no="${orderName}"`);
    }
    originalSiName = list[0].name;
  }

  // Fetch full SI document to get items, debit_to, and any custom mandatory fields
  const originalSi = await erpnextGet<{
    name: string;
    customer: string;
    debit_to: string;
    grand_total: number;
    custom_payment_type?: string | null;
    custom_merchant_coupon_code?: string | null;
    items: Array<{
      item_code: string;
      item_name?: string;
      description?: string;
      qty: number;
      rate: number;
      income_account?: string;
      cost_center?: string;
      uom?: string;
    }>;
  }>(cfg, `/api/resource/Sales Invoice/${encodeURIComponent(originalSiName)}`);

  if (!originalSi) {
    throw new Error(`[ERPNext] createErpnextCreditNote: could not fetch SI "${originalSiName}"`);
  }

  const today = toDateStr(new Date());
  const returnItems = originalSi.items.map((item) => ({
    item_code: item.item_code,
    item_name: item.item_name,
    description: item.description,
    qty: -Math.abs(item.qty),
    rate: item.rate,
    income_account: item.income_account,
    cost_center: item.cost_center,
    uom: item.uom,
  }));

  const creditNote = await erpnextPost<{ name: string }>(cfg, "/api/resource/Sales Invoice", {
    doctype: "Sales Invoice",
    is_return: 1,
    return_against: originalSiName,
    company: location.erpnextCompany,
    customer: originalSi.customer,
    debit_to: originalSi.debit_to,
    posting_date: today,
    po_no: orderName,
    items: returnItems,
    docstatus: 1,
    // Pass through custom mandatory fields from the original SI (e.g. Cosmetics.lk requires these)
    ...(originalSi.custom_payment_type ? { custom_payment_type: originalSi.custom_payment_type } : {}),
    ...(originalSi.custom_merchant_coupon_code ? { custom_merchant_coupon_code: originalSi.custom_merchant_coupon_code } : {}),
  });

  console.log(
    `[ERPNext] Credit note ${creditNote.name} created against ${originalSiName} for order ${orderName}`,
  );

  return { creditNoteName: creditNote.name };
}

export async function cancelErpnextSalesInvoice(
  orderName: string,
  location: LocationWithErpInstance,
): Promise<void> {
  const cfg = getErpConfig(location.erpnextInstance);
  if (!cfg.baseUrl || !cfg.apiKey || !cfg.apiSecret) return;
  if (!location.erpnextCompany) return;

  const filters = encodeURIComponent(
    JSON.stringify([
      ["po_no", "=", orderName],
      ["company", "=", location.erpnextCompany],
      ["docstatus", "=", "1"],
    ]),
  );
  const fields = encodeURIComponent(JSON.stringify(["name"]));
  const list = await erpnextGet<Array<{ name: string }>>(
    cfg,
    `/api/resource/Sales Invoice?filters=${filters}&fields=${fields}&limit=1`,
  );

  if (!list || list.length === 0) {
    console.warn(`[ERPNext] No submitted Sales Invoice found for po_no="${orderName}" — skipping cancel`);
    return;
  }

  const invoiceName = list[0].name;
  const res = await fetch(`${cfg.baseUrl}/api/method/frappe.client.cancel`, {
    method: "POST",
    headers: authHeaders(cfg),
    body: JSON.stringify({ doctype: "Sales Invoice", name: invoiceName }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ERPNext cancel Sales Invoice ${invoiceName} [${res.status}]: ${text.slice(0, 500)}`);
  }

  console.log(`[ERPNext] Cancelled Sales Invoice ${invoiceName} for Shopify order ${orderName}`);
}

export async function syncBankTransferPaymentToERPNext(
  orderPoNo: string,
  location: LocationWithErpInstance,
  dateStr: string,
): Promise<void> {
  const cfg = getErpConfig(location.erpnextInstance);
  if (!cfg.baseUrl || !cfg.apiKey || !cfg.apiSecret) {
    console.log("[ERPNext] syncBankTransferPaymentToERPNext: skipping — credentials not configured");
    return;
  }
  if (!location.erpnextCompany || !location.erpnextWarehouse) {
    console.log(`[ERPNext] syncBankTransferPaymentToERPNext: skipping — location missing erpnextCompany or erpnextWarehouse`);
    return;
  }
  console.log(`[ERPNext] syncBankTransferPaymentToERPNext called for po_no="${orderPoNo}" company="${location.erpnextCompany}"`);

  const filters = encodeURIComponent(
    JSON.stringify([
      ["po_no", "=", orderPoNo],
      ["company", "=", location.erpnextCompany],
      ["docstatus", "=", "1"],
    ]),
  );
  const fields = encodeURIComponent(
    JSON.stringify(["name", "outstanding_amount", "debit_to", "customer"]),
  );
  const list = await erpnextGet<
    Array<{ name: string; outstanding_amount: number; debit_to: string; customer: string }>
  >(cfg, `/api/resource/Sales Invoice?filters=${filters}&fields=${fields}&limit=1`);

  if (!list || list.length === 0) {
    console.warn(`[ERPNext] No Sales Invoice found for po_no="${orderPoNo}" — skipping bank transfer payment entry`);
    return;
  }

  const invoice = list[0];
  if (invoice.outstanding_amount <= 0) {
    console.log(`[ERPNext] Sales Invoice ${invoice.name} already fully paid — skipping`);
    return;
  }

  const mop = await erpnextGet<{
    name: string;
    accounts: Array<{ company: string; default_account: string }>;
  }>(cfg, `/api/resource/Mode%20of%20Payment/${encodeURIComponent(cfg.bankTransferMop)}`);

  if (!mop) {
    throw new Error(`ERPNext Mode of Payment "${cfg.bankTransferMop}" not found`);
  }

  const paidTo = mop.accounts.find((a) => a.company === location.erpnextCompany)?.default_account;
  if (!paidTo) {
    throw new Error(`No account mapped for "${cfg.bankTransferMop}" under company "${location.erpnextCompany}"`);
  }

  const pe = await erpnextPost<{ name: string }>(cfg, "/api/resource/Payment Entry", {
    doctype: "Payment Entry",
    payment_type: "Receive",
    company: location.erpnextCompany,
    posting_date: dateStr,
    mode_of_payment: mop.name,
    party_type: "Customer",
    party: invoice.customer,
    paid_from: invoice.debit_to,
    paid_to: paidTo,
    reference_no: invoice.name,
    reference_date: dateStr,
    paid_amount: invoice.outstanding_amount,
    received_amount: invoice.outstanding_amount,
    source_exchange_rate: 1,
    target_exchange_rate: 1,
    references: [
      {
        reference_doctype: "Sales Invoice",
        reference_name: invoice.name,
        allocated_amount: invoice.outstanding_amount,
      },
    ],
    docstatus: 1,
  });

  console.log(`[ERPNext] Bank Transfer Payment Entry ${pe.name} created for Sales Invoice ${invoice.name}`);
}

/** Create a Payment Entry against an existing Sales Invoice when finance marks the order paid. */
export async function syncFinanceApprovedPrepaidPaymentToERPNext(
  order: {
    name: string | null;
    shopifyOrderId: string;
    erpnextInvoiceId?: string | null;
    paymentGatewayPrimary: string | null;
    paymentGatewayNames: string[];
    financialStatus: string | null;
  },
  location: LocationWithErpInstance,
  paidAt: Date,
): Promise<void> {
  if (order.financialStatus !== "paid") return;

  const cfg = getErpConfig(location.erpnextInstance);
  if (!cfg.baseUrl || !cfg.apiKey || !cfg.apiSecret) return;
  if (!location.erpnextCompany) return;

  const gateways = ([order.paymentGatewayPrimary, ...order.paymentGatewayNames] as (string | null)[])
    .filter((g): g is string => typeof g === "string" && g.length > 0);
  const mopName = resolvePrepaidMop(cfg, gateways);
  if (!mopName) return;

  // For ERP-native orders the SI name IS the erpnextInvoiceId — fetch it directly.
  // For Shopify-synced orders fall back to po_no lookup (SI was created with po_no set).
  const erpId = order.erpnextInvoiceId?.trim();
  const directSiName =
    erpId && erpId !== "pending" && erpId !== "pending_approval"
      ? erpId
      : null;

  let invoice: { name: string; outstanding_amount: number; debit_to: string; customer: string } | null = null;

  if (directSiName) {
    invoice = await erpnextGet<{ name: string; outstanding_amount: number; debit_to: string; customer: string }>(
      cfg,
      `/api/resource/Sales Invoice/${encodeURIComponent(directSiName)}`,
    ) ?? null;
  } else {
    const orderPoNo = (order.name ?? order.shopifyOrderId).slice(0, 140);
    const filters = encodeURIComponent(
      JSON.stringify([
        ["po_no", "=", orderPoNo],
        ["company", "=", location.erpnextCompany],
        ["docstatus", "=", "1"],
      ]),
    );
    const fields = encodeURIComponent(
      JSON.stringify(["name", "outstanding_amount", "debit_to", "customer"]),
    );
    const list = await erpnextGet<
      Array<{ name: string; outstanding_amount: number; debit_to: string; customer: string }>
    >(cfg, `/api/resource/Sales Invoice?filters=${filters}&fields=${fields}&limit=1`);
    invoice = list?.[0] ?? null;
  }

  if (!invoice) {
    console.warn(`[ERPNext] No Sales Invoice found for order "${order.name ?? order.shopifyOrderId}" — skipping finance-approved PE`);
    return;
  }

  if (invoice.outstanding_amount <= 0) {
    console.log(`[ERPNext] Sales Invoice ${invoice.name} already fully paid — skipping finance-approved PE`);
    return;
  }

  await createPrepaidPaymentEntry(
    cfg,
    invoice.name,
    location.erpnextCompany,
    invoice.customer,
    invoice.debit_to,
    invoice.outstanding_amount,
    toDateStr(paidAt),
    mopName,
  );
}

export type SyncOrderToERPNextOptions = {
  /** Create a new SI even when a submitted invoice exists for the same po_no (re-correct flow). */
  forceNewInvoice?: boolean;
};

export async function syncOrderToERPNext(
  order: Order,
  location: LocationWithErpInstance,
  shopifyData: ShopifyOrderWebhookPayload,
  options?: SyncOrderToERPNextOptions,
): Promise<void> {
  const skipReason = getErpShopifySyncSkipReason(order.createdAt, location);
  if (skipReason) {
    console.warn(
      erpShopifySyncSkipLogMessage(skipReason, {
        orderId: order.id,
        createdAt: order.createdAt.toISOString(),
      }),
      { orderId: order.id, reason: skipReason }
    );
    return;
  }

  const cfg = getErpConfig(location.erpnextInstance);
  console.log(`[ERPNext] syncOrderToERPNext called — company=${location.erpnextCompany ?? "null"}, warehouse=${location.erpnextWarehouse ?? "null"}, baseUrl=${cfg.baseUrl ? "set" : "missing"}`);
  if (!cfg.baseUrl || !cfg.apiKey || !cfg.apiSecret) {
    console.warn("[ERPNext] Skipping sync — ERP credentials not configured");
    return;
  }
  if (!location.erpnextCompany || !location.erpnextWarehouse) {
    console.warn("[ERPNext] Skipping sync — erpnextCompany or erpnextWarehouse not set on location", location.id);
    return;
  }

  const orderPoNo = (order.name ?? order.shopifyOrderId).slice(0, 140);

  const existingFilter = encodeURIComponent(
    JSON.stringify([
      ["po_no", "=", orderPoNo],
      ["company", "=", location.erpnextCompany],
      ["docstatus", "=", 1],
    ]),
  );
  const existingFields = encodeURIComponent(JSON.stringify(["name"]));
  if (!options?.forceNewInvoice) {
    const existingSI = await erpnextGet<Array<{ name: string }>>(
      cfg,
      `/api/resource/Sales Invoice?filters=${existingFilter}&fields=${existingFields}&limit=1`,
    );
    if (existingSI && existingSI.length > 0) {
      console.log(`[ERPNext] Sales Invoice already exists for po_no="${orderPoNo}" — skipping creation`);
      await prisma.order.update({ where: { id: order.id }, data: { erpnextInvoiceId: existingSI[0].name, ...ERP_SYNC_SUCCESS_CLEAR } });
      if (order.financialStatus === "paid") {
        await syncFinanceApprovedPrepaidPaymentToERPNext(
          {
            name: order.name,
            shopifyOrderId: order.shopifyOrderId,
            paymentGatewayPrimary: order.paymentGatewayPrimary,
            paymentGatewayNames: order.paymentGatewayNames,
            financialStatus: order.financialStatus,
          },
          location,
          order.createdAt,
        );
      }
      return;
    }
  } else {
    console.log(`[ERPNext] forceNewInvoice — creating new SI for po_no="${orderPoNo}"`);
  }

  const lineItems = shopifyData.line_items.filter((li) => li.quantity > 0);
  if (lineItems.length === 0) return;

  const customerName =
    shopifyData.billing_address?.name?.trim() ||
    [shopifyData.customer?.first_name, shopifyData.customer?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    shopifyData.contact_email ||
    shopifyData.email ||
    "Guest";

  const customerEmail =
    shopifyData.contact_email || shopifyData.email || shopifyData.customer?.email || null;
  const customerPhone =
    shopifyData.phone ??
    shopifyData.billing_address?.phone ??
    shopifyData.shipping_address?.phone ??
    shopifyData.customer?.phone ??
    null;

  const erpCustomerName = await ensureCustomer(cfg, customerName, customerEmail, customerPhone, location.erpnextCompany);

  // Use shipping as fallback when billing is absent (common for digital/POS orders)
  const billingAddr = shopifyData.billing_address ?? shopifyData.shipping_address;
  const shippingAddr = shopifyData.shipping_address ?? shopifyData.billing_address;

  // Create Address documents in ERPNext and get their names (best-effort, silent on failure)
  const [billingAddressName, shippingAddressName] = await Promise.all([
    ensureErpAddress(cfg, erpCustomerName, billingAddr, "Billing"),
    ensureErpAddress(cfg, erpCustomerName, shippingAddr, "Shipping"),
  ]);

  // Map Shopify payment gateways to ERPNext mode-of-payment name
  const erpPaymentType = resolveErpPaymentType(cfg, shopifyData.payment_gateway_names ?? []);

  // Use today's date + current time in Colombo timezone for posting_date/posting_time.
  // ERPNext treats these as naive Colombo datetimes. Sending UTC time causes NegativeStockError
  // when stock was added earlier the same day (UTC time < Colombo time of stock entry).
  const { date: dateStr, time: postingTime } = toColomboDT();

  const shopifyShippingAmt = resolveOrderShippingAmountForErp({
    discountCodes: shopifyData.discount_codes,
    shippingLines: shopifyData.shipping_lines,
  });

  // Two ways to add shipping: as a line item (shippingItem) or as a taxes row (shippingChargeAccount).
  // shippingChargeAccount takes priority over shippingItem when both are configured.
  const useShippingTaxRow = shopifyShippingAmt > 0 && !!cfg.shippingChargeAccount;
  const useShippingItem = shopifyShippingAmt > 0 && !!cfg.shippingItem && !useShippingTaxRow;

  const erpCouponResolved = await buildErpSalesInvoiceCouponFields(cfg, {
    sourceName: order.sourceName,
    discountCodes: shopifyData.discount_codes,
    rawPayload: shopifyData,
    paymentGatewayNames: shopifyData.payment_gateway_names ?? [],
  });
  const erpCouponFields = erpCouponResolved.fields;
  const useCouponPricing = !!erpCouponFields.coupon_code;

  const netSiItems = buildErpItemsFromShopifyLineItems(lineItems, location.erpnextWarehouse, "net");
  const listSiItems = buildErpItemsFromShopifyLineItems(lineItems, location.erpnextWarehouse, "list");
  // When a coupon is found in ERP we send items at Shopify list (pre-discount) rates and apply
  // discount_amount explicitly. ERP's coupon pricing rules don't fire during API-based SI creation
  // (they require client-side UI triggers), so relying on erp_price_list mode + coupon_code alone
  // leaves the SI at full price. discount_amount at header level is the reliable path.
  const siItems = useCouponPricing ? [...listSiItems] : [...netSiItems];
  const netRateItems = [...netSiItems];

  if (useShippingItem) {
    const shippingRow: ErpSalesInvoiceItem = {
      item_code: cfg.shippingItem,
      item_name: "Delivery Charges",
      qty: 1,
      rate: shopifyShippingAmt,
      warehouse: location.erpnextWarehouse,
    };
    siItems.push(shippingRow);
    netRateItems.push(shippingRow);
  }

  const vaultTotal = parseFloat(order.totalPrice.toString());
  // siItems already holds the right base rates (list for coupon orders, net for others).
  const itemsTotal =
    sumErpInvoiceItemsTotal(siItems) +
    (useShippingTaxRow || useShippingItem ? shopifyShippingAmt : 0);
  const discountAmt = parseFloat((itemsTotal - vaultTotal).toFixed(2));

  const billingAddressHtml = formatAddressHtml(billingAddr);
  const shippingAddressHtml = formatAddressHtml(shippingAddr);

  const siBody = {
    doctype: "Sales Invoice",
    company: location.erpnextCompany,
    customer: erpCustomerName,
    posting_date: dateStr,
    posting_time: postingTime,
    po_no: orderPoNo,
    update_stock: 1,
    set_warehouse: location.erpnextWarehouse,
    docstatus: 1,
    items: siItems,
    ...erpCouponFields,
    ...(customerEmail ? { contact_email: customerEmail } : {}),
    ...(customerPhone ? { contact_mobile: customerPhone.trim().slice(0, LIMITS.mobile.max) } : {}),
    // Payment type mapped from Shopify gateway names
    ...(erpPaymentType ? { custom_payment_type: erpPaymentType } : {}),
    // Address: prefer linked Address documents (ERPNext-native); fall back to raw HTML text
    ...(billingAddressName
      ? { customer_address: billingAddressName }
      : billingAddressHtml
        ? { address_display: billingAddressHtml }
        : {}),
    ...(shippingAddressName
      ? { shipping_address_name: shippingAddressName }
      : shippingAddressHtml
        ? { shipping_address: shippingAddressHtml }
        : {}),
    // Always include shipping_rule when configured — excluded only when using the taxes-row approach
    // since that injects an exact amount into taxes directly (shipping_rule would override it).
    ...(cfg.shippingRule && !useShippingTaxRow && shopifyShippingAmt > 0
      ? { shipping_rule: cfg.shippingRule }
      : {}),
    ...(useShippingTaxRow
      ? {
          taxes: [
            {
              charge_type: "Actual",
              account_head: cfg.shippingChargeAccount,
              description: "Shipping Fee",
              tax_amount: shopifyShippingAmt,
            },
          ],
        }
      : cfg.taxesAndCharges
        ? { taxes_and_charges: cfg.taxesAndCharges }
        : { taxes: [] }),
    // Apply Shopify-calculated discount as header discount_amount whenever there's a gap between
    // the Shopify-charged total and the sum of item rates (covers both coupon and non-coupon orders).
    ...(discountAmt > 0
      ? { discount_amount: discountAmt, apply_discount_on: "Net Total" }
      : {}),
  };

  const si = await createErpSalesInvoice(cfg, siBody as Record<string, unknown>, {
    discountFallback: discountAmt > 0 ? discountAmt : undefined,
    couponLabel: erpCouponResolved.discountCodeLabel,
    netRateItems: useCouponPricing ? netRateItems : undefined,
  });

  const couponLabel = erpCouponFields.coupon_code ?? erpCouponResolved.discountCodeLabel;
  if (couponLabel) {
    await ensureErpSalesInvoiceCouponLabels(cfg, si.name, couponLabel);
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { erpnextInvoiceId: si.name, ...ERP_SYNC_SUCCESS_CLEAR },
  });

  console.log(`[ERPNext] Synced Shopify order ${order.shopifyOrderId} → Sales Invoice ${si.name}`);

  if (order.financialStatus === "paid") {
    let peAttemptedMop: string | null = null;
    try {
      peAttemptedMop = resolvePrepaidMop(cfg, shopifyData.payment_gateway_names ?? []);
      if (peAttemptedMop) {
        await createPrepaidPaymentEntry(
          cfg,
          si.name,
          location.erpnextCompany,
          customerName,
          si.debit_to,
          si.grand_total,
          dateStr,
          peAttemptedMop,
        );
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[ERPNext] Payment Entry creation failed after SI sync (SI was created):", err);
      await prisma.order.update({
        where: { id: order.id },
        data: {
          erpPeSyncError: errMsg.slice(0, 10_000),
          erpPeSyncFailedAt: new Date(),
          erpPeSyncMop: peAttemptedMop?.slice(0, 200) ?? null,
        },
      }).catch((e) => console.error("[ERPNext] Failed to record PE sync error on order:", e));
    }
  }
}

// ─── Vault OS Order-data fallback ──────────────────────────────────────────────
// Used when rawPayload (Shopify webhook) is absent — builds the ERP invoice from
// the order's own stored fields (lineItems relation, shippingAddress JSON, etc.)

type OrderLineItemForSync = {
  quantity: number;
  price: { toString(): string };
  productItem: {
    productTitle: string;
    variantTitle: string | null;
    sku: string | null;
  };
};

type OrderWithVaultData = Order & {
  companyLocation: LocationWithErpInstance;
  lineItems: OrderLineItemForSync[];
};

export async function syncOrderToERPNextFromOrder(order: OrderWithVaultData): Promise<void> {
  const location = order.companyLocation;
  const skipReason = getErpShopifySyncSkipReason(order.createdAt, location);
  if (skipReason) {
    console.warn(
      erpShopifySyncSkipLogMessage(skipReason, {
        orderId: order.id,
        createdAt: order.createdAt.toISOString(),
      }),
      { orderId: order.id, reason: skipReason }
    );
    return;
  }

  const cfg = getErpConfig(location.erpnextInstance);
  console.log(`[ERPNext] syncOrderToERPNextFromOrder called — company=${location.erpnextCompany ?? "null"}, warehouse=${location.erpnextWarehouse ?? "null"}, baseUrl=${cfg.baseUrl ? "set" : "missing"}`);
  if (!cfg.baseUrl || !cfg.apiKey || !cfg.apiSecret) {
    console.warn("[ERPNext] Skipping sync — ERP credentials not configured");
    return;
  }
  if (!location.erpnextCompany || !location.erpnextWarehouse) {
    console.warn("[ERPNext] Skipping sync — erpnextCompany or erpnextWarehouse not set on location", location.id);
    return;
  }
  const erpnextCompany = location.erpnextCompany;
  const erpnextWarehouse = location.erpnextWarehouse;

  const orderPoNo = (order.name ?? order.shopifyOrderId).slice(0, 140);

  const existingFilter = encodeURIComponent(
    JSON.stringify([
      ["po_no", "=", orderPoNo],
      ["company", "=", erpnextCompany],
      ["docstatus", "=", 1],
    ]),
  );
  const existingFields = encodeURIComponent(JSON.stringify(["name"]));
  const existingSI = await erpnextGet<Array<{ name: string }>>(
    cfg,
    `/api/resource/Sales Invoice?filters=${existingFilter}&fields=${existingFields}&limit=1`,
  );
  if (existingSI && existingSI.length > 0) {
    console.log(`[ERPNext] Sales Invoice already exists for po_no="${orderPoNo}" — skipping creation`);
    await prisma.order.update({ where: { id: order.id }, data: { erpnextInvoiceId: existingSI[0].name, ...ERP_SYNC_SUCCESS_CLEAR } });
    if (order.financialStatus === "paid") {
      await syncFinanceApprovedPrepaidPaymentToERPNext(order, location, order.createdAt);
    }
    return;
  }

  const lineItems = order.lineItems.filter((li) => li.quantity > 0);
  if (lineItems.length === 0) return;

  const addr = order.shippingAddress as ShopifyAddress;
  const rawName = typeof addr?.name === "string" ? addr.name.trim() : "";
  const rawFullName = [addr?.first_name, addr?.last_name].filter(Boolean).join(" ").trim();
  const customerName = rawName || rawFullName || order.customerEmail || order.customerPhone || "Guest";
  const customerEmail = order.customerEmail ?? null;
  const customerPhone = order.customerPhone ?? (typeof addr?.phone === "string" ? addr.phone : null);

  const erpCustomerName = await ensureCustomer(cfg, customerName, customerEmail, customerPhone, erpnextCompany);

  const [billingAddressName, shippingAddressName] = await Promise.all([
    ensureErpAddress(cfg, erpCustomerName, addr, "Billing"),
    ensureErpAddress(cfg, erpCustomerName, addr, "Shipping"),
  ]);

  const allGateways = ([order.paymentGatewayPrimary, ...order.paymentGatewayNames] as (string | null)[])
    .filter((g): g is string => typeof g === "string" && g.length > 0);
  const erpPaymentType = resolveErpPaymentType(cfg, allGateways);

  const { date: dateStr, time: postingTime } = toColomboDT();

  const siItems: Array<{ item_code: string; item_name?: string; qty: number; rate: number; warehouse: string }> = lineItems.map((li) => ({
    item_code: li.productItem.sku ?? li.productItem.productTitle.slice(0, 140),
    item_name: [li.productItem.productTitle, li.productItem.variantTitle].filter(Boolean).join(" - ") || undefined,
    qty: li.quantity,
    rate: parseFloat(li.price.toString()),
    warehouse: erpnextWarehouse,
  }));

  const shippingAmt = resolveOrderShippingAmountForErp({
    discountCodes: order.discountCodes,
    shippingLines: order.shippingLines,
    totalShipping: order.totalShipping,
  });
  const useShippingTaxRow = shippingAmt > 0 && !!cfg.shippingChargeAccount;
  const useShippingItem = shippingAmt > 0 && !!cfg.shippingItem && !useShippingTaxRow;

  if (useShippingItem) {
    siItems.push({ item_code: cfg.shippingItem, item_name: "Delivery Charges", qty: 1, rate: shippingAmt, warehouse: erpnextWarehouse });
  }

  const itemsTotal = siItems.reduce((sum, li) => sum + li.rate * li.qty, 0);
  const vaultTotal = parseFloat(order.totalPrice.toString());
  const discountAmt = parseFloat((itemsTotal + (useShippingTaxRow ? shippingAmt : 0) - vaultTotal).toFixed(2));

  const addrHtml = formatAddressHtml(addr);

  const erpCouponResolved = await buildErpSalesInvoiceCouponFields(cfg, {
    sourceName: order.sourceName,
    discountCodes: order.discountCodes,
    rawPayload: order.rawPayload,
    paymentGatewayPrimary: order.paymentGatewayPrimary,
    paymentGatewayNames: order.paymentGatewayNames ?? [],
  });
  const erpCouponFields = erpCouponResolved.fields;

  const siBody = {
    doctype: "Sales Invoice",
    company: erpnextCompany,
    customer: erpCustomerName,
    posting_date: dateStr,
    posting_time: postingTime,
    po_no: orderPoNo,
    update_stock: 1,
    set_warehouse: erpnextWarehouse,
    docstatus: 1,
    items: siItems,
    ...erpCouponFields,
    ...(customerEmail ? { contact_email: customerEmail } : {}),
    ...(customerPhone ? { contact_mobile: customerPhone.trim().slice(0, LIMITS.mobile.max) } : {}),
    ...(erpPaymentType ? { custom_payment_type: erpPaymentType } : {}),
    ...(billingAddressName ? { customer_address: billingAddressName } : addrHtml ? { address_display: addrHtml } : {}),
    ...(shippingAddressName ? { shipping_address_name: shippingAddressName } : addrHtml ? { shipping_address: addrHtml } : {}),
    ...(cfg.shippingRule && !useShippingTaxRow && shippingAmt > 0
      ? { shipping_rule: cfg.shippingRule }
      : {}),
    ...(useShippingTaxRow
      ? { taxes: [{ charge_type: "Actual", account_head: cfg.shippingChargeAccount, description: "Shipping Fee", tax_amount: shippingAmt }] }
      : cfg.taxesAndCharges
        ? { taxes_and_charges: cfg.taxesAndCharges }
        : { taxes: [] }),
  ...(discountAmt > 0 && !erpCouponFields.coupon_code
      ? { discount_amount: discountAmt, apply_discount_on: "Net Total" }
      : {}),
  };

  const si = await createErpSalesInvoice(cfg, siBody as Record<string, unknown>, {
    discountFallback: discountAmt > 0 ? discountAmt : undefined,
    couponLabel: erpCouponResolved.discountCodeLabel,
  });

  const couponLabel = erpCouponFields.coupon_code ?? erpCouponResolved.discountCodeLabel;
  if (couponLabel) {
    await ensureErpSalesInvoiceCouponLabels(cfg, si.name, couponLabel);
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { erpnextInvoiceId: si.name, ...ERP_SYNC_SUCCESS_CLEAR },
  });

  console.log(`[ERPNext] Synced order ${order.id} (Vault OS data) → Sales Invoice ${si.name}`);

  if (order.financialStatus === "paid") {
    let peAttemptedMop: string | null = null;
    try {
      peAttemptedMop = resolvePrepaidMop(cfg, allGateways);
      if (peAttemptedMop) {
        await createPrepaidPaymentEntry(
          cfg,
          si.name,
          erpnextCompany,
          erpCustomerName,
          si.debit_to,
          si.grand_total,
          dateStr,
          peAttemptedMop,
        );
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[ERPNext] Payment Entry creation failed after SI sync (SI was created):", err);
      await prisma.order.update({
        where: { id: order.id },
        data: {
          erpPeSyncError: errMsg.slice(0, 10_000),
          erpPeSyncFailedAt: new Date(),
          erpPeSyncMop: peAttemptedMop?.slice(0, 200) ?? null,
        },
      }).catch((e) => console.error("[ERPNext] Failed to record PE sync error on order:", e));
    }
  }
}
