import { isVaultOsDeployment } from "@/lib/falcon-waybill-brand";
import { buildPhoneLookupVariants } from "@/lib/phone-lookup";

const SHOPIFY_API_VERSION = "2024-10";

/** Shop subdomain only (e.g. `my-shop` from `my-shop.myshopify.com`). */
export function normalizeShopifyStoreHandle(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\.myshopify\.com.*$/, "")
    .replace(/\/$/, "");
}

export const VAULT_SHOPIFY_CANCEL_BLOCKED_MESSAGE =
  "You can't cancel this order in Vault OS. Cancel the order in Shopify. Vault will update when Shopify sends the cancellation.";

export function isRealShopifyOrderId(shopifyOrderId: string | null | undefined): boolean {
  return Boolean(shopifyOrderId && !shopifyOrderId.startsWith("erp-"));
}

/** Vault has no Admin API token — staff must cancel real Shopify orders in Shopify. */
export function shouldBlockShopifyCancelInOs(shopifyOrderId: string | null | undefined): boolean {
  return isVaultOsDeployment() && isRealShopifyOrderId(shopifyOrderId);
}

function getAdminToken(): string {
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (!token) throw new Error("[Shopify Admin] SHOPIFY_ADMIN_ACCESS_TOKEN not configured");
  return token;
}

export async function cancelShopifyOrder(
  shopifyOrderId: string,
  storeHandle: string,
): Promise<void> {
  const token = getAdminToken();
  const url = `https://${storeHandle}.myshopify.com/admin/api/${SHOPIFY_API_VERSION}/orders/${shopifyOrderId}/cancel.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reason: "customer" }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Shopify cancel order ${shopifyOrderId} [${res.status}]: ${text.slice(0, 500)}`);
  }
}

export const SHOPIFY_LOYALTY_TAG_GOLD = "loyalty customer";
export const SHOPIFY_LOYALTY_TAG_PLATINUM = "loyalty customer G2";

export function mergeShopifyLoyaltyTags(
  existing: string | null | undefined,
  tier: "gold" | "platinum"
): string {
  const wanted =
    tier === "platinum" ? SHOPIFY_LOYALTY_TAG_PLATINUM : SHOPIFY_LOYALTY_TAG_GOLD;
  const drop = new Set([
    SHOPIFY_LOYALTY_TAG_GOLD.toLowerCase(),
    SHOPIFY_LOYALTY_TAG_PLATINUM.toLowerCase(),
  ]);
  const kept = (existing ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t && !drop.has(t.toLowerCase()));
  kept.push(wanted);
  return kept.join(", ");
}

async function shopifyAdminJson<T>(
  storeHandle: string,
  path: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data: T | null; text: string }> {
  const token = getAdminToken();
  const url = `https://${storeHandle}.myshopify.com/admin/api/${SHOPIFY_API_VERSION}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text().catch(() => "");
  let data: T | null = null;
  try {
    data = text ? (JSON.parse(text) as T) : null;
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data, text };
}

export type ShopifyLoyaltyTagResult = {
  ok: boolean;
  error?: string;
};

export async function applyShopifyLoyaltyTag(input: {
  storeHandle: string;
  shopifyCustomerId: string;
  tier: "gold" | "platinum";
}): Promise<ShopifyLoyaltyTagResult> {
  try {
    const storeHandle = normalizeShopifyStoreHandle(input.storeHandle);
    if (!storeHandle) return { ok: false, error: "invalid store handle" };
    const id = input.shopifyCustomerId.replace(/\D/g, "");
    if (!id) return { ok: false, error: "invalid customer id" };
    const got = await shopifyAdminJson<{ customer?: { id: number; tags?: string } }>(
      storeHandle,
      `/customers/${id}.json`
    );
    if (!got.ok || !got.data?.customer) {
      return {
        ok: false,
        error: `customer fetch failed (${got.status})${got.text ? `: ${got.text.slice(0, 160)}` : ""}`,
      };
    }
    const tags = mergeShopifyLoyaltyTags(got.data.customer.tags, input.tier);
    const put = await shopifyAdminJson(
      storeHandle,
      `/customers/${id}.json`,
      {
        method: "PUT",
        body: JSON.stringify({ customer: { id: Number(id), tags } }),
      }
    );
    if (!put.ok) {
      return {
        ok: false,
        error: `tag update failed (${put.status})${put.text ? `: ${put.text.slice(0, 160)}` : ""}`,
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "tag update failed",
    };
  }
}

async function searchShopifyCustomersByQuery(
  storeHandle: string,
  query: string
): Promise<string | null> {
  const q = query.trim();
  if (!q) return null;
  const got = await shopifyAdminJson<{ customers?: Array<{ id: number }> }>(
    storeHandle,
    `/customers/search.json?query=${encodeURIComponent(q)}`
  );
  const id = got.data?.customers?.[0]?.id;
  return id != null ? String(id) : null;
}

/**
 * Find Shopify customer by email and/or phone.
 * Tries email alone, then phone variants (Shopify search is format-picky).
 */
export async function searchShopifyCustomerId(input: {
  storeHandle: string;
  phone?: string | null;
  email?: string | null;
}): Promise<string | null> {
  const storeHandle = normalizeShopifyStoreHandle(input.storeHandle);
  if (!storeHandle) return null;

  const email = input.email?.trim();
  if (email) {
    const byEmail = await searchShopifyCustomersByQuery(storeHandle, `email:${email}`);
    if (byEmail) return byEmail;
  }

  const phone = input.phone?.trim();
  if (!phone) return null;

  // Prefer E.164-ish forms first — Shopify usually stores +94…
  const variants = buildPhoneLookupVariants(phone);
  const ranked = [
    ...variants.filter((v) => v.startsWith("+")),
    ...variants.filter((v) => !v.startsWith("+")),
  ].slice(0, 10);

  for (const variant of ranked) {
    const byPhone = await searchShopifyCustomersByQuery(
      storeHandle,
      `phone:${variant}`
    );
    if (byPhone) return byPhone;
  }
  return null;
}
