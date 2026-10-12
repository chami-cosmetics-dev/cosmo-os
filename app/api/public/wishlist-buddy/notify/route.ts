import { after, NextRequest, NextResponse } from "next/server";

import {
  isAppProxyTimestampFresh,
  verifyAppProxySignature,
} from "@/lib/wishlist-buddy/app-proxy-signature";
import {
  createStockRequestFromStorefront,
  runStockLookupForRequest,
  StockRequestInputError,
} from "@/lib/wishlist-buddy/requests";
import { notifyRequestBodySchema } from "@/lib/wishlist-buddy/validation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Wishlist Buddy "Notify me when available" form.
 *
 * Shopify app proxy setup (Wishlist Buddy shopify.app.toml):
 *   [app_proxy] url = "https://<cosmo-host>/api/public/wishlist-buddy", subpath = "wishlist-buddy", prefix = "apps"
 * The storefront posts to /apps/wishlist-buddy/notify; Shopify forwards here with a signed query.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.WISHLIST_BUDDY_SHOPIFY_API_SECRET ?? "";
  const params = request.nextUrl.searchParams;
  if (!secret || !verifyAppProxySignature(params, secret) || !isAppProxyTimestampFresh(params)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = notifyRequestBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Please check your details" },
      { status: 400 },
    );
  }

  try {
    const result = await createStockRequestFromStorefront({
      shopDomain: params.get("shop") ?? "",
      loggedInCustomerId: params.get("logged_in_customer_id") || null,
      body: parsed.data,
    });
    if (result.outcome === "created") {
      after(() =>
        runStockLookupForRequest(result.id).catch((error) =>
          console.error("[Wishlist Buddy] stock lookup failed", { id: result.id, error }),
        ),
      );
    }
    return NextResponse.json({ ok: true, alreadyRegistered: result.outcome === "duplicate" });
  } catch (error) {
    if (error instanceof StockRequestInputError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    console.error("[Wishlist Buddy] notify request failed", error);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
