import { Prisma } from "@prisma/client";

import { writeAuditLog } from "@/lib/audit-log";
import {
  callQueueNeedsLifetimeTotals,
  isoDayEndUtc,
  isoDayStartUtc,
  matchesCallQueueAssignFilters,
} from "@/lib/customer-insight/call-queue-assign-filters";
import {
  callQueueHideReason,
  isHiddenFromCallQueueAssign,
} from "@/lib/customer-insight/call-queue-hide";
import { uniqueContactPhones } from "@/lib/customer-insight/allocation-summary";
import { lifetimeTotalsByContactId } from "@/lib/customer-insight/lifetime-totals-batch";
import { loyaltyOutreachStageLabel } from "@/lib/customer-insight/loyalty-outreach";
import {
  findMerchantUserForFilterValue,
  resolveAssignedMerchantFilterLabels,
} from "@/lib/customer-insight/merchant-label-aliases";
import { merchantMatchKeysForUser } from "@/lib/customer-insight/ownership";
import {
  contactAllocatedToMerchantAliases,
  shouldShowNewlyAllocatedBadge,
} from "@/lib/customer-insight/call-queue-newly-allocated";
import { chunkArray } from "@/lib/customer-insight/purchase-scan";
import { findContactsByPurchasedBrandRanked } from "@/lib/page-data/contact-brand-ids";
import {
  buildPhoneLookupVariants,
  canonicalPhoneForErpCustomerId,
  phoneDigitsOnly,
} from "@/lib/phone-lookup";
import { prisma } from "@/lib/prisma";

export const CALL_QUEUE_ASSIGN_CAP = 200;
export const CALL_QUEUE_IMPORT_CAP = 2_000;
export const CALL_QUEUE_PAGE_SIZE = 50;
export const CALL_QUEUE_STATUS_PENDING = "pending";
export const CALL_QUEUE_STATUS_COMPLETED = "completed";
export const CALL_QUEUE_ELIGIBLE_IDS_CAP = 5_000;

const LAST_CONTACTED_ID_CHUNK = 4_000;

export type CallQueueHideFilter = "eligible" | "hidden" | "all";

export type CallQueueRowDto = {
  contactId: string;
  name: string;
  phoneNumber: string | null;
  assignedMerchant: string | null;
  lifetimeTotal: number;
  lastPurchaseAt: string | null;
  lastContactedAt: string | null;
  queued: boolean;
  hidden?: boolean;
  hideReason?: string | null;
  /** Show "Newly allocated" badge on merchant queue (import / cross-merchant). */
  newlyAllocatedBadge?: boolean;
  loyaltyOutreachStatus?: string | null;
  loyaltyStage?: string | null;
};

export type CallQueueAssignFilters = {
  /** Empty/undefined = all contacts with an assigned merchant. */
  merchantValue?: string;
  pushToGold?: boolean;
  pushToPlatinum?: boolean;
  loyalty?: "standard" | "gold" | "platinum" | "unassigned";
  lastPurchaseFrom?: string;
  lastPurchaseTo?: string;
  allocatedFrom?: string;
  allocatedTo?: string;
  assignedFrom?: string;
  assignedTo?: string;
  notContacted?: boolean;
  notInterestedInLoyalty?: boolean;
  /** Purchased brand needles (OR). Empty/undefined = off. */
  brands?: string[];
  /** @deprecated use brands */
  brand?: string;
  hideFilter?: CallQueueHideFilter;
};

function brandNeedlesFromFilters(filters: CallQueueAssignFilters): string[] {
  const fromList = (filters.brands ?? [])
    .map((b) => b.trim())
    .filter(Boolean);
  if (fromList.length > 0) return fromList;
  const single = filters.brand?.trim();
  return single ? [single] : [];
}

function usesQueueHistoryMode(filters: CallQueueAssignFilters): boolean {
  return Boolean(
    filters.assignedFrom?.trim() ||
      filters.assignedTo?.trim() ||
      filters.notContacted
  );
}
export type CallQueueAssignResult = {
  assigned: number;
  skippedQueued: number;
  skippedHidden: number;
  skippedNotAllocated: number;
};

export type CallQueueImportAssignResult = {
  assigned: number;
  /** Same as assigned — Contact Master.assignedMerchant set to merchant. */
  allocated: number;
  skippedQueued: number;
  skippedUnknown: number;
  skippedBlank: number;
  phonesInFile: number;
};

/** Index key for import phone matching (canonical local when possible). */
export function callQueueImportPhoneKey(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const canonical = canonicalPhoneForErpCustomerId(trimmed);
  if (canonical) return canonical;
  const digits = phoneDigitsOnly(trimmed);
  return digits.length >= 7 ? digits : null;
}

export function compareOldestContactedFirst(
  a: { lastContactedAt: Date | null },
  b: { lastContactedAt: Date | null }
): number {
  if (a.lastContactedAt == null && b.lastContactedAt == null) return 0;
  if (a.lastContactedAt == null) return -1;
  if (b.lastContactedAt == null) return 1;
  return a.lastContactedAt.getTime() - b.lastContactedAt.getTime();
}

export function compareOldestPurchaseFirst(
  a: { lastPurchaseAt: Date | null },
  b: { lastPurchaseAt: Date | null }
): number {
  if (a.lastPurchaseAt == null && b.lastPurchaseAt == null) return 0;
  if (a.lastPurchaseAt == null) return 1;
  if (b.lastPurchaseAt == null) return -1;
  return a.lastPurchaseAt.getTime() - b.lastPurchaseAt.getTime();
}

/** Oldest / never contacted first, then oldest last purchase. */
export function compareCallQueueCandidateOrder(
  a: { lastContactedAt: Date | null; lastPurchaseAt: Date | null },
  b: { lastContactedAt: Date | null; lastPurchaseAt: Date | null }
): number {
  const byContacted = compareOldestContactedFirst(a, b);
  if (byContacted !== 0) return byContacted;
  return compareOldestPurchaseFirst(a, b);
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

/**
 * Postgres refuses a prepared statement with more than 32,767 bind variables, so every
 * id list has to be sliced before it reaches an `in` filter. A merchant with tens of
 * thousands of allocated contacts hits this on the assign-queue screen.
 */
function idChunks(ids: string[]): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += LAST_CONTACTED_ID_CHUNK) {
    chunks.push(ids.slice(i, i + LAST_CONTACTED_ID_CHUNK));
  }
  return chunks;
}

/** Contacts already sitting in the pending queue. */
async function pendingQueuedContactIds(
  companyId: string,
  contactIds: string[]
): Promise<Set<string>> {
  const queued = new Set<string>();
  if (contactIds.length === 0) return queued;
  const pages = await Promise.all(
    idChunks(contactIds).map((slice) =>
      prisma.contactInsightCallQueue.findMany({
        where: {
          companyId,
          contactId: { in: slice },
          status: CALL_QUEUE_STATUS_PENDING,
        },
        select: { contactId: true },
      })
    )
  );
  for (const rows of pages) {
    for (const row of rows) queued.add(row.contactId);
  }
  return queued;
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
    const grouped = await prisma.contactAllocationUpdate.groupBy({
      by: ["contactId"],
      where: {
        companyId,
        contactId: { in: slice },
        NOT: { category: "allocation" },
      },
      _max: { createdAt: true },
    });
    const withMax = grouped.filter((row) => row._max.createdAt != null);
    if (withMax.length === 0) continue;
    const rows = await prisma.contactAllocationUpdate.findMany({
      where: {
        companyId,
        OR: withMax.map((row) => ({
          contactId: row.contactId,
          createdAt: row._max.createdAt!,
        })),
      },
      select: { contactId: true, createdAt: true, category: true },
      orderBy: { createdAt: "desc" },
    });
    for (const row of rows) {
      if (map.has(row.contactId)) continue;
      map.set(row.contactId, { at: row.createdAt, category: row.category });
    }
  }
  return map;
}

export function assignedMerchantWhere(companyId: string, aliases: string[]) {
  if (aliases.length === 0) {
    return {
      companyId,
      AND: [
        { assignedMerchant: { not: null } },
        { assignedMerchant: { not: "" } },
      ],
    };
  }
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

function lastPurchaseWhere(
  from?: string,
  to?: string
): { lastPurchaseAt: { gte?: Date; lte?: Date } } | null {
  const start = from?.trim() || undefined;
  const end = to?.trim() || undefined;
  if (!start && !end) return null;
  return {
    lastPurchaseAt: {
      ...(start ? { gte: isoDayStartUtc(start) } : {}),
      ...(end ? { lte: isoDayEndUtc(end) } : {}),
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
  loyaltyOutreachStatus: string | null;
  email: string | null;
  phones: Array<{ phoneNumber: string }>;
  emails: Array<{ email: string }>;
  queued: boolean;
  hidden: boolean;
  hideReason: string | null;
};

async function listRankedEligibleContacts(input: {
  companyId: string;
  filters: CallQueueAssignFilters;
}): Promise<{ ranked: RankedContact[]; allocatedTotal: number }> {
  const merchantNeedle = input.filters.merchantValue?.trim() ?? "";
  const aliases = merchantNeedle
    ? await resolveAssignedMerchantFilterLabels(input.companyId, merchantNeedle)
    : [];
  if (merchantNeedle && aliases.length === 0) {
    return { ranked: [], allocatedTotal: 0 };
  }

  const purchase = lastPurchaseWhere(
    input.filters.lastPurchaseFrom,
    input.filters.lastPurchaseTo
  );
  const brandNeedles = brandNeedlesFromFilters(input.filters);
  const queueHistory = usesQueueHistoryMode(input.filters);

  let contactIdAllow: Set<string> | null = null;
  if (queueHistory) {
    const assignedFrom = input.filters.assignedFrom?.trim();
    const assignedTo = input.filters.assignedTo?.trim();
    const queueRows = await prisma.contactInsightCallQueue.findMany({
      where: {
        companyId: input.companyId,
        ...(aliases.length > 0
          ? {
              OR: aliases.map((label) => ({
                merchantLabel: { equals: label, mode: "insensitive" as const },
              })),
            }
          : {}),
        ...(assignedFrom || assignedTo
          ? {
              assignedAt: {
                ...(assignedFrom ? { gte: isoDayStartUtc(assignedFrom) } : {}),
                ...(assignedTo ? { lte: isoDayEndUtc(assignedTo) } : {}),
              },
            }
          : {}),
      },
      select: {
        contactId: true,
        assignedAt: true,
        status: true,
      },
      orderBy: { assignedAt: "desc" },
    });

    let rows = queueRows;
    if (input.filters.notContacted) {
      const contactIds = [...new Set(rows.map((r) => r.contactId))];
      const updates =
        contactIds.length === 0
          ? []
          : await prisma.contactAllocationUpdate.findMany({
              where: {
                companyId: input.companyId,
                contactId: { in: contactIds },
              },
              select: { contactId: true, createdAt: true },
              orderBy: { createdAt: "asc" },
            });
      rows = rows.filter((row) => {
        const hit = updates.some(
          (u) =>
            u.contactId === row.contactId &&
            u.createdAt.getTime() > row.assignedAt.getTime()
        );
        return !hit;
      });
    }

    contactIdAllow = new Set(rows.map((r) => r.contactId));
    if (contactIdAllow.size === 0) return { ranked: [], allocatedTotal: 0 };
  }

  const contacts = await prisma.contactMaster.findMany({
    where: {
      ...assignedMerchantWhere(input.companyId, aliases),
      ...(purchase ?? {}),
      ...(contactIdAllow
        ? { id: { in: [...contactIdAllow] } }
        : {}),
      ...(input.filters.notInterestedInLoyalty
        ? { loyaltyOutreachStatus: "not_interested" }
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
      loyaltyOutreachStatus: true,
      phones: { select: { phoneNumber: true } },
      emails: { select: { email: true } },
    },
  });

  let brandIdSet: Set<string> | null = null;
  if (brandNeedles.length > 0) {
    const rankLists = await Promise.all(
      brandNeedles.map((brand) =>
        findContactsByPurchasedBrandRanked(input.companyId, brand)
      )
    );
    brandIdSet = new Set<string>();
    for (const ranks of rankLists) {
      for (const r of ranks) brandIdSet.add(r.contactId);
    }
    if (brandIdSet.size === 0) return { ranked: [], allocatedTotal: 0 };
  }

  const afterBrand = brandIdSet
    ? contacts.filter((c) => brandIdSet!.has(c.id))
    : contacts;
  if (afterBrand.length === 0) return { ranked: [], allocatedTotal: 0 };

  const allocatedTotal = afterBrand.length;
  const ids = afterBrand.map((c) => c.id);
  const now = new Date();
  const [contacted, queued, allocated, lastEvent] = await Promise.all([
    lastContactedMap(input.companyId, ids),
    pendingQueuedContactIds(input.companyId, ids),
    allocationAtMap(input.companyId, ids),
    lastNonAllocationEventMap(input.companyId, ids),
  ]);

  const lifetimeNeeded = callQueueNeedsLifetimeTotals(input.filters);

  const lifetimeById = lifetimeNeeded
    ? await lifetimeTotalsByContactId(input.companyId, afterBrand)
    : new Map<string, number>();

  const matched = afterBrand.filter((c) =>
    matchesCallQueueAssignFilters(
      {
        lifetimeTotal: lifetimeById.get(c.id) ?? 0,
        lastPurchaseAt: c.lastPurchaseAt,
        allocationAt: allocated.get(c.id) ?? null,
        loyaltyAssignedTier: c.loyaltyAssignedTier,
        loyaltyOutreachStatus: c.loyaltyOutreachStatus,
        boughtBrand: brandNeedles.length === 0 || (brandIdSet?.has(c.id) ?? false),
      },
      input.filters
    )
  );

  const ranked = matched
    .map((c) => {
      const ev = lastEvent.get(c.id);
      const hideReason = callQueueHideReason({
        now,
        currentCategory: c.category,
        lastPurchaseAt: c.lastPurchaseAt,
        lastNonAllocationAt: ev?.at ?? null,
        lastNonAllocationCategory: ev?.category ?? c.category,
        hasPendingQueue: queued.has(c.id),
      });
      return {
        ...c,
        lastContactedAt: contacted.get(c.id) ?? null,
        lifetimeTotal: lifetimeById.get(c.id) ?? 0,
        queued: queued.has(c.id),
        hidden: hideReason != null,
        hideReason,
      };
    })
    .sort(compareCallQueueCandidateOrder);

  return { ranked, allocatedTotal };
}

function applyHideFilter(
  ranked: RankedContact[],
  hideFilter: CallQueueHideFilter | undefined
): RankedContact[] {
  if (hideFilter === "hidden") return ranked.filter((c) => c.hidden);
  if (hideFilter === "eligible") return ranked.filter((c) => !c.hidden);
  return ranked;
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
    allocatedTotal: number;
  };
}> {
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? CALL_QUEUE_PAGE_SIZE));
  const page = Math.max(1, input.page);
  const { ranked, allocatedTotal } = await listRankedEligibleContacts({
    companyId: input.companyId,
    filters: input,
  });
  const eligibleTotal = ranked.filter((c) => !c.hidden).length;
  const shown = applyHideFilter(ranked, input.hideFilter);
  const total = shown.length;
  const start = (page - 1) * pageSize;
  const pageRows = shown.slice(start, start + pageSize);

  const lifetimeAlready = callQueueNeedsLifetimeTotals(input);
  const pageTotals = lifetimeAlready
    ? null
    : await lifetimeTotalsByContactId(input.companyId, pageRows);

  return {
    items: pageRows.map((c) => ({
      contactId: c.id,
      name: c.name,
      phoneNumber: c.phoneNumber,
      assignedMerchant: c.assignedMerchant,
      lifetimeTotal: pageTotals?.get(c.id) ?? c.lifetimeTotal,
      lastPurchaseAt: c.lastPurchaseAt?.toISOString() ?? null,
      lastContactedAt: c.lastContactedAt?.toISOString() ?? null,
      queued: c.queued,
      hidden: c.hidden,
      hideReason: c.hideReason,
      loyaltyOutreachStatus: c.loyaltyOutreachStatus,
      loyaltyStage: loyaltyOutreachStageLabel(c.loyaltyOutreachStatus) || null,
    })),
    pagination: { page, pageSize, total, eligibleTotal, allocatedTotal },
  };
}

export async function listCallQueueEligibleIds(input: {
  companyId: string;
  limit?: number;
} & CallQueueAssignFilters): Promise<{
  contactIds: string[];
  eligibleTotal: number;
  allocatedTotal: number;
  truncated: boolean;
}> {
  const { ranked, allocatedTotal } = await listRankedEligibleContacts({
    companyId: input.companyId,
    filters: input,
  });
  const eligible = ranked.filter((c) => !c.hidden);
  const eligibleTotal = eligible.length;
  const cap = Math.min(
    CALL_QUEUE_ELIGIBLE_IDS_CAP,
    input.limit != null ? Math.max(1, input.limit) : CALL_QUEUE_ELIGIBLE_IDS_CAP
  );
  const contactIds = eligible.slice(0, cap).map((c) => c.id);
  return {
    contactIds,
    eligibleTotal,
    allocatedTotal,
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

  const contactPages = await Promise.all(
    idChunks(uniqueIds).map((slice) =>
      prisma.contactMaster.findMany({
        where: {
          ...assignedMerchantWhere(input.companyId, aliases),
          id: { in: slice },
        },
        select: {
          id: true,
          name: true,
          category: true,
          email: true,
          phoneNumber: true,
          lastPurchaseAt: true,
          phones: { select: { phoneNumber: true } },
          emails: { select: { email: true } },
        },
      })
    )
  );
  const contacts = contactPages.flat();
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
  const [queued, lastEvent, lifetimeById] = await Promise.all([
    pendingQueuedContactIds(input.companyId, ids),
    lastNonAllocationEventMap(input.companyId, ids),
    lifetimeTotalsByContactId(input.companyId, contacts),
  ]);

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
        lastPurchaseAt: contact.lastPurchaseAt,
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

/**
 * Manual Excel import: phones already filtered offline.
 * Skips hide rules and allocated-merchant checks. Still requires existing contacts
 * and skips contacts already pending in the queue.
 */
export async function assignCallQueueFromPhones(input: {
  companyId: string;
  merchantValue: string;
  phones: string[];
  skippedBlank?: number;
  assignedByUserId: string | null;
}): Promise<CallQueueImportAssignResult> {
  const skippedBlank = input.skippedBlank ?? 0;
  const seenPhoneKeys = new Set<string>();
  const uniquePhones: string[] = [];
  for (const raw of input.phones) {
    const key = callQueueImportPhoneKey(raw);
    if (!key || seenPhoneKeys.has(key)) continue;
    seenPhoneKeys.add(key);
    uniquePhones.push(raw.trim());
  }

  const empty: CallQueueImportAssignResult = {
    assigned: 0,
    allocated: 0,
    skippedQueued: 0,
    skippedUnknown: 0,
    skippedBlank,
    phonesInFile: uniquePhones.length,
  };
  if (uniquePhones.length === 0) return empty;
  if (uniquePhones.length > CALL_QUEUE_IMPORT_CAP) {
    throw new Error(`Import at most ${CALL_QUEUE_IMPORT_CAP} phone numbers`);
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

  const allVariants = new Set<string>();
  for (const phone of uniquePhones) {
    for (const variant of buildPhoneLookupVariants(phone)) {
      allVariants.add(variant);
    }
  }

  const byId = new Map<
    string,
    {
      id: string;
      phoneNumber: string | null;
      phones: Array<{ phoneNumber: string }>;
      email: string | null;
      emails: Array<{ email: string }>;
      assignedMerchant: string | null;
    }
  >();
  const variantChunks = chunkArray([...allVariants], 500);
  for (const phones of variantChunks) {
    if (phones.length === 0) continue;
    const rows = await prisma.contactMaster.findMany({
      where: {
        companyId: input.companyId,
        OR: [
          { phoneNumber: { in: phones } },
          { phones: { some: { phoneNumber: { in: phones } } } },
        ],
      },
      select: {
        id: true,
        phoneNumber: true,
        phones: { select: { phoneNumber: true } },
        email: true,
        emails: { select: { email: true } },
        assignedMerchant: true,
      },
    });
    for (const row of rows) byId.set(row.id, row);
  }

  const contacts = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  const phoneKeyToContactId = new Map<string, string>();
  for (const contact of contacts) {
    for (const stored of uniqueContactPhones(contact.phoneNumber, contact.phones)) {
      for (const variant of buildPhoneLookupVariants(stored)) {
        const key = callQueueImportPhoneKey(variant);
        if (key && !phoneKeyToContactId.has(key)) {
          phoneKeyToContactId.set(key, contact.id);
        }
      }
    }
  }

  const matchedIds: string[] = [];
  const matchedIdSet = new Set<string>();
  let skippedUnknown = 0;
  for (const phone of uniquePhones) {
    const key = callQueueImportPhoneKey(phone);
    const contactId = key ? phoneKeyToContactId.get(key) : undefined;
    if (!contactId) {
      skippedUnknown += 1;
      continue;
    }
    if (matchedIdSet.has(contactId)) continue;
    matchedIdSet.add(contactId);
    matchedIds.push(contactId);
  }

  if (matchedIds.length === 0) {
    return { ...empty, skippedUnknown };
  }

  const now = new Date();
  const [queued, lifetimeById] = await Promise.all([
    pendingQueuedContactIds(input.companyId, matchedIds),
    lifetimeTotalsByContactId(
      input.companyId,
      matchedIds.map((id) => {
        const row = byId.get(id)!;
        return {
          id: row.id,
          email: row.email,
          phoneNumber: row.phoneNumber,
          phones: row.phones,
          emails: row.emails,
        };
      })
    ),
  ]);

  const toCreateIds: string[] = [];
  let skippedQueued = 0;
  for (const id of matchedIds) {
    if (queued.has(id)) {
      skippedQueued += 1;
      continue;
    }
    toCreateIds.push(id);
  }

  if (toCreateIds.length > 0) {
    const newlyAllocatedById = new Map<string, boolean>();
    for (const contactId of toCreateIds) {
      const prev = byId.get(contactId)?.assignedMerchant ?? null;
      newlyAllocatedById.set(
        contactId,
        !contactAllocatedToMerchantAliases(prev, aliases)
      );
    }

    // Reallocate Contact Master so merchant can call-update (ownership check).
    await prisma.contactMaster.updateMany({
      where: { companyId: input.companyId, id: { in: toCreateIds } },
      data: { assignedMerchant: merchantLabel },
    });
    await prisma.contactAllocationUpdate.createMany({
      data: toCreateIds.map((contactId) => ({
        companyId: input.companyId,
        contactId,
        merchantId: input.assignedByUserId,
        merchantName: merchantLabel,
        category: "allocation",
      })),
    });

    await prisma.contactInsightCallQueue.createMany({
      data: toCreateIds.map((contactId) => ({
        companyId: input.companyId,
        contactId,
        merchantLabel,
        merchantUserId: merchantUser?.id ?? null,
        assignedByUserId: input.assignedByUserId,
        assignedAt: now,
        status: CALL_QUEUE_STATUS_PENDING,
        newlyAllocated: newlyAllocatedById.get(contactId) ?? true,
        lifetimeTotalAtAssign: new Prisma.Decimal(
          (lifetimeById.get(contactId) ?? 0).toFixed(2)
        ),
      })),
    });

    await writeAuditLog({
      companyId: input.companyId,
      actorUserId: input.assignedByUserId ?? undefined,
      module: "customer-insight",
      action: "call_queue_assign",
      entityType: "ContactInsightCallQueue",
      summary: `Imported ${toCreateIds.length} contact(s) to call queue (${merchantLabel})`,
      metadata: {
        merchantLabel,
        merchantUserId: merchantUser?.id ?? null,
        contactIds: toCreateIds,
        source: "excel_import",
        reallocated: true,
      },
    });
  }

  return {
    assigned: toCreateIds.length,
    allocated: toCreateIds.length,
    skippedQueued,
    skippedUnknown,
    skippedBlank,
    phonesInFile: uniquePhones.length,
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
    roleNames?: string[];
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
      newlyAllocated: true,
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
  const newlyAllocatedByContactId = new Map(
    rows.map((r) => [r.contactId, r.newlyAllocated] as const)
  );
  const [contacted, lifetimeById] = await Promise.all([
    lastContactedMap(input.companyId, ids),
    lifetimeTotalsByContactId(input.companyId, contacts),
  ]);

  const now = new Date();
  const items = contacts
    .map((c) => {
      const lastContactedAtDate = contacted.get(c.id) ?? null;
      return {
        contactId: c.id,
        name: c.name,
        phoneNumber: c.phoneNumber,
        assignedMerchant: c.assignedMerchant,
        lifetimeTotal: lifetimeById.get(c.id) ?? 0,
        lastPurchaseAt: c.lastPurchaseAt?.toISOString() ?? null,
        lastContactedAt: lastContactedAtDate?.toISOString() ?? null,
        queued: true,
        newlyAllocatedBadge: shouldShowNewlyAllocatedBadge({
          newlyAllocated: newlyAllocatedByContactId.get(c.id) ?? false,
          lastContactedAt: lastContactedAtDate,
          now,
        }),
        lastContactedAtDate,
        lastPurchaseAtDate: c.lastPurchaseAt,
      };
    })
    .sort((a, b) =>
      compareCallQueueCandidateOrder(
        {
          lastContactedAt: a.lastContactedAtDate,
          lastPurchaseAt: a.lastPurchaseAtDate,
        },
        {
          lastContactedAt: b.lastContactedAtDate,
          lastPurchaseAt: b.lastPurchaseAtDate,
        }
      )
    )
    .map(
      ({
        lastContactedAtDate: _drop,
        lastPurchaseAtDate: _drop2,
        ...row
      }) => row
    );

  return { items };
}

/** Pending queue row for this merchant — same match keys as listMerchantCallQueue. */
export async function findPendingMerchantCallQueueRow(input: {
  companyId: string;
  contactId: string;
  merchant: {
    id: string;
    knownName?: string | null;
    name?: string | null;
    email?: string | null;
    couponCodes?: string[] | null;
  };
}): Promise<{ id: string } | null> {
  const keys = merchantMatchKeysForUser(input.merchant);
  return prisma.contactInsightCallQueue.findFirst({
    where: {
      companyId: input.companyId,
      contactId: input.contactId,
      status: CALL_QUEUE_STATUS_PENDING,
      OR: [
        { merchantUserId: input.merchant.id },
        ...keys.map((label) => ({
          merchantLabel: { equals: label, mode: "insensitive" as const },
        })),
      ],
    },
    select: { id: true },
  });
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
