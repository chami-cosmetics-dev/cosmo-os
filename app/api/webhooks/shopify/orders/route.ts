import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { verifyShopifyWebhook } from "@/lib/shopify-webhook";
import { shopifyOrderWebhookSchema } from "@/lib/validation/shopify-order";
import { LIMITS } from "@/lib/validation";
import { processOrderWebhook } from "@/lib/order-webhook-process";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const hmacHeader = request.headers.get("x-shopify-hmac-sha256");
  const shopifyTopic = request.headers.get("x-shopify-topic") ?? null;

  const locationIdParam = request.nextUrl.searchParams.get("location_id");
  if (!locationIdParam?.trim()) {
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
      defaultMerchant: true,
    },
  });

  if (!location) {
    return NextResponse.json(
      { error: "Location not found for given shopify location id" },
      { status: 404 }
    );
  }

  const secrets = location.company.shopifyWebhookSecrets.map((s) => s.secret);
  if (secrets.length === 0) {
    return NextResponse.json(
      { error: "No webhook secrets configured for this company" },
      { status: 500 }
    );
  }

  const isValid = secrets.some((secret) =>
    verifyShopifyWebhook(rawBody, hmacHeader, secret)
  );
  if (!isValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = shopifyOrderWebhookSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const shopifyOrderId = String(data.id);

  try {
    await processOrderWebhook(data, location, rawPayload);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack ?? null : null;

    await prisma.failedOrderWebhook.create({
      data: {
        companyId: location.companyId,
        companyLocationId: location.id,
        shopifyOrderId,
        shopifyTopic: shopifyTopic?.slice(0, 100) ?? null,
        errorMessage: errorMessage.slice(0, 10000),
        errorStack: errorStack?.slice(0, 10000) ?? null,
        rawPayload: rawPayload as object,
      },
    });

    console.error("[Order webhook] Failed to process:", shopifyOrderId, error);

    return NextResponse.json(
      { error: "Failed to process order", details: errorMessage },
      { status: 500 }
    );
  }
}
