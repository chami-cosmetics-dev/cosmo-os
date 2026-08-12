import { isVaultOsDeployment } from "@/lib/falcon-waybill-brand";

const SHOPIFY_API_VERSION = "2024-10";

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

export async function applyShopifyLoyaltyTag(input: {
  storeHandle: string;
  shopifyCustomerId: string;
  tier: "gold" | "platinum";
}): Promise<boolean> {
  try {
    const id = input.shopifyCustomerId.replace(/\D/g, "");
    if (!id) return false;
    const got = await shopifyAdminJson<{ customer?: { id: number; tags?: string } }>(
      input.storeHandle,
      `/customers/${id}.json`
    );
    if (!got.ok || !got.data?.customer) return false;
    const tags = mergeShopifyLoyaltyTags(got.data.customer.tags, input.tier);
    const put = await shopifyAdminJson(
      input.storeHandle,
      `/customers/${id}.json`,
      {
        method: "PUT",
        body: JSON.stringify({ customer: { id: Number(id), tags } }),
      }
    );
    return put.ok;
  } catch {
    return false;
  }
}

export async function searchShopifyCustomerId(input: {
  storeHandle: string;
  phone?: string | null;
  email?: string | null;
}): Promise<string | null> {
  const parts: string[] = [];
  if (input.email?.trim()) parts.push(`email:${input.email.trim()}`);
  if (input.phone?.trim()) parts.push(`phone:${input.phone.trim()}`);
  if (parts.length === 0) return null;
  const query = encodeURIComponent(parts.join(" OR "));
  const got = await shopifyAdminJson<{ customers?: Array<{ id: number }> }>(
    input.storeHandle,
    `/customers/search.json?query=${query}`
  );
  const id = got.data?.customers?.[0]?.id;
  return id != null ? String(id) : null;
}
