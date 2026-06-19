import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { verifyShopifyWebhook } from "@/lib/shopify-webhook";
import { shopifyOrderWebhookSchema } from "@/lib/validation/shopify-order";
import { LIMITS } from "@/lib/validation";
import { processOrderWebhook } from "@/lib/order-webhook-process";
import { type LocationWithErpInstance } from "@/lib/erpnext-sync";
import {
  createFailedOrderWebhook,
  runDueFailedOrderWebhookRetries,
} from "@/lib/failed-order-webhook-auto-retry";
import { runDueFailedErpSyncRetries } from "@/lib/failed-erp-sync-auto-retry";
import {
  getOrderImportCutoff,
  isShopifyOrderBeforeImportCutoff,
} from "@/lib/order-import-cutoff";
import { shouldSkipShopifyOrderWebhookForMissingOrder } from "@/lib/shopify-order-webhook-topic";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const WEBHOOK_PROCESS_ATTEMPTS = 3;
const WEBHOOK_RETRY_DELAYS_MS = [300, 1200];

function getWebhookLogMeta(request: NextRequest) {
  return {
    topic: request.headers.get("x-shopify-topic"),
    webhookId: request.headers.get("x-shopify-webhook-id"),
    shopDomain: request.headers.get("x-shopify-shop-domain"),
    locationId: request.nextUrl.searchParams.get("location_id"),
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processOrderWebhookWithImmediateRetry(
  input: {
    data: Parameters<typeof processOrderWebhook>[0];
    location: Parameters<typeof processOrderWebhook>[1];
    rawPayload: Parameters<typeof processOrderWebhook>[2];
    shopifyOrderId: string;
    webhookMeta: ReturnType<typeof getWebhookLogMeta>;
  }
) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= WEBHOOK_PROCESS_ATTEMPTS; attempt += 1) {
    try {
      await processOrderWebhook(
        input.data,
        input.location,
        input.rawPayload,
        input.webhookMeta.topic
      );
      if (attempt > 1) {
        console.warn("[Order webhook] Processed after retry", {
          ...input.webhookMeta,
          shopifyOrderId: input.shopifyOrderId,
          attempt,
        });
      }
      return;
    } catch (error) {
      lastError = error;
      console.error("[Order webhook] Processing attempt failed", {
        ...input.webhookMeta,
        shopifyOrderId: input.shopifyOrderId,
        attempt,
        maxAttempts: WEBHOOK_PROCESS_ATTEMPTS,
        error: error instanceof Error ? error.message : String(error),
      });

      const delayMs = WEBHOOK_RETRY_DELAYS_MS[attempt - 1];
      if (delayMs) {
        await sleep(delayMs);
      }
    }
  }

  throw lastError;
}

async function resolveLocationByOrderSeries(
  companyId: string,
  data: { order_number?: number | null; name?: string | null }
): Promise<LocationWithErpInstance | null> {
  const orderSeries = data.order_number != null
    ? String(data.order_number).trim()
    : (data.name ?? "").replace(/^#/, "").trim();

  const SERIES_LOCATION_RULES: Array<{
    prefix: string;
    nameParts: string[];
  }> = [
    { prefix: "100", nameParts: ["cool planet", "nugegoda"] },
    { prefix: "200", nameParts: ["kiribathgoda"] },
    { prefix: "300", nameParts: ["ogf"] },
    { prefix: "400", nameParts: ["pepiliyana"] },
    { prefix: "500", nameParts: ["chami"] },
    { prefix: "600", nameParts: ["cosmetics.lk", "new web"] },
    { prefix: "700", nameParts: ["maharagama"] },
    { prefix: "800", nameParts: ["spk"] },
    { prefix: "900", nameParts: ["pevi"] },
  ];

  const matchedRule = SERIES_LOCATION_RULES.find((rule) =>
    orderSeries.startsWith(rule.prefix)
  );
  if (!matchedRule) return null;

  return prisma.companyLocation.findFirst({
    where: {
      companyId,
      AND: matchedRule.nameParts.map((part) => ({
        name: {
          contains: part,
          mode: "insensitive" as const,
        },
      })),
    },
    include: { erpnextInstance: true },
  });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const hmacHeader = request.headers.get("x-shopify-hmac-sha256");
  const shopifyTopic = request.headers.get("x-shopify-topic") ?? null;
  const webhookMeta = getWebhookLogMeta(request);

  const locationIdParam = request.nextUrl.searchParams.get("location_id");
  if (!locationIdParam?.trim()) {
    console.error("[Order webhook] Missing location_id query param", webhookMeta);
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
      erpnextInstance: true,
    },
  });

  if (!location) {
    console.error("[Order webhook] Location not found", webhookMeta);
    return NextResponse.json(
      { error: "Location not found for given shopify location id" },
      { status: 404 }
    );
  }

  const secrets = location.company.shopifyWebhookSecrets.map((s) => s.secret);
  if (secrets.length === 0) {
    console.error("[Order webhook] No webhook secrets configured", {
      ...webhookMeta,
      companyId: location.companyId,
      companyLocationId: location.id,
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
    console.error("[Order webhook] Invalid signature", {
      ...webhookMeta,
      companyId: location.companyId,
      companyLocationId: location.id,
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(rawBody);
  } catch {
    console.error("[Order webhook] Invalid JSON", {
      ...webhookMeta,
      companyId: location.companyId,
      companyLocationId: location.id,
    });
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = shopifyOrderWebhookSchema.safeParse(rawPayload);
  if (!parsed.success) {
    const payload = rawPayload as { id?: number | string };
    const shopifyOrderId = payload?.id != null ? String(payload.id) : "unknown";
    await createFailedOrderWebhook({
      companyId: location.companyId,
      companyLocationId: location.id,
      shopifyOrderId,
      shopifyTopic,
      errorMessage: `Validation failed: ${parsed.error.message}`,
      errorStack: JSON.stringify(parsed.error.flatten(), null, 2),
      rawPayload: rawPayload as object,
      scheduleAutoRetry: false,
    });
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;
  let resolvedLocation: LocationWithErpInstance = location;
  const shopDomain = request.headers.get("x-shopify-shop-domain")?.trim().toLowerCase() ?? null;
  const normalizedConfiguredShopDomain = location.shopifyShopName?.trim().toLowerCase() ?? null;
  const payloadLocationId =
    data.location_id != null
      ? String(data.location_id).trim().slice(0, LIMITS.shopifyLocationId.max)
      : null;

  if (
    shopDomain &&
    normalizedConfiguredShopDomain &&
    shopDomain !== normalizedConfiguredShopDomain
  ) {
    const shopDomainLocation = await prisma.companyLocation.findFirst({
      where: {
        companyId: location.companyId,
        shopifyShopName: {
          equals: shopDomain,
          mode: "insensitive",
        },
      },
      include: { erpnextInstance: true },
    });

    if (shopDomainLocation) {
      resolvedLocation = shopDomainLocation;
    }

    console.warn("[Order webhook] Shop domain/query location mismatch", {
      ...webhookMeta,
      companyId: location.companyId,
      queryCompanyLocationId: location.id,
      queryShopDomain: location.shopifyShopName,
      headerShopDomain: shopDomain,
      resolvedCompanyLocationId: resolvedLocation.id,
    });
  }

  if (
    payloadLocationId &&
    resolvedLocation.shopifyLocationId &&
    payloadLocationId !== resolvedLocation.shopifyLocationId
  ) {
    const payloadLocation = await prisma.companyLocation.findFirst({
      where: {
        companyId: resolvedLocation.companyId,
        shopifyLocationId: payloadLocationId,
      },
      include: { erpnextInstance: true },
    });

    if (payloadLocation) {
      resolvedLocation = payloadLocation;
    }

    console.warn("[Order webhook] Payload/query location mismatch", {
      ...webhookMeta,
      companyId: resolvedLocation.companyId,
      queryShopifyLocationId: location.shopifyLocationId,
      payloadShopifyLocationId: payloadLocationId,
      resolvedCompanyLocationId: resolvedLocation.id,
    });
  }

  const seriesLocation = await resolveLocationByOrderSeries(location.companyId, data);
  if (seriesLocation && seriesLocation.id !== resolvedLocation.id) {
    resolvedLocation = seriesLocation;
    console.warn("[Order webhook] Order series location override", {
      ...webhookMeta,
      companyId: location.companyId,
      orderNumber: data.order_number != null ? String(data.order_number) : data.name,
      resolvedCompanyLocationId: resolvedLocation.id,
      resolvedCompanyLocationName: resolvedLocation.name,
    });
  }

  const shopifyOrderId = String(data.id);

  if (isShopifyOrderBeforeImportCutoff(data.created_at)) {
    const cutoff = getOrderImportCutoff();
    console.warn("[Order webhook] Skipping pre-cutoff Shopify order", {
      ...webhookMeta,
      shopifyOrderId,
      shopifyCreatedAt: data.created_at,
      cutoff: cutoff?.toISOString(),
    });
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "before_import_cutoff",
    });
  }

  const existingOrder = await prisma.order.findUnique({
    where: { shopifyOrderId },
    select: { id: true },
  });

  if (shouldSkipShopifyOrderWebhookForMissingOrder(shopifyTopic, !!existingOrder)) {
    console.warn("[Order webhook] Skipping update webhook for order not in Vault OS", {
      ...webhookMeta,
      shopifyOrderId,
      shopifyTopic,
    });
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "order_not_in_system",
    });
  }

  try {
    await processOrderWebhookWithImmediateRetry({
      data,
      location: resolvedLocation,
      rawPayload,
      shopifyOrderId,
      webhookMeta,
    });
    void runDueFailedOrderWebhookRetries({
      companyId: resolvedLocation.companyId,
      limit: 1,
    });
    void runDueFailedErpSyncRetries({
      companyId: resolvedLocation.companyId,
      limit: 1,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack ?? null : null;

    await createFailedOrderWebhook({
      companyId: resolvedLocation.companyId,
      companyLocationId: resolvedLocation.id,
      shopifyOrderId,
      shopifyTopic,
      errorMessage,
      errorStack,
      rawPayload: rawPayload as object,
      scheduleAutoRetry: true,
    });

    void runDueFailedOrderWebhookRetries({
      companyId: resolvedLocation.companyId,
      limit: 1,
    });
    void runDueFailedErpSyncRetries({
      companyId: resolvedLocation.companyId,
      limit: 1,
    });

    console.error("[Order webhook] Failed to process:", shopifyOrderId, error);

    return NextResponse.json(
      { error: "Failed to process order", details: errorMessage },
      { status: 500 }
    );
  }
}
