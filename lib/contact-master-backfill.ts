import { writeAuditLog } from "@/lib/audit-log";
import { syncContactMaster } from "@/lib/contact-master-sync";
import { buildPhoneLookupVariants, pickNameFromShippingJson } from "@/lib/phone-lookup";
import { prisma } from "@/lib/prisma";

export const CONTACT_BACKFILL_SCAN_LIMIT = 5000;
export const CONTACT_BACKFILL_BATCH_LIMIT = 200;

type ContactBackfillCandidate = {
  id: string;
  shopifyOrderId: string;
  orderNumber: string | null;
  name: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  shippingAddress: unknown;
  createdAt: Date;
  assignedMerchant: { name: string | null; email: string | null } | null;
};

type ContactBackfillPreviewSample = {
  id: string;
  orderLabel: string;
  customerName: string | null;
  email: string | null;
  phoneNumber: string | null;
  createdAt: string;
};

export type ContactBackfillPreview = {
  eligibleOrdersScanned: number;
  totalEligibleOrders: number;
  missingCandidates: number;
  batchLimit: number;
  scanLimit: number;
  sample: ContactBackfillPreviewSample[];
};

export type ContactBackfillRunResult = {
  scanned: number;
  queuedMissing: number;
  processed: number;
  created: number;
  enriched: number;
  unchanged: number;
  conflicts: number;
  skippedNoIdentifier: number;
  totalEligibleOrders: number;
  remainingMissingEstimate: number;
  sampleCreatedOrderLabels: string[];
  sampleEnrichedOrderLabels: string[];
  sampleConflictOrderLabels: string[];
};

function normalizeEmail(value: string | null | undefined) {
  const trimmed = value?.trim().toLowerCase() ?? "";
  return trimmed || null;
}

function normalizePhone(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function hasContactMatch(
  order: Pick<ContactBackfillCandidate, "customerEmail" | "customerPhone">,
  emailSet: Set<string>,
  phoneVariantSet: Set<string>
) {
  const email = normalizeEmail(order.customerEmail);
  if (email && emailSet.has(email)) {
    return true;
  }

  const phone = normalizePhone(order.customerPhone);
  if (!phone) {
    return false;
  }

  return buildPhoneLookupVariants(phone).some((variant) => phoneVariantSet.has(variant));
}

async function loadBackfillCandidates(companyId: string, scanLimit: number, batchLimit: number) {
  const [contacts, orders] = await Promise.all([
    prisma.contactMaster.findMany({
      where: { companyId },
      select: { email: true, phoneNumber: true },
    }),
    prisma.order.findMany({
      where: {
        companyId,
        OR: [
          { customerEmail: { not: null } },
          { customerPhone: { not: null } },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: scanLimit,
      select: {
        id: true,
        shopifyOrderId: true,
        orderNumber: true,
        name: true,
        customerEmail: true,
        customerPhone: true,
        shippingAddress: true,
        createdAt: true,
        assignedMerchant: { select: { name: true, email: true } },
      },
    }),
  ]);

  const usableOrders = orders.filter((order) => {
    const email = normalizeEmail(order.customerEmail);
    const phone = normalizePhone(order.customerPhone);
    return Boolean(email || phone);
  });

  const emailSet = new Set<string>();
  const phoneVariantSet = new Set<string>();
  for (const contact of contacts) {
    const email = normalizeEmail(contact.email);
    if (email) {
      emailSet.add(email);
    }
    const phone = normalizePhone(contact.phoneNumber);
    if (phone) {
      for (const variant of buildPhoneLookupVariants(phone)) {
        phoneVariantSet.add(variant);
      }
    }
  }

  const missingCandidates: ContactBackfillCandidate[] = [];
  for (const order of usableOrders) {
    if (hasContactMatch(order, emailSet, phoneVariantSet)) {
      continue;
    }
    missingCandidates.push(order);
    if (missingCandidates.length >= batchLimit) {
      break;
    }
  }

  return {
    scanned: usableOrders.length,
    totalEligibleOrders: usableOrders.length,
    missingCandidates,
  };
}

function toPreviewSample(order: ContactBackfillCandidate): ContactBackfillPreviewSample {
  return {
    id: order.id,
    orderLabel: order.name ?? order.orderNumber ?? order.shopifyOrderId,
    customerName: pickNameFromShippingJson(order.shippingAddress) || order.name,
    email: normalizeEmail(order.customerEmail),
    phoneNumber: normalizePhone(order.customerPhone),
    createdAt: order.createdAt.toISOString(),
  };
}

export async function previewContactBackfill(companyId: string): Promise<ContactBackfillPreview> {
  const { scanned, totalEligibleOrders, missingCandidates } = await loadBackfillCandidates(
    companyId,
    CONTACT_BACKFILL_SCAN_LIMIT,
    CONTACT_BACKFILL_BATCH_LIMIT
  );

  return {
    eligibleOrdersScanned: scanned,
    totalEligibleOrders,
    missingCandidates: missingCandidates.length,
    batchLimit: CONTACT_BACKFILL_BATCH_LIMIT,
    scanLimit: CONTACT_BACKFILL_SCAN_LIMIT,
    sample: missingCandidates.slice(0, 10).map(toPreviewSample),
  };
}

export async function runContactBackfill(companyId: string, actorUserId: string): Promise<ContactBackfillRunResult> {
  const { scanned, totalEligibleOrders, missingCandidates } = await loadBackfillCandidates(
    companyId,
    CONTACT_BACKFILL_SCAN_LIMIT,
    CONTACT_BACKFILL_BATCH_LIMIT
  );

  let created = 0;
  let enriched = 0;
  let unchanged = 0;
  let conflicts = 0;
  let skippedNoIdentifier = 0;
  const sampleCreatedOrderLabels: string[] = [];
  const sampleEnrichedOrderLabels: string[] = [];
  const sampleConflictOrderLabels: string[] = [];

  for (const order of missingCandidates) {
    const result = await syncContactMaster({
      companyId,
      sourceLabel: "Order backfill",
      sourceType: "order_backfill",
      sourceId: order.shopifyOrderId,
      orderNumber: order.orderNumber ?? order.name ?? null,
      occurredAt: order.createdAt,
      email: normalizeEmail(order.customerEmail),
      phoneNumber: normalizePhone(order.customerPhone),
      name: pickNameFromShippingJson(order.shippingAddress) || order.name,
      recentMerchant: order.assignedMerchant?.name ?? order.assignedMerchant?.email ?? null,
      auditBehavior: "summary_only",
    });

    const orderLabel = order.name ?? order.orderNumber ?? order.shopifyOrderId;
    if (result.status === "created") {
      created += 1;
      if (sampleCreatedOrderLabels.length < 10) sampleCreatedOrderLabels.push(orderLabel);
    } else if (result.status === "enriched") {
      enriched += 1;
      if (sampleEnrichedOrderLabels.length < 10) sampleEnrichedOrderLabels.push(orderLabel);
    }
    else if (result.status === "unchanged") unchanged += 1;
    else if (result.status === "conflict") {
      conflicts += 1;
      if (sampleConflictOrderLabels.length < 10) sampleConflictOrderLabels.push(orderLabel);
    }
    else if (result.status === "skipped_no_identifier") skippedNoIdentifier += 1;
  }

  const remainingPreview = await previewContactBackfill(companyId);

  const summary = {
    scanned,
    queuedMissing: missingCandidates.length,
    processed: missingCandidates.length,
    created,
    enriched,
    unchanged,
    conflicts,
    skippedNoIdentifier,
    totalEligibleOrders,
    remainingMissingEstimate: remainingPreview.missingCandidates,
    sampleCreatedOrderLabels,
    sampleEnrichedOrderLabels,
    sampleConflictOrderLabels,
  };

  await writeAuditLog({
    companyId,
    actorUserId,
    module: "contacts",
    action: "contact_backfill_run",
    entityType: "ContactMaster",
    entityId: null,
    summary: `Ran contact backfill: ${created} created, ${enriched} enriched, ${conflicts} conflicts`,
    metadata: {
      summary,
      scanLimit: CONTACT_BACKFILL_SCAN_LIMIT,
      batchLimit: CONTACT_BACKFILL_BATCH_LIMIT,
      sampleOrderIds: missingCandidates.slice(0, 10).map((order) => order.shopifyOrderId),
    },
  });

  return summary;
}
