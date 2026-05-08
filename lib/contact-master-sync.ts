import type { ShopifyOrderWebhookPayload } from "@/lib/validation/shopify-order";

import { writeAuditLog } from "@/lib/audit-log";
import {
  ensureSecondaryContactIdentifiers,
  findMatchingContacts,
  normalizeContactEmail,
  normalizeContactPhone,
} from "@/lib/contact-identifiers";
import { prisma } from "@/lib/prisma";
import { LIMITS } from "@/lib/validation";

type SyncContactMasterInput = {
  companyId: string;
  sourceLabel: string;
  sourceType?: "shopify_order" | "order_backfill" | "manual_order";
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
  return normalizeContactEmail(value);
}

function normalizePhone(value: string | null | undefined) {
  return normalizeContactPhone(value);
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

async function updatePurchaseSnapshotForContacts(input: {
  contactIds: string[];
  occurredAt: Date;
  recentMerchant: string | null;
}) {
  const uniqueIds = [...new Set(input.contactIds)];
  if (uniqueIds.length === 0) return 0;

  const purchaseDateResult = await prisma.contactMaster.updateMany({
    where: {
      id: { in: uniqueIds },
      OR: [
        { lastPurchaseAt: null },
        { lastPurchaseAt: { lt: input.occurredAt } },
      ],
    },
    data: {
      ...(input.recentMerchant ? { recentMerchant: input.recentMerchant } : {}),
      lastPurchaseAt: input.occurredAt,
    },
  });

  if (!input.recentMerchant) {
    return purchaseDateResult.count;
  }

  const merchantResult = await prisma.contactMaster.updateMany({
    where: {
      id: { in: uniqueIds },
      recentMerchant: null,
    },
    data: {
      recentMerchant: input.recentMerchant,
    },
  });

  return purchaseDateResult.count + merchantResult.count;
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

function buildContactSyncLockKey(companyId: string, email: string | null, phoneNumber: string | null) {
  return `contact-sync:${companyId}:${email ?? ""}:${phoneNumber ?? ""}`;
}

async function syncContactMasterPrimaryOnly(input: SyncContactMasterInput): Promise<SyncContactMasterResult> {
  const email = normalizeEmail(input.email ?? null);
  const phoneNumber = normalizePhone(input.phoneNumber ?? null);

  if (!email && !phoneNumber) {
    return { status: "skipped_no_identifier" };
  }

  const name = normalizeName(input.name ?? null);
  const recentMerchant = normalizeMerchant(input.recentMerchant);

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
    return { status: "conflict" };
  }

  const emailMatch = emailMatches[0] ?? null;
  const phoneMatch = phoneMatches[0] ?? null;

  if (emailMatch && phoneMatch && emailMatch.id !== phoneMatch.id) {
    return { status: "conflict" };
  }

  const matchedContact = emailMatch ?? phoneMatch;

  if (!matchedContact) {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtext(${buildContactSyncLockKey(input.companyId, email, phoneNumber)}))`;
      const existing = await tx.contactMaster.findFirst({
        where: {
          companyId: input.companyId,
          OR: [
            ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []),
            ...(phoneNumber ? [{ phoneNumber }] : []),
          ],
        },
        select: { id: true },
      });
      if (existing) {
        return { status: "unchanged" as const, contactId: existing.id };
      }

      const created = await tx.contactMaster.create({
        data: {
          companyId: input.companyId,
          name: name ?? email ?? phoneNumber ?? "Shopify Contact",
          email,
          phoneNumber,
          recentMerchant,
          lastPurchaseAt: input.occurredAt,
        },
        select: { id: true },
      });
      return { status: "created" as const, contactId: created.id };
    });
    return result;
  }

  const updateData: {
    name?: string;
    email?: string;
    phoneNumber?: string;
    recentMerchant?: string;
    lastPurchaseAt?: Date;
  } = {};

  if (isBlank(matchedContact.name) && name) updateData.name = name;
  if (isBlank(matchedContact.email) && email) updateData.email = email;
  if (isBlank(matchedContact.phoneNumber) && phoneNumber) updateData.phoneNumber = phoneNumber;
  if (isBlank(matchedContact.recentMerchant) && recentMerchant) updateData.recentMerchant = recentMerchant;
  if (!matchedContact.lastPurchaseAt || input.occurredAt > matchedContact.lastPurchaseAt) {
    updateData.lastPurchaseAt = input.occurredAt;
  }

  if (Object.keys(updateData).length === 0) {
    return { status: "unchanged", contactId: matchedContact.id };
  }

  const updated = await prisma.contactMaster.update({
    where: { id: matchedContact.id },
    data: updateData,
    select: { id: true },
  });
  return { status: "enriched", contactId: updated.id };
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
  const { emailMatches, phoneMatches } = await findMatchingContacts(input.companyId, email, phoneNumber);

  if (emailMatches.length > 1 || phoneMatches.length > 1) {
    const purchaseSnapshotContactIds = [
      ...emailMatches.map((contact) => contact.id),
      ...phoneMatches.map((contact) => contact.id),
    ];
    const purchaseSnapshotUpdatedCount = await updatePurchaseSnapshotForContacts({
      contactIds: purchaseSnapshotContactIds,
      occurredAt: input.occurredAt,
      recentMerchant,
    });

    if (auditBehavior === "full") {
      await writeAuditLog({
        companyId: input.companyId,
        module: "contacts",
        action: "contact_auto_sync_conflict",
        entityType: "ContactMaster",
        entityId: null,
        summary: `Skipped contact identity sync for ${input.sourceLabel} ${orderLabel} due to duplicate contact matches`,
        metadata: {
          sourceType: input.sourceType ?? "shopify_order",
          sourceId: input.sourceId,
          orderNumber: input.orderNumber,
          email,
          phoneNumber,
          emailMatchIds: emailMatches.map((contact) => contact.id),
          phoneMatchIds: phoneMatches.map((contact) => contact.id),
          purchaseSnapshotContactIds: [...new Set(purchaseSnapshotContactIds)],
          purchaseSnapshotUpdatedCount,
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
    const createResult = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtext(${buildContactSyncLockKey(input.companyId, email, phoneNumber)}))`;
      const rechecked = await findMatchingContacts(input.companyId, email, phoneNumber, tx as never);
      if (rechecked.emailMatches.length > 1 || rechecked.phoneMatches.length > 1) {
        return { status: "conflict" as const };
      }

      const recheckedEmailMatch = rechecked.emailMatches[0] ?? null;
      const recheckedPhoneMatch = rechecked.phoneMatches[0] ?? null;
      if (recheckedEmailMatch && recheckedPhoneMatch && recheckedEmailMatch.id !== recheckedPhoneMatch.id) {
        return { status: "conflict" as const };
      }

      const recheckedContact = recheckedEmailMatch ?? recheckedPhoneMatch;
      if (recheckedContact) {
        return { status: "unchanged" as const, contactId: recheckedContact.id };
      }

      const created = await tx.contactMaster.create({
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
      return { status: "created" as const, contact: created };
    });

    if (createResult.status === "conflict") {
      return { status: "conflict" };
    }
    if (createResult.status === "unchanged") {
      return { status: "unchanged", contactId: createResult.contactId };
    }

    const created = createResult.contact;

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

  await ensureSecondaryContactIdentifiers({
    contactId: matchedContact.id,
    primaryEmail: matchedContact.email,
    primaryPhoneNumber: matchedContact.phoneNumber,
    email,
    phoneNumber,
  });

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
  const syncInput: SyncContactMasterInput = {
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
  };

  try {
    return await syncContactMaster(syncInput);
  } catch (error) {
    console.error("[contact sync] Shopify primary sync fallback triggered:", error);
    return syncContactMasterPrimaryOnly(syncInput);
  }
}

export async function syncContactMasterSafely(input: SyncContactMasterInput) {
  try {
    return await syncContactMaster(input);
  } catch (error) {
    console.error("[contact sync] Primary sync fallback triggered:", error);
    return syncContactMasterPrimaryOnly(input);
  }
}
