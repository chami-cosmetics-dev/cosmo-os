import { Prisma } from "@prisma/client";

import { writeAuditLog } from "@/lib/audit-log";
import { isHiddenFromCallQueueAssign } from "@/lib/customer-insight/call-queue-hide";
import { matchesCallQueuePushBands } from "@/lib/customer-insight/call-queue-push";
import { classifyLoyaltyTierKey } from "@/lib/customer-insight/loyalty-tier";
import { lifetimeTotalsByContactId } from "@/lib/customer-insight/lifetime-totals-batch";
import {
  findMerchantUserForFilterValue,
  resolveAssignedMerchantFilterLabels,
} from "@/lib/customer-insight/merchant-label-aliases";
import { merchantMatchKeysForUser } from "@/lib/customer-insight/ownership";
import { findContactsByPurchasedBrandRanked } from "@/lib/page-data/contact-brand-ids";
import { prisma } from "@/lib/prisma";

export const CALL_QUEUE_ASSIGN_CAP = 200;
export const CALL_QUEUE_PAGE_SIZE = 50;
export const CALL_QUEUE_STATUS_PENDING = "pending";
export const CALL_QUEUE_STATUS_COMPLETED = "completed";
export const CALL_QUEUE_ELIGIBLE_IDS_CAP = 5_000;

const LAST_CONTACTED_ID_CHUNK = 4_000;

export type CallQueueRowDto = {
  contactId: string;
  name: string;
  phoneNumber: string | null;
  assignedMerchant: string | null;
  lifetimeTotal: number;
  lastPurchaseAt: string | null;
  lastContactedAt: string | null;
  queued: boolean;
};

export type CallQueueAssignFilters = {
  merchantValue: string;
  pushToGold?: boolean;
  pushToPlatinum?: boolean;
  loyalty?: "standard" | "gold" | "platinum" | "unassigned";
  lastPurchaseFrom?: string;
  lastPurchaseTo?: string;
  brand?: string;
};

export type CallQueueAssignResult = {
  assigned: number;
  skippedQueued: number;
  skippedHidden: number;
  skippedNotAllocated: number;
};

export function compareOldestContactedFirst(
  a: { lastContactedAt: Date | null },
  b: { lastContactedAt: Date | null }
): number {
  if (a.lastContactedAt == null && b.lastContactedAt == null) return 0;
  if (a.lastContactedAt == null) return -1;
  if (b.lastContactedAt == null) return 1;
  return a.lastContactedAt.getTime() - b.lastContactedAt.getTime();
}

export function takeFirstEligibleContactIds(
  rows: Array<{ contactId: string; hidden: boolean; queued: boolean }>,
  n: number
): string[] {
  const limit = Math.max(0, Math.floor(n));
  const out: string[] = [];
  for (const row of rows) {
    if (row.hidden || row.queued) continue;
    out.push(row.contactId);
    if (out.length >= limit) break;
  }
  return out;
}

async function lastContactedMap(
  companyId: string,
  contactIds: string[]
): Promise<Map<string, Date>> {
  const map = new Map<string, Date>();
  if (contactIds.length === 0) return map;
  const chunks: string[][] = [];
  for (let i = 0; i < contactIds.length; i += LAST_CONTACTED_ID_CHUNK) {
    chunks.push(contactIds.slice(i, i + LAST_CONTACTED_ID_CHUNK));
  }
  const grouped = await Promise.all(
    chunks.map((slice) =>
      prisma.contactAllocationUpdate.groupBy({
        by: ["contactId"],
        where: {
          companyId,
          contactId: { in: slice },
          NOT: { category: "allocation" },
        },
        _max: { createdAt: true },
      })
    )
  );
  for (const rows of grouped) {
    for (const row of rows) {
      if (row._max.createdAt) map.set(row.contactId, row._max.createdAt);
    }
  }
  return map;
}

async function allocationAtMap(
  companyId: string,
  contactIds: string[]
): Promise<Map<string, Date>> {
  const map = new Map<string, Date>();
  if (contactIds.length === 0) return map;
  for (let i = 0; i < contactIds.length; i += LAST_CONTACTED_ID_CHUNK) {
    const slice = contactIds.slice(i, i + LAST_CONTACTED_ID_CHUNK);
    const grouped = await prisma.contactAllocationUpdate.groupBy({
      by: ["contactId"],
      where: {
        companyId,
        contactId: { in: slice },
        category: "allocation",
      },
      _max: { createdAt: true },
    });
    for (const row of grouped) {
      if (row._max.createdAt) map.set(row.contactId, row._max.createdAt);
    }
  }
  return map;
}

async function lastNonAllocationEventMap(
  companyId: string,
  contactIds: string[]
): Promise<Map<string, { at: Date; category: string | null }>> {
  const map = new Map<string, { at: Date; category: string | null }>();
  if (contactIds.length === 0) return map;
  for (let i = 0; i < contactIds.length; i += LAST_CONTACTED_ID_CHUNK) {
    const slice = contactIds.slice(i, i + LAST_CONTACTED_ID_CHUNK);
    const rows = await prisma.contactAllocationUpdate.findMany({
      where: {
        companyId,
        contactId: { in: slice },
        NOT: { category: "allocation" },
      },
      orderBy: { createdAt: "desc" },
      select: { contactId: true, createdAt: true, category: true },
    });
    for (const row of rows) {
      if (map.has(row.contactId)) continue;
      map.set(row.contactId, { at: row.createdAt, category: row.category });
    }
  }
  return map;
}

export function assignedMerchantWhere(companyId: string, aliases: string[]) {
  if (aliases.length <= 1) {
    return {
      companyId,
      assignedMerchant: {
        equals: aliases[0] ?? "",
        mode: "insensitive" as const,
      },
    };
  }
  return {
    companyId,
    OR: aliases.map((alias) => ({
      assignedMerchant: { equals: alias, mode: "insensitive" as const },
    })),
  };
}

function isoDayStart(isoDay: string): Date {
  return new Date(`${isoDay}T00:00:00.000Z`);
}

function isoDayEnd(isoDay: string): Date {
  return new Date(`${isoDay}T23:59:59.999Z`);
}

function lastPurchaseWhere(
  from?: string,
  to?: string
): { lastPurchaseAt: { gte?: Date; lte?: Date } } | null {
  if (!from && !to) return null;
  return {
    lastPurchaseAt: {
      ...(from ? { gte: isoDayStart(from) } : {}),
      ...(to ? { lte: isoDayEnd(to) } : {}),
    },
  };
}

type RankedContact = {
  id: string;
  name: string;
  phoneNumber: string | null;
  assignedMerchant: string | null;
  lastPurchaseAt: Date | null;
  lastContactedAt: Date | null;
  lifetimeTotal: number;
  category: string | null;
  loyaltyAssignedTier: string | null;
  email: string | null;
  phones: Array<{ phoneNumber: string }>;
  emails: Array<{ email: string }>;
};

async function listRankedEligibleContacts(input: {
  companyId: string;
  filters: CallQueueAssignFilters;
}): Promise<RankedContact[]> {
  const aliases = await resolveAssignedMerchantFilterLabels(
    input.companyId,
    input.filters.merchantValue
  );
  if (aliases.length === 0) return [];

  const purchase = lastPurchaseWhere(
    input.filters.lastPurchaseFrom,
    input.filters.lastPurchaseTo
  );
  const brandNeedle = input.filters.brand?.trim();

  let brandIdSet: Set<string> | null = null;
  if (brandNeedle) {
    const ranks = await findContactsByPurchasedBrandRanked(
      input.companyId,
      brandNeedle
    );
    brandIdSet = new Set(ranks.map((r) => r.contactId));
    if (brandIdSet.size === 0) return [];
  }

  const contacts = await prisma.contactMaster.findMany({
    where: {
      ...assignedMerchantWhere(input.companyId, aliases),
      ...(purchase ?? {}),
      ...(brandIdSet && brandIdSet.size <= 8_000
        ? { id: { in: [...brandIdSet] } }
        : {}),
    },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      assignedMerchant: true,
      lastPurchaseAt: true,
      email: true,
      category: true,
      loyaltyAssignedTier: true,
      phones: { select: { phoneNumber: true } },
      emails: { select: { email: true } },
    },
  });
  const afterBrand =
    brandIdSet && brandIdSet.size > 8_000
      ? contacts.filter((c) => brandIdSet.has(c.id))
      : contacts;

  const ids = afterBrand.map((c) => c.id);
  const now = new Date();
  const [contacted, queuedRows, allocated, lastEvent] = await Promise.all([
    lastContactedMap(input.companyId, ids),
    prisma.contactInsightCallQueue.findMany({
      where: {
        companyId: input.companyId,
        contactId: { in: ids },
        status: CALL_QUEUE_STATUS_PENDING,
      },
      select: { contactId: true },
    }),
    allocationAtMap(input.companyId, ids),
    lastNonAllocationEventMap(input.companyId, ids),
  ]);
  const queued = new Set(queuedRows.map((r) => r.contactId));

  const visible = afterBrand.filter((c) => {
    const ev = lastEvent.get(c.id);
    return !isHiddenFromCallQueueAssign({
      now,
      currentCategory: c.category,
      allocationAt: allocated.get(c.id) ?? null,
      lastNonAllocationAt: ev?.at ?? null,
      lastNonAllocationCategory: ev?.category ?? c.category,
      hasPendingQueue: queued.has(c.id),
    });
  });

  const lifetimeById = await lifetimeTotalsByContactId(input.companyId, visible);
  const pushGold = Boolean(input.filters.pushToGold);
  const pushPlat = Boolean(input.filters.pushToPlatinum);
  const loyalty = input.filters.loyalty;

  const matched = visible.filter((c) => {
    const total = lifetimeById.get(c.id) ?? 0;
    if (!matchesCallQueuePushBands(total, pushGold, pushPlat)) return false;
    if (loyalty === "unassigned") return !c.loyaltyAssignedTier;
    if (loyalty === "standard" || loyalty === "gold" || loyalty === "platinum") {
      return classifyLoyaltyTierKey(total) === loyalty;
    }
    return true;
  });

  return matched
    .map((c) => ({
      ...c,
      lastContactedAt: contacted.get(c.id) ?? null,
      lifetimeTotal: lifetimeById.get(c.id) ?? 0,
    }))
    .sort(compareOldestContactedFirst);
}

export async function listCallQueueCandidates(input: {
  companyId: string;
  page: number;
  pageSize?: number;
} & CallQueueAssignFilters): Promise<{
  items: CallQueueRowDto[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    eligibleTotal: number;
  };
}> {
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? CALL_QUEUE_PAGE_SIZE));
  const page = Math.max(1, input.page);
  const ranked = await listRankedEligibleContacts({
    companyId: input.companyId,
    filters: input,
  });
  const total = ranked.length;
  const start = (page - 1) * pageSize;
  const pageRows = ranked.slice(start, start + pageSize);

  return {
    items: pageRows.map((c) => ({
      contactId: c.id,
      name: c.name,
      phoneNumber: c.phoneNumber,
      assignedMerchant: c.assignedMerchant,
      lifetimeTotal: c.lifetimeTotal,
      lastPurchaseAt: c.lastPurchaseAt?.toISOString() ?? null,
      lastContactedAt: c.lastContactedAt?.toISOString() ?? null,
      queued: false,
    })),
    pagination: { page, pageSize, total, eligibleTotal: total },
  };
}

export async function listCallQueueEligibleIds(input: {
  companyId: string;
  limit?: number;
} & CallQueueAssignFilters): Promise<{
  contactIds: string[];
  eligibleTotal: number;
  truncated: boolean;
}> {
  const ranked = await listRankedEligibleContacts({
    companyId: input.companyId,
    filters: input,
  });
  const eligibleTotal = ranked.length;
  const cap = Math.min(
    CALL_QUEUE_ELIGIBLE_IDS_CAP,
    input.limit != null ? Math.max(1, input.limit) : CALL_QUEUE_ELIGIBLE_IDS_CAP
  );
  const contactIds = ranked.slice(0, cap).map((c) => c.id);
  return {
    contactIds,
    eligibleTotal,
    truncated: eligibleTotal > contactIds.length,
  };
}

export async function assignCallQueue(input: {
  companyId: string;
  merchantValue: string;
  contactIds: string[];
  assignedByUserId: string | null;
}): Promise<CallQueueAssignResult> {
  const uniqueIds = [...new Set(input.contactIds.map((id) => id.trim()).filter(Boolean))];
  const empty: CallQueueAssignResult = {
    assigned: 0,
    skippedQueued: 0,
    skippedHidden: 0,
    skippedNotAllocated: 0,
  };
  if (uniqueIds.length === 0) return empty;
  if (uniqueIds.length > CALL_QUEUE_ASSIGN_CAP) {
    throw new Error(`Select at most ${CALL_QUEUE_ASSIGN_CAP} contacts`);
  }

  const aliases = await resolveAssignedMerchantFilterLabels(
    input.companyId,
    input.merchantValue
  );
  if (aliases.length === 0) throw new Error("Unknown merchant");

  const merchantUser = await findMerchantUserForFilterValue(
    input.companyId,
    input.merchantValue
  );
  const merchantLabel = merchantUser?.value ?? input.merchantValue.trim();

  const contacts = await prisma.contactMaster.findMany({
    where: {
      ...assignedMerchantWhere(input.companyId, aliases),
      id: { in: uniqueIds },
    },
    select: {
      id: true,
      name: true,
      category: true,
      email: true,
      phoneNumber: true,
      phones: { select: { phoneNumber: true } },
      emails: { select: { email: true } },
    },
  });
  const allocatedIds = new Set(contacts.map((c) => c.id));
  let skippedNotAllocated = 0;
  for (const id of uniqueIds) {
    if (!allocatedIds.has(id)) skippedNotAllocated += 1;
  }
  if (contacts.length === 0) {
    return { ...empty, skippedNotAllocated };
  }

  const ids = contacts.map((c) => c.id);
  const now = new Date();
  const [queuedRows, allocated, lastEvent, lifetimeById] = await Promise.all([
    prisma.contactInsightCallQueue.findMany({
      where: {
        companyId: input.companyId,
        contactId: { in: ids },
        status: CALL_QUEUE_STATUS_PENDING,
      },
      select: { contactId: true },
    }),
    allocationAtMap(input.companyId, ids),
    lastNonAllocationEventMap(input.companyId, ids),
    lifetimeTotalsByContactId(input.companyId, contacts),
  ]);
  const queued = new Set(queuedRows.map((r) => r.contactId));

  const toCreate: typeof contacts = [];
  let skippedQueued = 0;
  let skippedHidden = 0;
  for (const contact of contacts) {
    if (queued.has(contact.id)) {
      skippedQueued += 1;
      continue;
    }
    const ev = lastEvent.get(contact.id);
    if (
      isHiddenFromCallQueueAssign({
        now,
        currentCategory: contact.category,
        allocationAt: allocated.get(contact.id) ?? null,
        lastNonAllocationAt: ev?.at ?? null,
        lastNonAllocationCategory: ev?.category ?? contact.category,
        hasPendingQueue: false,
      })
    ) {
      skippedHidden += 1;
      continue;
    }
    toCreate.push(contact);
  }

  if (toCreate.length > 0) {
    await prisma.contactInsightCallQueue.createMany({
      data: toCreate.map((contact) => ({
        companyId: input.companyId,
        contactId: contact.id,
        merchantLabel,
        merchantUserId: merchantUser?.id ?? null,
        assignedByUserId: input.assignedByUserId,
        assignedAt: now,
        status: CALL_QUEUE_STATUS_PENDING,
        lifetimeTotalAtAssign: new Prisma.Decimal(
          (lifetimeById.get(contact.id) ?? 0).toFixed(2)
        ),
      })),
    });

    await writeAuditLog({
      companyId: input.companyId,
      actorUserId: input.assignedByUserId ?? undefined,
      module: "customer-insight",
      action: "call_queue_assign",
      entityType: "ContactInsightCallQueue",
      summary: `Assigned ${toCreate.length} contact(s) to call queue (${merchantLabel})`,
      metadata: {
        merchantLabel,
        merchantUserId: merchantUser?.id ?? null,
        contactIds: toCreate.map((c) => c.id),
      },
    });
  }

  return {
    assigned: toCreate.length,
    skippedQueued,
    skippedHidden,
    skippedNotAllocated,
  };
}

export async function listMerchantCallQueue(input: {
  companyId: string;
  viewer: {
    id: string;
    knownName?: string | null;
    name?: string | null;
    email?: string | null;
    couponCodes?: string[] | null;
  };
}): Promise<{ items: CallQueueRowDto[] }> {
  const keys = merchantMatchKeysForUser(input.viewer);
  const rows = await prisma.contactInsightCallQueue.findMany({
    where: {
      companyId: input.companyId,
      status: CALL_QUEUE_STATUS_PENDING,
      OR: [
        { merchantUserId: input.viewer.id },
        ...keys.map((label) => ({
          merchantLabel: { equals: label, mode: "insensitive" as const },
        })),
      ],
    },
    select: {
      contactId: true,
      contact: {
        select: {
          id: true,
          name: true,
          phoneNumber: true,
          assignedMerchant: true,
          lastPurchaseAt: true,
          email: true,
          phones: { select: { phoneNumber: true } },
          emails: { select: { email: true } },
        },
      },
    },
  });

  const contacts = rows.map((r) => r.contact);
  const ids = contacts.map((c) => c.id);
  const [contacted, lifetimeById] = await Promise.all([
    lastContactedMap(input.companyId, ids),
    lifetimeTotalsByContactId(input.companyId, contacts),
  ]);

  const items = contacts
    .map((c) => ({
      contactId: c.id,
      name: c.name,
      phoneNumber: c.phoneNumber,
      assignedMerchant: c.assignedMerchant,
      lifetimeTotal: lifetimeById.get(c.id) ?? 0,
      lastPurchaseAt: c.lastPurchaseAt?.toISOString() ?? null,
      lastContactedAt: contacted.get(c.id)?.toISOString() ?? null,
      queued: true,
      lastContactedAtDate: contacted.get(c.id) ?? null,
    }))
    .sort((a, b) =>
      compareOldestContactedFirst(
        { lastContactedAt: a.lastContactedAtDate },
        { lastContactedAt: b.lastContactedAtDate }
      )
    )
    .map(({ lastContactedAtDate: _drop, ...row }) => row);

  return { items };
}

export async function completeCallQueueItem(input: {
  companyId: string;
  contactId: string;
  completedByUserId: string | null;
}): Promise<void> {
  await prisma.contactInsightCallQueue.updateMany({
    where: {
      companyId: input.companyId,
      contactId: input.contactId,
      status: CALL_QUEUE_STATUS_PENDING,
    },
    data: {
      status: CALL_QUEUE_STATUS_COMPLETED,
      completedAt: new Date(),
      completedByUserId: input.completedByUserId,
    },
  });
}
