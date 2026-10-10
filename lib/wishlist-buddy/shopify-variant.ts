import "server-only";

import { normalizeShopifyStoreHandle } from "@/lib/shopify-admin";
import {
  forgetWishlistBuddyAdminToken,
  getWishlistBuddyAdminToken,
} from "@/lib/wishlist-buddy/shopify-token";
import { shopifyNumericId } from "@/lib/wishlist-buddy/validation";

const SHOPIFY_API_VERSION = "2026-07";

export type ShopifyVariantInfo = {
  shopName: string | null;
  storefrontUrl: string | null;
  variantId: string;
  variantTitle: string | null;
  sku: string | null;
  inventoryItemId: string | null;
  inventoryQuantity: number | null;
  productId: string | null;
  productTitle: string;
  productHandle: string | null;
  productUrl: string | null;
};

type VariantQueryResponse = {
  data?: {
    shop?: { name?: string; primaryDomain?: { url?: string } };
    productVariant?: {
      id: string;
      title?: string | null;
      sku?: string | null;
      inventoryQuantity?: number | null;
      inventoryItem?: { id?: string } | null;
      product?: { id?: string; title?: string; handle?: string } | null;
    } | null;
  };
  errors?: Array<{ message?: string }>;
};

/**
 * Reads the variant from Shopify instead of trusting the storefront form: the SKU decides which
 * ERP item we look up, and the inventory item ID is what the restock webhook reports.
 */
export async function fetchShopifyVariantInfo(input: {
  storeHandle: string;
  variantId: string;
}): Promise<ShopifyVariantInfo | null> {
  const handle = normalizeShopifyStoreHandle(input.storeHandle);
  if (!handle) throw new Error(`[Wishlist Buddy] Invalid store handle: "${input.storeHandle}"`);
  const token = await getWishlistBuddyAdminToken(handle);

  const res = await fetch(`https://${handle}.myshopify.com/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      query: `
        query WishlistBuddyVariant($id: ID!) {
          shop { name primaryDomain { url } }
          productVariant(id: $id) {
            id
            title
            sku
            inventoryQuantity
            inventoryItem { id }
            product { id title handle }
          }
        }
      `,
      variables: { id: `gid://shopify/ProductVariant/${input.variantId}` },
    }),
  });
  if (!res.ok) {
    if (res.status === 401) forgetWishlistBuddyAdminToken(handle);
    const text = await res.text().catch(() => "");
    throw new Error(`[Wishlist Buddy] Shopify variant lookup [${res.status}]: ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as VariantQueryResponse;
  if (json.errors?.length) {
    throw new Error(`[Wishlist Buddy] Shopify variant lookup: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  const variant = json.data?.productVariant;
  if (!variant) return null;

  const storefrontUrl = json.data?.shop?.primaryDomain?.url?.replace(/\/$/, "") ?? null;
  const productHandle = variant.product?.handle ?? null;
  const variantId = shopifyNumericId(variant.id) ?? input.variantId;
  return {
    shopName: json.data?.shop?.name?.trim() || null,
    storefrontUrl,
    variantId,
    variantTitle: variant.title && variant.title !== "Default Title" ? variant.title : null,
    sku: variant.sku?.trim() || null,
    inventoryItemId: shopifyNumericId(variant.inventoryItem?.id),
    inventoryQuantity: typeof variant.inventoryQuantity === "number" ? variant.inventoryQuantity : null,
    productId: shopifyNumericId(variant.product?.id),
    productTitle: variant.product?.title?.trim() || "Product",
    productHandle,
    productUrl:
      storefrontUrl && productHandle ? `${storefrontUrl}/products/${productHandle}?variant=${variantId}` : null,
  };
}
