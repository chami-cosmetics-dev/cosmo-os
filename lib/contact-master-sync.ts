import type { ShopifyOrderWebhookPayload } from "@/lib/validation/shopify-order";

import { writeAuditLog } from "@/lib/audit-log";
import { buildPhoneLookupVariants } from "@/lib/phone-lookup";
import { prisma } from "@/lib/prisma";
import { LIMITS } from "@/lib/validation";

type SyncContactMasterInput = {
  companyId: string;
  sourceLabel: string;
  sourceType?: "shopify_order" | "order_backfill";
  sourceId: string;
  orderNumber?: string | null;
  occurredAt: Date;
  email?: string | null;
  phoneNumber?: string | null;
  name?: string | null;
  recentMerchant?: string | null;
  auditBehavior?: "full" | "summary_only";
};

type SyncContactMasterResult =
  | { status: "created"; contactId: string }
  | { status: "enriched"; contactId: string }
  | { status: "unchanged"; contactId: string }
  | { status: "conflict" }
  | { status: "skipped_no_identifier" };

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

function buildSourceLabel(sourceId: string, orderNumber?: string | null) {
  return orderNumber?.trim() || sourceId;
}

export async function syncContactMaster(input: SyncContactMasterInput): Promise<SyncContactMasterResult> {
  const auditBehavior = input.auditBehavior ?? "full";
  const email = normalizeEmail(input.email ?? null);
  const phoneNumber = normalizePhone(input.phoneNumber ?? null);

  if (!email && !phoneNumber) {
    return { status: "skipped_no_identifier" };
  }

  const name = normalizeName(input.name ?? null);
  const recentMerchant = normalizeMerchant(input.recentMerchant);
  const orderLabel = buildSourceLabel(input.sourceId, input.orderNumber);
  const phoneVariants = phoneNumber ? buildPhoneLookupVariants(phoneNumber) : [];

  const candidates = await prisma.contactMaster.findMany({
    where: {
      companyId: input.companyId,
      OR: [
        ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []),
        ...(phoneVariants.length > 0 ? [{ phoneNumber: { in: phoneVariants } }] : []),
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
  const phoneMatches = phoneVariants.length > 0
    ? candidates.filter((contact) => {
        const existingPhone = contact.phoneNumber?.trim();
        return existingPhone ? phoneVariants.includes(existingPhone) : false;
      })
    : [];

  if (emailMatches.length > 1 || phoneMatches.length > 1) {
    if (auditBehavior === "full") {
      await writeAuditLog({
        companyId: input.companyId,
        module: "contacts",
        action: "contact_auto_sync_conflict",
        entityType: "ContactMaster",
        entityId: null,
        summary: `Skipped contact sync for ${input.sourceLabel} ${orderLabel} due to duplicate contact matches`,
        metadata: {
          sourceType: input.sourceType ?? "shopify_order",
          sourceId: input.sourceId,
          orderNumber: input.orderNumber,
          email,
          phoneNumber,
          emailMatchIds: emailMatches.map((contact) => contact.id),
          phoneMatchIds: phoneMatches.map((contact) => contact.id),
          reason: "duplicate_matches",
        },
      });
    }
    return { status: "conflict" };
  }

  const emailMatch = emailMatches[0] ?? null;
  const phoneMatch = phoneMatches[0] ?? null;

  if (emailMatch && phoneMatch && emailMatch.id !== phoneMatch.id) {
    if (auditBehavior === "full") {
      await writeAuditLog({
        companyId: input.companyId,
        module: "contacts",
        action: "contact_auto_sync_conflict",
        entityType: "ContactMaster",
        entityId: null,
        summary: `Skipped contact sync for ${input.sourceLabel} ${orderLabel} due to conflicting email/phone matches`,
        metadata: {
          sourceType: input.sourceType ?? "shopify_order",
          sourceId: input.sourceId,
          orderNumber: input.orderNumber,
          email,
          phoneNumber,
          emailMatchId: emailMatch.id,
          phoneMatchId: phoneMatch.id,
          reason: "identifier_conflict",
        },
      });
    }
    return { status: "conflict" };
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
        lastPurchaseAt: input.occurredAt,
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

    if (auditBehavior === "full") {
      await writeAuditLog({
        companyId: input.companyId,
        module: "contacts",
        action: "contact_auto_created",
        entityType: "ContactMaster",
        entityId: created.id,
        summary: `Auto-created contact ${created.name} from ${input.sourceLabel} ${orderLabel}`,
        afterData: {
          name: created.name,
          email: created.email,
          phoneNumber: created.phoneNumber,
          recentMerchant: created.recentMerchant,
          lastPurchaseAt: created.lastPurchaseAt,
        },
        metadata: {
          sourceType: input.sourceType ?? "shopify_order",
          sourceId: input.sourceId,
          orderNumber: input.orderNumber,
        },
      });
    }
    return { status: "created", contactId: created.id };
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
  if (!matchedContact.lastPurchaseAt || input.occurredAt > matchedContact.lastPurchaseAt) {
    updateData.lastPurchaseAt = input.occurredAt;
  }

  if (Object.keys(updateData).length === 0) {
    return { status: "unchanged", contactId: matchedContact.id };
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

  if (auditBehavior === "full") {
    await writeAuditLog({
      companyId: input.companyId,
      module: "contacts",
      action: "contact_auto_enriched",
      entityType: "ContactMaster",
      entityId: updated.id,
      summary: `Auto-enriched contact ${updated.name} from ${input.sourceLabel} ${orderLabel}`,
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
        sourceType: input.sourceType ?? "shopify_order",
        sourceId: input.sourceId,
        orderNumber: input.orderNumber,
        updatedFields: Object.keys(updateData),
      },
    });
  }
  return { status: "enriched", contactId: updated.id };
}

export async function syncContactMasterFromShopifyOrder(input: SyncContactMasterFromOrderInput) {
  return syncContactMaster({
    companyId: input.companyId,
    sourceLabel: "Shopify order",
    sourceType: "shopify_order",
    sourceId: input.shopifyOrderId,
    orderNumber: input.orderNumber,
    occurredAt: input.orderCreatedAt,
    email: input.order.contact_email ?? input.order.email ?? input.order.customer?.email ?? null,
    phoneNumber: input.order.phone ?? input.order.customer?.phone ?? null,
    name: pickBestCustomerName(input.order),
    recentMerchant: input.recentMerchant,
    auditBehavior: "full",
  });
}
