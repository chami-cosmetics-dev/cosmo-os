import type { ShopifyOrderWebhookPayload } from "@/lib/validation/shopify-order";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit-log";
import { LIMITS } from "@/lib/validation";

type SyncContactMasterFromOrderInput = {
  companyId: string;
  shopifyOrderId: string;
  orderNumber: string | null;
  orderCreatedAt: Date;
  order: ShopifyOrderWebhookPayload;
  recentMerchant?: string | null;
};

function normalizeEmail(value: string | null | undefined) {
  const trimmed = value?.trim().toLowerCase() ?? "";
  return trimmed ? trimmed.slice(0, LIMITS.email.max) : null;
}

function normalizePhone(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed.slice(0, LIMITS.mobile.max) : null;
}

function normalizeName(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed.slice(0, LIMITS.name.max) : null;
}

function normalizeMerchant(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed.slice(0, LIMITS.name.max) : null;
}

function isBlank(value: string | null | undefined) {
  return !value || !value.trim();
}

function pickBestCustomerName(order: ShopifyOrderWebhookPayload) {
  const shippingName = normalizeName(order.shipping_address?.name);
  if (shippingName) return shippingName;

  const shippingParts = [
    normalizeName(order.shipping_address?.first_name),
    normalizeName(order.shipping_address?.last_name),
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (shippingParts) return shippingParts.slice(0, LIMITS.name.max);

  const customerParts = [
    normalizeName(order.customer?.first_name),
    normalizeName(order.customer?.last_name),
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (customerParts) return customerParts.slice(0, LIMITS.name.max);

  return null;
}

function buildOrderLabel(shopifyOrderId: string, orderNumber: string | null) {
  return orderNumber?.trim() || shopifyOrderId;
}

export async function syncContactMasterFromShopifyOrder(input: SyncContactMasterFromOrderInput) {
  const email = normalizeEmail(
    input.order.contact_email ?? input.order.email ?? input.order.customer?.email ?? null
  );
  const phoneNumber = normalizePhone(input.order.phone ?? input.order.customer?.phone ?? null);

  if (!email && !phoneNumber) {
    return;
  }

  const name = pickBestCustomerName(input.order);
  const recentMerchant = normalizeMerchant(input.recentMerchant);
  const orderLabel = buildOrderLabel(input.shopifyOrderId, input.orderNumber);

  const candidates = await prisma.contactMaster.findMany({
    where: {
      companyId: input.companyId,
      OR: [
        ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []),
        ...(phoneNumber ? [{ phoneNumber }] : []),
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      recentMerchant: true,
      lastPurchaseAt: true,
    },
  });

  const emailMatches = email
    ? candidates.filter((contact) => contact.email?.trim().toLowerCase() === email)
    : [];
  const phoneMatches = phoneNumber
    ? candidates.filter((contact) => contact.phoneNumber?.trim() === phoneNumber)
    : [];

  if (emailMatches.length > 1 || phoneMatches.length > 1) {
    await writeAuditLog({
      companyId: input.companyId,
      module: "contacts",
      action: "contact_auto_sync_conflict",
      entityType: "ContactMaster",
      entityId: null,
      summary: `Skipped auto-sync for Shopify order ${orderLabel} due to duplicate contact matches`,
      metadata: {
        shopifyOrderId: input.shopifyOrderId,
        orderNumber: input.orderNumber,
        email,
        phoneNumber,
        emailMatchIds: emailMatches.map((contact) => contact.id),
        phoneMatchIds: phoneMatches.map((contact) => contact.id),
        reason: "duplicate_matches",
      },
    });
    return;
  }

  const emailMatch = emailMatches[0] ?? null;
  const phoneMatch = phoneMatches[0] ?? null;

  if (emailMatch && phoneMatch && emailMatch.id !== phoneMatch.id) {
    await writeAuditLog({
      companyId: input.companyId,
      module: "contacts",
      action: "contact_auto_sync_conflict",
      entityType: "ContactMaster",
      entityId: null,
      summary: `Skipped auto-sync for Shopify order ${orderLabel} due to conflicting email/phone matches`,
      metadata: {
        shopifyOrderId: input.shopifyOrderId,
        orderNumber: input.orderNumber,
        email,
        phoneNumber,
        emailMatchId: emailMatch.id,
        phoneMatchId: phoneMatch.id,
        reason: "identifier_conflict",
      },
    });
    return;
  }

  const matchedContact = emailMatch ?? phoneMatch;

  if (!matchedContact) {
    const created = await prisma.contactMaster.create({
      data: {
        companyId: input.companyId,
        name: name ?? email ?? phoneNumber ?? "Shopify Contact",
        email,
        phoneNumber,
        recentMerchant,
        lastPurchaseAt: input.orderCreatedAt,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        recentMerchant: true,
        lastPurchaseAt: true,
      },
    });

    await writeAuditLog({
      companyId: input.companyId,
      module: "contacts",
      action: "contact_auto_created",
      entityType: "ContactMaster",
      entityId: created.id,
      summary: `Auto-created contact ${created.name} from Shopify order ${orderLabel}`,
      afterData: {
        name: created.name,
        email: created.email,
        phoneNumber: created.phoneNumber,
        recentMerchant: created.recentMerchant,
        lastPurchaseAt: created.lastPurchaseAt,
      },
      metadata: {
        shopifyOrderId: input.shopifyOrderId,
        orderNumber: input.orderNumber,
      },
    });
    return;
  }

  const updateData: {
    name?: string;
    email?: string;
    phoneNumber?: string;
    recentMerchant?: string;
    lastPurchaseAt?: Date;
  } = {};

  if (isBlank(matchedContact.name) && name) {
    updateData.name = name;
  }
  if (isBlank(matchedContact.email) && email) {
    updateData.email = email;
  }
  if (isBlank(matchedContact.phoneNumber) && phoneNumber) {
    updateData.phoneNumber = phoneNumber;
  }
  if (isBlank(matchedContact.recentMerchant) && recentMerchant) {
    updateData.recentMerchant = recentMerchant;
  }
  if (!matchedContact.lastPurchaseAt || input.orderCreatedAt > matchedContact.lastPurchaseAt) {
    updateData.lastPurchaseAt = input.orderCreatedAt;
  }

  if (Object.keys(updateData).length === 0) {
    return;
  }

  const updated = await prisma.contactMaster.update({
    where: { id: matchedContact.id },
    data: updateData,
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      recentMerchant: true,
      lastPurchaseAt: true,
    },
  });

  await writeAuditLog({
    companyId: input.companyId,
    module: "contacts",
    action: "contact_auto_enriched",
    entityType: "ContactMaster",
    entityId: updated.id,
    summary: `Auto-enriched contact ${updated.name} from Shopify order ${orderLabel}`,
    beforeData: {
      name: matchedContact.name,
      email: matchedContact.email,
      phoneNumber: matchedContact.phoneNumber,
      recentMerchant: matchedContact.recentMerchant,
      lastPurchaseAt: matchedContact.lastPurchaseAt,
    },
    afterData: {
      name: updated.name,
      email: updated.email,
      phoneNumber: updated.phoneNumber,
      recentMerchant: updated.recentMerchant,
      lastPurchaseAt: updated.lastPurchaseAt,
    },
    metadata: {
      shopifyOrderId: input.shopifyOrderId,
      orderNumber: input.orderNumber,
      updatedFields: Object.keys(updateData),
    },
  });
}
