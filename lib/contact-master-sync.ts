import type { ShopifyOrderWebhookPayload } from "@/lib/validation/shopify-order";

import { writeAuditLog } from "@/lib/audit-log";
import {
  ensureSecondaryContactIdentifiers,
  findMatchingContacts,
  normalizeContactEmail,
  normalizeContactPhone,
} from "@/lib/contact-identifiers";
import { resolveAutoAllocateMerchant } from "@/lib/customer-insight/auto-allocate";
import { buildPhoneLookupVariants } from "@/lib/phone-lookup";
import { prisma } from "@/lib/prisma";
import { LIMITS } from "@/lib/validation";

export type ContactMasterSyncSourceType =
  | "shopify_order"
  | "order_backfill"
  | "manual_order"
  | "erpnext_si"
  | "erp_customer_backfill";

type SyncContactMasterInput = {
  companyId: string;
  sourceLabel: string;
  sourceType?: ContactMasterSyncSourceType;
  /** ContactMaster.source value on create (e.g. erp1 / erp2). Only set when blank. */
  source?: string | null;
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

/** True when either side is blank, or both resolve to the same phone via lookup variants. */
function phonesCompatible(left: string | null | undefined, right: string | null | undefined) {
  const a = normalizePhone(left);
  const b = normalizePhone(right);
  if (!a || !b) return true;
  const leftVariants = new Set(buildPhoneLookupVariants(a));
  return buildPhoneLookupVariants(b).some((variant) => leftVariants.has(variant));
}

type IdentityContact = {
  id: string;
  name: string;
  email: string | null;
  phoneNumber: string | null;
  recentMerchant: string | null;
  assignedMerchant: string | null;
  lastPurchaseAt: Date | null;
  source: string | null;
};

/**
 * Phone is primary identity. A shared checkout email (staff/store) must not merge
 * different customer phones onto one Contact Master row, and must not conflict when
 * the same phone reorders using that shared email.
 */
function resolveIdentityMatch(
  emailMatch: IdentityContact | null,
  phoneMatch: IdentityContact | null,
  incomingPhone: string | null
): { status: "match"; contact: IdentityContact } | { status: "conflict" } | { status: "none" } {
  if (phoneMatch) {
    return { status: "match", contact: phoneMatch };
  }
  if (emailMatch && phonesCompatible(emailMatch.phoneNumber, incomingPhone)) {
    return { status: "match", contact: emailMatch };
  }
  return { status: "none" };
}

/** Keep shared emails from being copied onto a different phone's contact. */
function emailSafeForContact(
  email: string | null,
  matchedContact: IdentityContact,
  emailMatch: IdentityContact | null,
  emailMatchCount = emailMatch ? 1 : 0
) {
  if (!email) return null;
  if (emailMatchCount > 1) return null;
  if (emailMatch && emailMatch.id !== matchedContact.id) return null;
  return email;
}

function emailForCreate(
  email: string | null,
  emailMatch: IdentityContact | null,
  incomingPhone: string | null,
  emailMatchCount = emailMatch ? 1 : 0
) {
  if (!email) return null;
  // Shared/ambiguous email already on multiple contacts → create phone-only.
  if (emailMatchCount > 1) return null;
  // Shared email already owned by a different phone → create phone-only contact.
  if (emailMatch && !phonesCompatible(emailMatch.phoneNumber, incomingPhone)) {
    return null;
  }
  return email;
}

/**
 * Duplicate emails are common (POS/staff checkout). Only hard-conflict when we
 * cannot safely identify by phone.
 */
function shouldHardConflictOnDuplicates(
  emailMatches: IdentityContact[],
  phoneMatches: IdentityContact[],
  phoneNumber: string | null
) {
  if (phoneMatches.length > 1) return true;
  if (emailMatches.length > 1 && !phoneNumber) return true;
  return false;
}

function pickEmailMatchForIdentity(emailMatches: IdentityContact[], phoneNumber: string | null) {
  if (emailMatches.length === 0) return null;
  if (emailMatches.length === 1) return emailMatches[0] ?? null;
  // Ambiguous shared email: only keep it if one row is phone-compatible.
  if (!phoneNumber) return null;
  return (
    emailMatches.find((contact) => phonesCompatible(contact.phoneNumber, phoneNumber)) ?? null
  );
}

/**
 * Secondary ContactPhone rows can falsely link unrelated numbers onto one contact.
 * Only treat a phone match as identity when the contact's primary phone is blank or compatible.
 */
function pickPhoneMatchForIdentity(phoneMatches: IdentityContact[], phoneNumber: string | null) {
  if (phoneMatches.length === 0) return null;
  if (phoneMatches.length > 1) return null;
  const match = phoneMatches[0] ?? null;
  if (!match) return null;
  if (!phoneNumber) return match;
  if (!match.phoneNumber || phonesCompatible(match.phoneNumber, phoneNumber)) {
    return match;
  }
  return null;
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

  // Auto-allocate only when assignedMerchant is empty (never overwrite).
  const allocateResult = await prisma.contactMaster.updateMany({
    where: {
      id: { in: uniqueIds },
      OR: [{ assignedMerchant: null }, { assignedMerchant: "" }],
    },
    data: {
      assignedMerchant: input.recentMerchant,
    },
  });

  return purchaseDateResult.count + merchantResult.count + allocateResult.count;
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

function defaultContactName(input: SyncContactMasterInput) {
  const isErp =
    input.sourceType === "erpnext_si" || input.sourceType === "erp_customer_backfill";
  return isErp ? "ERP Contact" : "Shopify Contact";
}

function normalizeSource(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed.slice(0, LIMITS.name.max) : null;
}

async function syncContactMasterPrimaryOnly(input: SyncContactMasterInput): Promise<SyncContactMasterResult> {
  const email = normalizeEmail(input.email ?? null);
  const phoneNumber = normalizePhone(input.phoneNumber ?? null);

  if (!email && !phoneNumber) {
    return { status: "skipped_no_identifier" };
  }

  const name = normalizeName(input.name ?? null);
  const recentMerchant = normalizeMerchant(input.recentMerchant);
  const source = normalizeSource(input.source);

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
      assignedMerchant: true,
      lastPurchaseAt: true,
      source: true,
    },
  });

  const emailMatches = email
    ? candidates.filter((contact) => contact.email?.trim().toLowerCase() === email)
    : [];
  const phoneMatches = phoneNumber
    ? candidates.filter((contact) => contact.phoneNumber?.trim() === phoneNumber)
    : [];

  if (shouldHardConflictOnDuplicates(emailMatches, phoneMatches, phoneNumber)) {
    return { status: "conflict" };
  }

  const emailMatch = pickEmailMatchForIdentity(emailMatches, phoneNumber);
  const phoneMatch = pickPhoneMatchForIdentity(phoneMatches, phoneNumber);

  const identity = resolveIdentityMatch(emailMatch, phoneMatch, phoneNumber);
  if (identity.status === "conflict") {
    return { status: "conflict" };
  }
  const matchedContact = identity.status === "match" ? identity.contact : null;

  if (!matchedContact) {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${buildContactSyncLockKey(input.companyId, email, phoneNumber)}))`;
      const existingCandidates = await tx.contactMaster.findMany({
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
          assignedMerchant: true,
          lastPurchaseAt: true,
          source: true,
        },
      });
      const recheckedEmailMatches = email
        ? existingCandidates.filter((c) => c.email?.trim().toLowerCase() === email)
        : [];
      const recheckedPhoneMatches = phoneNumber
        ? existingCandidates.filter((c) => c.phoneNumber?.trim() === phoneNumber)
        : [];
      if (shouldHardConflictOnDuplicates(recheckedEmailMatches, recheckedPhoneMatches, phoneNumber)) {
        return { status: "conflict" as const };
      }
      const recheckedEmail = pickEmailMatchForIdentity(recheckedEmailMatches, phoneNumber);
      const recheckedPhone = pickPhoneMatchForIdentity(recheckedPhoneMatches, phoneNumber);
      const recheckedIdentity = resolveIdentityMatch(recheckedEmail, recheckedPhone, phoneNumber);
      if (recheckedIdentity.status === "conflict") {
        return { status: "conflict" as const };
      }
      if (recheckedIdentity.status === "match") {
        return { status: "unchanged" as const, contactId: recheckedIdentity.contact.id };
      }

      const autoAssigned = resolveAutoAllocateMerchant({
        assignedMerchant: null,
        purchaseMerchantLabel: recentMerchant,
      });

      const created = await tx.contactMaster.create({
        data: {
          companyId: input.companyId,
          name: name ?? email ?? phoneNumber ?? defaultContactName(input),
          email: emailForCreate(email, recheckedEmail, phoneNumber, recheckedEmailMatches.length),
          phoneNumber,
          recentMerchant,
          ...(autoAssigned ? { assignedMerchant: autoAssigned } : {}),
          lastPurchaseAt: input.occurredAt,
          ...(source ? { source } : {}),
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
    assignedMerchant?: string;
    lastPurchaseAt?: Date;
    source?: string;
  } = {};

  const safeEmail = emailSafeForContact(email, matchedContact, emailMatch, emailMatches.length);
  if (isBlank(matchedContact.name) && name) updateData.name = name;
  if (isBlank(matchedContact.email) && safeEmail) updateData.email = safeEmail;
  if (isBlank(matchedContact.phoneNumber) && phoneNumber) updateData.phoneNumber = phoneNumber;
  if (isBlank(matchedContact.recentMerchant) && recentMerchant) updateData.recentMerchant = recentMerchant;
  if (isBlank(matchedContact.source) && source) updateData.source = source;
  if (!matchedContact.lastPurchaseAt || input.occurredAt > matchedContact.lastPurchaseAt) {
    updateData.lastPurchaseAt = input.occurredAt;
  }
  const autoAssigned = resolveAutoAllocateMerchant({
    assignedMerchant: matchedContact.assignedMerchant,
    purchaseMerchantLabel: recentMerchant,
  });
  if (autoAssigned) updateData.assignedMerchant = autoAssigned;

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
  const source = normalizeSource(input.source);
  const orderLabel = buildSourceLabel(input.sourceId, input.orderNumber);
  const { emailMatches, phoneMatches } = await findMatchingContacts(input.companyId, email, phoneNumber);

  if (shouldHardConflictOnDuplicates(emailMatches, phoneMatches, phoneNumber)) {
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

  const emailMatch = pickEmailMatchForIdentity(emailMatches, phoneNumber);
  const phoneMatch = pickPhoneMatchForIdentity(phoneMatches, phoneNumber);

  const identity = resolveIdentityMatch(emailMatch, phoneMatch, phoneNumber);
  if (identity.status === "conflict") {
    return { status: "conflict" };
  }
  const matchedContact = identity.status === "match" ? identity.contact : null;

  if (!matchedContact) {
    const createResult = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${buildContactSyncLockKey(input.companyId, email, phoneNumber)}))`;
      const rechecked = await findMatchingContacts(input.companyId, email, phoneNumber, tx as never);
      if (shouldHardConflictOnDuplicates(rechecked.emailMatches, rechecked.phoneMatches, phoneNumber)) {
        return { status: "conflict" as const };
      }

      const recheckedEmailMatch = pickEmailMatchForIdentity(rechecked.emailMatches, phoneNumber);
      const recheckedPhoneMatch = pickPhoneMatchForIdentity(rechecked.phoneMatches, phoneNumber);
      const recheckedIdentity = resolveIdentityMatch(
        recheckedEmailMatch,
        recheckedPhoneMatch,
        phoneNumber
      );
      if (recheckedIdentity.status === "conflict") {
        return { status: "conflict" as const };
      }
      if (recheckedIdentity.status === "match") {
        return { status: "unchanged" as const, contactId: recheckedIdentity.contact.id };
      }

      const autoAssigned = resolveAutoAllocateMerchant({
        assignedMerchant: null,
        purchaseMerchantLabel: recentMerchant,
      });

      const createdEmail = emailForCreate(
        email,
        recheckedEmailMatch,
        phoneNumber,
        rechecked.emailMatches.length
      );
      const created = await tx.contactMaster.create({
        data: {
          companyId: input.companyId,
          name: name ?? createdEmail ?? phoneNumber ?? defaultContactName(input),
          email: createdEmail,
          phoneNumber,
          recentMerchant,
          ...(autoAssigned ? { assignedMerchant: autoAssigned } : {}),
          lastPurchaseAt: input.occurredAt,
          ...(source ? { source } : {}),
        },
        select: {
          id: true,
          name: true,
          email: true,
          phoneNumber: true,
          recentMerchant: true,
          assignedMerchant: true,
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
          assignedMerchant: created.assignedMerchant,
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

  const safeEmail = emailSafeForContact(email, matchedContact, emailMatch, emailMatches.length);
  const safePhone =
    !matchedContact.phoneNumber || phonesCompatible(matchedContact.phoneNumber, phoneNumber)
      ? phoneNumber
      : null;

  await ensureSecondaryContactIdentifiers({
    contactId: matchedContact.id,
    primaryEmail: matchedContact.email,
    primaryPhoneNumber: matchedContact.phoneNumber,
    email: safeEmail,
    phoneNumber: safePhone,
  });

  const updateData: {
    name?: string;
    email?: string;
    phoneNumber?: string;
    recentMerchant?: string;
    assignedMerchant?: string;
    lastPurchaseAt?: Date;
    source?: string;
  } = {};

  if (isBlank(matchedContact.name) && name) {
    updateData.name = name;
  }
  if (isBlank(matchedContact.email) && safeEmail) {
    updateData.email = safeEmail;
  }
  if (isBlank(matchedContact.phoneNumber) && phoneNumber) {
    updateData.phoneNumber = phoneNumber;
  }
  if (isBlank(matchedContact.recentMerchant) && recentMerchant) {
    updateData.recentMerchant = recentMerchant;
  }
  if (isBlank(matchedContact.source) && source) {
    updateData.source = source;
  }
  if (!matchedContact.lastPurchaseAt || input.occurredAt > matchedContact.lastPurchaseAt) {
    updateData.lastPurchaseAt = input.occurredAt;
  }
  const autoAssigned = resolveAutoAllocateMerchant({
    assignedMerchant: matchedContact.assignedMerchant,
    purchaseMerchantLabel: recentMerchant,
  });
  if (autoAssigned) {
    updateData.assignedMerchant = autoAssigned;
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

export type { SyncContactMasterInput, SyncContactMasterResult };
