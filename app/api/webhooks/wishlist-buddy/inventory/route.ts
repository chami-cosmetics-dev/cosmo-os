import { after, NextRequest, NextResponse } from "next/server";

import { verifyShopifyWebhook } from "@/lib/shopify-webhook";
import { sendRestockEmailsForInventoryItem } from "@/lib/wishlist-buddy/requests";
import { shopifyNumericId } from "@/lib/wishlist-buddy/validation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Shopify `inventory_levels/update`, subscribed in the Wishlist Buddy app config and signed with
 * the app's client secret. Responds immediately; restock emails go out after the response.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const secret = process.env.WISHLIST_BUDDY_SHOPIFY_API_SECRET ?? "";
  if (!verifyShopifyWebhook(rawBody, request.headers.get("x-shopify-hmac-sha256"), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { inventory_item_id?: number | string; available?: number | null };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const inventoryItemId = shopifyNumericId(payload.inventory_item_id);
  const available = Number(payload.available);
  const shopDomain = request.headers.get("x-shopify-shop-domain") ?? "";
  if (inventoryItemId && Number.isFinite(available) && available > 0 && shopDomain) {
    after(async () => {
      try {
        const result = await sendRestockEmailsForInventoryItem({ shopDomain, inventoryItemId, available });
        if (result.restocked || result.sent || result.failed) {
          console.info("[Wishlist Buddy] restock emails", { inventoryItemId, ...result });
        }
      } catch (error) {
        console.error("[Wishlist Buddy] restock emails failed", { inventoryItemId, error });
      }
    });
  }

  return NextResponse.json({ ok: true });
}
