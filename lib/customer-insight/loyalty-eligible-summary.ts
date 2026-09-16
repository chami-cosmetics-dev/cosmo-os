import {
  formatAppIsoDate,
  parseAppCalendarDayEnd,
  parseAppCalendarDayStart,
} from "@/lib/format-datetime";
import { lifetimeTotalsByContactId } from "@/lib/customer-insight/lifetime-totals-batch";
import {
  LOYALTY_OUTREACH_QUEUE_STATUSES,
  pendingLoyaltySuggestion,
  type PendingLoyaltySuggestion,
} from "@/lib/customer-insight/loyalty-outreach";
import { prisma } from "@/lib/prisma";

const LIFETIME_CHUNK = 400;
const CANDIDATE_CAP = 8_000;

export const LOYALTY_WORKED_STATUSES = [
  "contacted",
  "responded",
  "not_responded",
  "assigned",
] as const;

export type LoyaltyEligiblePeriodCounts = {
  pending: number;
  newlyEligible: number;
  updated: number;
};

export type LoyaltyEligibleMerchantRow = LoyaltyEligiblePeriodCounts & {
  merchantLabel: string;
  mtdNewlyEligible: number;
  mtdUpdated: number;
  weekNewlyEligible: number;
  weekUpdated: number;
};

export type LoyaltyEligibleSummaryDto = {
  asOf: string;
  mtdFrom: string;
  weekFrom: string;
  weekTo: string;
  company: {
    pending: number;
    mtdNewlyEligible: number;
    mtdUpdated: number;
    weekNewlyEligible: number;
    weekUpdated: number;
  };
  merchants: LoyaltyEligibleMerchantRow[];
};

export type LoyaltyEligibleListItem = {
  contactId: string;
  name: string;
  phoneNumber: string | null;
  assignedMerchant: string | null;
  lifetimeTotal: number;
  suggestedTier: "gold" | "platinum";
  suggestionKind: "new" | "upgrade";
  status: string;
  loyaltyEligibleAt: string | null;
};

/** Previous 7 Colombo calendar days ending on `weekToYmd` (inclusive). */
export function weekWindowFromEnd(weekToYmd: string): { from: string; to: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekToYmd)) {
    const today = formatAppIsoDate(new Date());
    return weekWindowFromEnd(today);
  }
  const fromDate = new Date(`${weekToYmd}T12:00:00+05:30`);
  fromDate.setDate(fromDate.getDate() - 6);
  return {
    from: formatAppIsoDate(fromDate),
    to: weekToYmd,
  };
}

/** Sunday before the Monday send: if asOf is Monday, week ends previous Sunday. */
export function defaultWeekEndYmd(asOfYmd: string): string {
  const noon = new Date(`${asOfYmd}T12:00:00+05:30`);
  const day = noon.getDay(); // 0 Sun … 6 Sat in local if engine uses local — use UTC parts from ISO
  // getDay on Date with +05:30 offset: use Intl
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Colombo",
    weekday: "short",
  }).format(noon);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const d = map[wd] ?? 0;
  // Week ends previous Sunday (or asOf if Sunday)
  const back = d === 0 ? 0 : d;
  const end = new Date(noon);
  end.setDate(end.getDate() - back);
  return formatAppIsoDate(end);
}

export function mtdFromYmd(asOfYmd: string): string {
  return `${asOfYmd.slice(0, 7)}-01`;
}

export function isInInclusiveYmdRange(
  at: Date | null | undefined,
  fromYmd: string,
  toYmd: string
): boolean {
  if (!at) return false;
  const start = parseAppCalendarDayStart(fromYmd);
  const end = parseAppCalendarDayEnd(toYmd);
  if (!start || !end) return false;
  const t = at.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

export function countsAsNewlyEligible(input: {
  loyaltyEligibleAt: Date | null | undefined;
  fromYmd: string;
  toYmd: string;
}): boolean {
  return isInInclusiveYmdRange(input.loyaltyEligibleAt, input.fromYmd, input.toYmd);
}

export function countsAsUpdated(input: {
  loyaltyOutreachUpdatedAt: Date | null | undefined;
  loyaltyAssignedAt: Date | null | undefined;
  loyaltyOutreachStatus: string | null | undefined;
  fromYmd: string;
  toYmd: string;
}): boolean {
  if (isInInclusiveYmdRange(input.loyaltyAssignedAt, input.fromYmd, input.toYmd)) {
    return true;
  }
  if (
    !isInInclusiveYmdRange(
      input.loyaltyOutreachUpdatedAt,
      input.fromYmd,
      input.toYmd
    )
  ) {
    return false;
  }
  const status = input.loyaltyOutreachStatus ?? "";
  return (LOYALTY_WORKED_STATUSES as readonly string[]).includes(status);
}

type ContactRow = {
  id: string;
  name: string;
  phoneNumber: string | null;
  email: string | null;
  assignedMerchant: string | null;
  loyaltyAssignedTier: string | null;
  loyaltyOutreachStatus: string | null;
  loyaltyEligibleAt: Date | null;
  loyaltyOutreachUpdatedAt: Date | null;
  loyaltyAssignedAt: Date | null;
  emails: Array<{ email: string }>;
  phones: Array<{ phoneNumber: string }>;
};

function normalizeMerchantLabel(label: string | null | undefined): string {
  const t = label?.trim();
  return t && t.length > 0 ? t : "Unallocated";
}

function isOpenPendingStatus(
  status: string | null | undefined,
  pending: PendingLoyaltySuggestion
): boolean {
  if (pending.kind === "upgrade" && (status === "assigned" || !status)) {
    return true;
  }
  if (!status || status === "eligible") return true;
  return (
    status === "contacted" ||
    status === "responded" ||
    status === "not_responded"
  );
}

async function loadCandidateContacts(
  companyId: string,
  assignedMerchant?: string
): Promise<ContactRow[]> {
  const merchantFilter = assignedMerchant?.trim()
    ? {
        assignedMerchant: {
          equals: assignedMerchant.trim(),
          mode: "insensitive" as const,
        },
      }
    : {};

  const [unassigned, goldAssigned] = await Promise.all([
    prisma.contactMaster.findMany({
      where: {
        companyId,
        loyaltyAssignedTier: null,
        ...merchantFilter,
        OR: [
          {
            loyaltyOutreachStatus: {
              in: [...LOYALTY_OUTREACH_QUEUE_STATUSES],
            },
          },
          { loyaltyOutreachStatus: null },
        ],
      },
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        email: true,
        assignedMerchant: true,
        loyaltyAssignedTier: true,
        loyaltyOutreachStatus: true,
        loyaltyEligibleAt: true,
        loyaltyOutreachUpdatedAt: true,
        loyaltyAssignedAt: true,
        emails: { select: { email: true } },
        phones: { select: { phoneNumber: true } },
      },
      take: CANDIDATE_CAP,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.contactMaster.findMany({
      where: {
        companyId,
        loyaltyAssignedTier: "gold",
        ...merchantFilter,
      },
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        email: true,
        assignedMerchant: true,
        loyaltyAssignedTier: true,
        loyaltyOutreachStatus: true,
        loyaltyEligibleAt: true,
        loyaltyOutreachUpdatedAt: true,
        loyaltyAssignedAt: true,
        emails: { select: { email: true } },
        phones: { select: { phoneNumber: true } },
      },
      take: CANDIDATE_CAP,
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const byId = new Map<string, ContactRow>();
  for (const row of [...unassigned, ...goldAssigned]) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  return [...byId.values()];
}

async function lifetimeMap(
  companyId: string,
  rows: ContactRow[]
): Promise<Map<string, number>> {
  const lifetimeById = new Map<string, number>();
  for (let i = 0; i < rows.length; i += LIFETIME_CHUNK) {
    const slice = rows.slice(i, i + LIFETIME_CHUNK);
    const chunk = await lifetimeTotalsByContactId(companyId, slice);
    for (const [id, total] of chunk) lifetimeById.set(id, total);
  }
  return lifetimeById;
}

export async function listLoyaltyEligiblePending(input: {
  companyId: string;
  page: number;
  pageSize: number;
  assignedMerchant?: string;
}): Promise<{
  items: LoyaltyEligibleListItem[];
  pagination: { page: number; pageSize: number; total: number };
}> {
  const page = Math.max(1, input.page);
  const pageSize = Math.min(100, Math.max(1, input.pageSize));
  const contacts = await loadCandidateContacts(
    input.companyId,
    input.assignedMerchant
  );
  if (contacts.length === 0) {
    return {
      items: [],
      pagination: { page, pageSize, total: 0 },
    };
  }

  const lifetimeById = await lifetimeMap(input.companyId, contacts);
  const pendingRows: LoyaltyEligibleListItem[] = [];

  for (const c of contacts) {
    const lifetimeTotal = lifetimeById.get(c.id) ?? 0;
    const pending = pendingLoyaltySuggestion(
      c.loyaltyAssignedTier,
      lifetimeTotal
    );
    if (!pending) continue;
    if (!isOpenPendingStatus(c.loyaltyOutreachStatus, pending)) continue;

    let status = c.loyaltyOutreachStatus ?? "eligible";
    if (pending.kind === "upgrade" && (status === "assigned" || !status)) {
      status = "eligible";
    } else if (!status) {
      status = "eligible";
    }

    pendingRows.push({
      contactId: c.id,
      name: c.name,
      phoneNumber: c.phoneNumber,
      assignedMerchant: c.assignedMerchant,
      lifetimeTotal,
      suggestedTier: pending.suggestedTier,
      suggestionKind: pending.kind,
      status,
      loyaltyEligibleAt: c.loyaltyEligibleAt?.toISOString() ?? null,
    });
  }

  pendingRows.sort((a, b) => b.lifetimeTotal - a.lifetimeTotal);
  const total = pendingRows.length;
  const start = (page - 1) * pageSize;
  return {
    items: pendingRows.slice(start, start + pageSize),
    pagination: { page, pageSize, total },
  };
}

export async function buildLoyaltyEligibleMerchantSummary(input: {
  companyId: string;
  asOfYmd?: string;
  weekEndYmd?: string;
}): Promise<LoyaltyEligibleSummaryDto> {
  const asOf = input.asOfYmd ?? formatAppIsoDate(new Date());
  const weekTo = input.weekEndYmd ?? defaultWeekEndYmd(asOf);
  const week = weekWindowFromEnd(weekTo);
  const mtdFrom = mtdFromYmd(asOf);

  const contacts = await loadCandidateContacts(input.companyId);
  const lifetimeById =
    contacts.length > 0
      ? await lifetimeMap(input.companyId, contacts)
      : new Map<string, number>();

  type Acc = {
    pending: number;
    mtdNewlyEligible: number;
    mtdUpdated: number;
    weekNewlyEligible: number;
    weekUpdated: number;
  };

  const byMerchant = new Map<string, Acc>();
  const ensure = (label: string): Acc => {
    let row = byMerchant.get(label);
    if (!row) {
      row = {
        pending: 0,
        mtdNewlyEligible: 0,
        mtdUpdated: 0,
        weekNewlyEligible: 0,
        weekUpdated: 0,
      };
      byMerchant.set(label, row);
    }
    return row;
  };

  // Also scan contacts that may only contribute to newly/updated (already assigned)
  const stampWindowContacts = await prisma.contactMaster.findMany({
    where: {
      companyId: input.companyId,
      OR: [
        {
          loyaltyEligibleAt: {
            gte: parseAppCalendarDayStart(mtdFrom)!,
            lte: parseAppCalendarDayEnd(asOf)!,
          },
        },
        {
          loyaltyOutreachUpdatedAt: {
            gte: parseAppCalendarDayStart(
              week.from < mtdFrom ? week.from : mtdFrom
            )!,
            lte: parseAppCalendarDayEnd(asOf)!,
          },
        },
        {
          loyaltyAssignedAt: {
            gte: parseAppCalendarDayStart(
              week.from < mtdFrom ? week.from : mtdFrom
            )!,
            lte: parseAppCalendarDayEnd(asOf)!,
          },
        },
      ],
    },
    select: {
      id: true,
      assignedMerchant: true,
      loyaltyOutreachStatus: true,
      loyaltyEligibleAt: true,
      loyaltyOutreachUpdatedAt: true,
      loyaltyAssignedAt: true,
    },
    take: CANDIDATE_CAP,
  });

  for (const c of stampWindowContacts) {
    const label = normalizeMerchantLabel(c.assignedMerchant);
    const row = ensure(label);
    if (
      countsAsNewlyEligible({
        loyaltyEligibleAt: c.loyaltyEligibleAt,
        fromYmd: mtdFrom,
        toYmd: asOf,
      })
    ) {
      row.mtdNewlyEligible += 1;
    }
    if (
      countsAsNewlyEligible({
        loyaltyEligibleAt: c.loyaltyEligibleAt,
        fromYmd: week.from,
        toYmd: week.to,
      })
    ) {
      row.weekNewlyEligible += 1;
    }
    if (
      countsAsUpdated({
        loyaltyOutreachUpdatedAt: c.loyaltyOutreachUpdatedAt,
        loyaltyAssignedAt: c.loyaltyAssignedAt,
        loyaltyOutreachStatus: c.loyaltyOutreachStatus,
        fromYmd: mtdFrom,
        toYmd: asOf,
      })
    ) {
      row.mtdUpdated += 1;
    }
    if (
      countsAsUpdated({
        loyaltyOutreachUpdatedAt: c.loyaltyOutreachUpdatedAt,
        loyaltyAssignedAt: c.loyaltyAssignedAt,
        loyaltyOutreachStatus: c.loyaltyOutreachStatus,
        fromYmd: week.from,
        toYmd: week.to,
      })
    ) {
      row.weekUpdated += 1;
    }
  }

  for (const c of contacts) {
    const lifetimeTotal = lifetimeById.get(c.id) ?? 0;
    const pending = pendingLoyaltySuggestion(
      c.loyaltyAssignedTier,
      lifetimeTotal
    );
    if (!pending) continue;
    if (!isOpenPendingStatus(c.loyaltyOutreachStatus, pending)) continue;
    const label = normalizeMerchantLabel(c.assignedMerchant);
    ensure(label).pending += 1;
  }

  const merchants: LoyaltyEligibleMerchantRow[] = [...byMerchant.entries()]
    .map(([merchantLabel, row]) => ({
      merchantLabel,
      pending: row.pending,
      newlyEligible: row.mtdNewlyEligible,
      updated: row.mtdUpdated,
      mtdNewlyEligible: row.mtdNewlyEligible,
      mtdUpdated: row.mtdUpdated,
      weekNewlyEligible: row.weekNewlyEligible,
      weekUpdated: row.weekUpdated,
    }))
    .filter(
      (r) =>
        r.pending > 0 ||
        r.mtdNewlyEligible > 0 ||
        r.mtdUpdated > 0 ||
        r.weekNewlyEligible > 0 ||
        r.weekUpdated > 0
    )
    .sort((a, b) => b.pending - a.pending || a.merchantLabel.localeCompare(b.merchantLabel));

  const company = merchants.reduce(
    (acc, m) => {
      acc.pending += m.pending;
      acc.mtdNewlyEligible += m.mtdNewlyEligible;
      acc.mtdUpdated += m.mtdUpdated;
      acc.weekNewlyEligible += m.weekNewlyEligible;
      acc.weekUpdated += m.weekUpdated;
      return acc;
    },
    {
      pending: 0,
      mtdNewlyEligible: 0,
      mtdUpdated: 0,
      weekNewlyEligible: 0,
      weekUpdated: 0,
    }
  );

  return {
    asOf,
    mtdFrom,
    weekFrom: week.from,
    weekTo: week.to,
    company,
    merchants,
  };
}
