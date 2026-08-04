import { Prisma } from "@prisma/client";

import { addressFromShopifyRest } from "@/lib/abandoned-checkout-address";
import { prisma } from "@/lib/prisma";
import { LIMITS } from "@/lib/validation";
import type { ShopifyCheckoutWebhookPayload } from "@/lib/validation/shopify-checkout";

function checkoutGidFromId(checkoutId: string) {
  return `gid://shopify/AbandonedCheckout/${checkoutId}`;
}

function buildLineItemsSummary(
  lineItems: Array<{ title?: string | null; quantity?: number | null }>
) {
  const parts = lineItems
    .filter((li) => li.title?.trim() && typeof li.quantity === "number")
    .slice(0, 10)
    .map((li) => `${li.title!.trim()} x${li.quantity}`);
  const joined = parts.join(", ");
  if (!joined) return "";
  return joined.length > LIMITS.description.max ? joined.slice(0, LIMITS.description.max) : joined;
}

function resolveStoreHandle(location: {
  shopifyAdminStoreHandle: string | null;
  shopifyShopName: string | null;
}) {
  if (location.shopifyAdminStoreHandle?.trim()) {
    return location.shopifyAdminStoreHandle.trim();
  }
  const shop = location.shopifyShopName?.trim().toLowerCase() ?? "";
  if (shop.endsWith(".myshopify.com")) {
    return shop.replace(/\.myshopify\.com$/, "");
  }
  return shop || "unknown-store";
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function preferText(next: string | null | undefined, prev: string | null | undefined) {
  const n = next?.trim();
  if (n) return n;
  const p = prev?.trim();
  return p || null;
}

function nameFromRestAddress(
  address:
    | {
        name?: string | null;
        first_name?: string | null;
        last_name?: string | null;
      }
    | null
    | undefined
) {
  if (!address) return null;
  const full = address.name?.trim();
  if (full) return full;
  const joined = [address.first_name, address.last_name]
    .map((v) => v?.trim())
    .filter(Boolean)
    .join(" ");
  return joined || null;
}

function resolveCustomerName(data: ShopifyCheckoutWebhookPayload) {
  const fromCustomer = [data.customer?.first_name, data.customer?.last_name]
    .map((v) => v?.trim())
    .filter(Boolean)
    .join(" ");
  if (fromCustomer) return fromCustomer;

  return (
    nameFromRestAddress(data.billing_address) ||
    nameFromRestAddress(data.shipping_address) ||
    null
  );
}

function resolveCustomerEmail(data: ShopifyCheckoutWebhookPayload) {
  return data.email?.trim() || data.customer?.email?.trim() || null;
}

function resolveCustomerPhone(data: ShopifyCheckoutWebhookPayload) {
  return (
    data.phone?.trim() ||
    data.customer?.phone?.trim() ||
    data.billing_address?.phone?.trim() ||
    data.shipping_address?.phone?.trim() ||
    data.sms_marketing_phone?.trim() ||
    null
  );
}

/**
 * Upsert an abandoned-checkout row from Shopify checkouts/* webhook (Vault path).
 */
export async function upsertAbandonedCheckoutFromWebhook(input: {
  companyId: string;
  companyLocationId: string;
  shopifyAdminStoreHandle: string | null;
  shopifyShopName: string | null;
  topic: string | null;
  data: ShopifyCheckoutWebhookPayload;
}) {
  const checkoutId = String(input.data.id);
  const shopifyCheckoutGid = checkoutGidFromId(checkoutId);
  const storeHandle = resolveStoreHandle({
    shopifyAdminStoreHandle: input.shopifyAdminStoreHandle,
    shopifyShopName: input.shopifyShopName,
  });

  const abandonedAt = parseDate(input.data.created_at) ?? new Date();
  const shopifyUpdatedAt = parseDate(input.data.updated_at);
  const shopifyCompletedAt = parseDate(input.data.completed_at);
  const recovered = Boolean(shopifyCompletedAt) || input.topic === "checkouts/delete";

  const existing = await prisma.shopifyAbandonedCheckout.findUnique({
    where: {
      companyId_shopifyCheckoutGid: {
        companyId: input.companyId,
        shopifyCheckoutGid,
      },
    },
    select: {
      followUpStatus: true,
      customerResponse: true,
      remark: true,
      shopifyRecoveredAt: true,
      customerName: true,
      customerEmail: true,
      customerPhone: true,
      billingAddressText: true,
      shippingAddressText: true,
    },
  });

  const keepManualClosed =
    recovered &&
    existing?.followUpStatus === "closed" &&
    Boolean(existing.customerResponse) &&
    existing.customerResponse !== "recovered_sale";

  const nextFollowUpStatus = keepManualClosed
    ? "closed"
    : recovered
      ? "closed"
      : (existing?.followUpStatus ?? "pending");

  const nextCustomerResponse = keepManualClosed
    ? existing?.customerResponse ?? null
    : recovered
      ? "recovered_sale"
      : existing?.customerResponse ?? null;

  // Prefer newer non-empty values; never wipe contact fields with a sparse later webhook.
  const customerName = preferText(resolveCustomerName(input.data), existing?.customerName);
  const customerEmail = preferText(resolveCustomerEmail(input.data), existing?.customerEmail);
  const customerPhone = preferText(resolveCustomerPhone(input.data), existing?.customerPhone);

  const billingAddressText = preferText(
    addressFromShopifyRest(
      input.data.billing_address as Record<string, unknown> | null | undefined
    ),
    existing?.billingAddressText
  );
  const shippingAddressText = preferText(
    addressFromShopifyRest(
      input.data.shipping_address as Record<string, unknown> | null | undefined
    ),
    existing?.shippingAddressText
  );

  const lineItems = input.data.line_items ?? [];
  const lineItemsSummary = buildLineItemsSummary(lineItems);
  const totalPrice = input.data.total_price ?? "0";
  const currency = input.data.currency ?? "LKR";

  const common = {
    companyId: input.companyId,
    shopifyCheckoutGid,
    shopifyCheckoutId: checkoutId,
    shopifyAdminStoreHandle: storeHandle,
    companyLocationId: input.companyLocationId,
    customerName,
    customerEmail,
    customerPhone,
    billingAddressText,
    shippingAddressText,
    lineItemsSummary: lineItemsSummary || "",
    lineItemsJson: lineItems.length
      ? (lineItems as unknown as Prisma.InputJsonValue)
      : Prisma.JsonNull,
    totalPrice: new Prisma.Decimal(totalPrice),
    currency,
    abandonedAt,
    shopifyUpdatedAt,
    shopifyCompletedAt,
    shopifyRecoveredAt: recovered
      ? existing?.shopifyRecoveredAt ?? new Date()
      : existing?.shopifyRecoveredAt ?? null,
    abandonedCheckoutUrl: input.data.abandoned_checkout_url ?? null,
    followUpStatus: nextFollowUpStatus,
    customerResponse: nextCustomerResponse,
    remark: existing?.remark ?? null,
  };

  if (existing) {
    await prisma.shopifyAbandonedCheckout.update({
      where: {
        companyId_shopifyCheckoutGid: {
          companyId: input.companyId,
          shopifyCheckoutGid,
        },
      },
      data: common,
    });
  } else {
    await prisma.shopifyAbandonedCheckout.create({
      data: {
        ...common,
        lastFollowUpById: null,
        lastFollowUpAt: null,
      },
    });
  }

  await prisma.companyAbandonedCheckoutSync.upsert({
    where: { companyId: input.companyId },
    create: {
      companyId: input.companyId,
      lastSyncedAt: new Date(),
      lastSyncError: null,
    },
    update: {
      lastSyncedAt: new Date(),
      lastSyncError: null,
    },
  });

  return { shopifyCheckoutGid, recovered };
}

async function closeAbandonedCheckoutAsRecovered(row: {
  id: string;
  followUpStatus: string;
  customerResponse: string | null;
}) {
  const keepManualClosed =
    row.followUpStatus === "closed" &&
    Boolean(row.customerResponse) &&
    row.customerResponse !== "recovered_sale";

  if (!keepManualClosed) {
    await prisma.shopifyAbandonedCheckout.update({
      where: { id: row.id },
      data: {
        followUpStatus: "closed",
        customerResponse: "recovered_sale",
        shopifyCompletedAt: new Date(),
        shopifyRecoveredAt: new Date(),
      },
    });
  }
}

/**
 * Mark matching abandoned checkout as recovered when an order is created.
 * Prefers Shopify order `checkout_token` (2026-04+), then `checkout_id`.
 */
export async function markAbandonedCheckoutRecoveredFromOrder(input: {
  companyId: string;
  checkoutId?: string | number | null;
  checkoutToken?: string | null;
  customerEmail?: string | null;
}) {
  const candidates = [
    input.checkoutToken != null ? String(input.checkoutToken).trim() : "",
    input.checkoutId != null ? String(input.checkoutId).trim() : "",
  ].filter(Boolean);

  for (const checkoutKey of candidates) {
    const gid = checkoutGidFromId(checkoutKey);
    const row = await prisma.shopifyAbandonedCheckout.findUnique({
      where: {
        companyId_shopifyCheckoutGid: {
          companyId: input.companyId,
          shopifyCheckoutGid: gid,
        },
      },
      select: {
        id: true,
        followUpStatus: true,
        customerResponse: true,
      },
    });

    if (row) {
      await closeAbandonedCheckoutAsRecovered(row);
      return {
        matched: true as const,
        by:
          checkoutKey === String(input.checkoutToken ?? "").trim()
            ? ("checkout_token" as const)
            : ("checkout_id" as const),
      };
    }
  }

  // Soft fallback: recent open checkout with same email (Vault may lack checkout ids on some orders)
  const email = input.customerEmail?.trim().toLowerCase();
  if (email) {
    const recent = await prisma.shopifyAbandonedCheckout.findFirst({
      where: {
        companyId: input.companyId,
        customerEmail: { equals: email, mode: "insensitive" },
        followUpStatus: { in: ["pending", "follow_up"] },
        abandonedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { abandonedAt: "desc" },
      select: { id: true, followUpStatus: true, customerResponse: true },
    });
    if (recent) {
      await closeAbandonedCheckoutAsRecovered(recent);
      return { matched: true as const, by: "email" as const };
    }
  }

  return { matched: false as const, by: null };
}
