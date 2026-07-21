import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { verifyShopifyWebhook } from "@/lib/shopify-webhook";
import { shopifyCheckoutWebhookSchema } from "@/lib/validation/shopify-checkout";
import { LIMITS } from "@/lib/validation";
import { upsertAbandonedCheckoutFromWebhook } from "@/lib/shopify-abandoned-checkout-webhook";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function getWebhookLogMeta(request: NextRequest) {
  return {
    topic: request.headers.get("x-shopify-topic"),
    webhookId: request.headers.get("x-shopify-webhook-id"),
    shopDomain: request.headers.get("x-shopify-shop-domain"),
    locationId: request.nextUrl.searchParams.get("location_id"),
  };
}

/**
 * Shopify checkouts/create|update|delete → abandoned checkout rows (Vault path).
 *
 * Manual Shopify setup (Settings → Notifications → Webhooks):
 *   URL: https://<vault-host>/api/webhooks/shopify/checkouts?location_id=<shopifyLocationId>
 *   Topics: Checkouts create, Checkouts update, Checkouts delete
 *   Format: JSON
 *   Use the same webhook signing secret already stored in Cosmo/Vault company settings.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const hmacHeader = request.headers.get("x-shopify-hmac-sha256");
  const shopifyTopic = request.headers.get("x-shopify-topic") ?? null;
  const webhookMeta = getWebhookLogMeta(request);

  const locationIdParam = request.nextUrl.searchParams.get("location_id");
  if (!locationIdParam?.trim()) {
    console.error("[Checkout webhook] Missing location_id query param", webhookMeta);
    return NextResponse.json(
      { error: "location_id query param is required" },
      { status: 400 }
    );
  }

  const locationId = locationIdParam.trim().slice(0, LIMITS.shopifyLocationId.max);

  const location = await prisma.companyLocation.findFirst({
    where: { shopifyLocationId: locationId },
    include: {
      company: {
        include: {
          shopifyWebhookSecrets: { select: { secret: true } },
        },
      },
    },
  });

  if (!location) {
    console.error("[Checkout webhook] Location not found", webhookMeta);
    return NextResponse.json(
      { error: "Location not found for given shopify location id" },
      { status: 404 }
    );
  }

  const secrets = location.company.shopifyWebhookSecrets.map((s) => s.secret);
  if (secrets.length === 0) {
    console.error("[Checkout webhook] No webhook secrets configured", {
      ...webhookMeta,
      companyId: location.companyId,
    });
    return NextResponse.json(
      { error: "No webhook secrets configured for this company" },
      { status: 500 }
    );
  }

  const isValid = secrets.some((secret) =>
    verifyShopifyWebhook(rawBody, hmacHeader, secret)
  );
  if (!isValid) {
    console.error("[Checkout webhook] Invalid signature", {
      ...webhookMeta,
      companyId: location.companyId,
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = shopifyCheckoutWebhookSchema.safeParse(rawPayload);
  if (!parsed.success) {
    console.error("[Checkout webhook] Invalid payload", {
      ...webhookMeta,
      companyId: location.companyId,
      details: parsed.error.flatten(),
    });
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await upsertAbandonedCheckoutFromWebhook({
      companyId: location.companyId,
      companyLocationId: location.id,
      shopifyAdminStoreHandle: location.shopifyAdminStoreHandle,
      shopifyShopName: location.shopifyShopName,
      topic: shopifyTopic,
      data: parsed.data,
    });

    return NextResponse.json({
      ok: true,
      shopifyCheckoutGid: result.shopifyCheckoutGid,
      recovered: result.recovered,
    });
  } catch (error) {
    console.error("[Checkout webhook] Processing failed", {
      ...webhookMeta,
      companyId: location.companyId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
