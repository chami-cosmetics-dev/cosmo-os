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
