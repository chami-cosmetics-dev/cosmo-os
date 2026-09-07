//Merchant Allocation - Data Collection
import {
  listInsightMerchantRosterOptions,
  resolveAssignedMerchantFilterLabels,
} from "@/lib/customer-insight/merchant-label-aliases";
import { prisma } from "@/lib/prisma";

export type MerchantAllocationDateRangeStats = {
  callsTaken: number;
  birthdayCount: number;
  birthdayPercent: number;
  emailCount: number;
  emailPercent: number;
};

export type MerchantAllocationCountRow = {
  /** Filter value (MER / bucket) or raw label. */
  merchantValue: string;
  merchantLabel: string;
  platinum: number;
  gold: number;
  other: number;
  total: number;
  /**
   * Contacts allocated to this merchant that have BOTH an email and a birthday
   * (month & day) on file. All-time — never scoped to `dateRange`.
   */
  completeCount: number;
  /** completeCount / total, capped at 100. */
  completePercent: number;
  /** Present only when a date range was requested. */
  dateRangeStats?: MerchantAllocationDateRangeStats;
};

export type MerchantAllocationSummary = {
  rows: MerchantAllocationCountRow[];
  allocatedTotal: number;
  unallocatedCount: number;
  contactTotal: number;
};

export type MerchantAllocationDateRange = {
  from: Date;
  to: Date;
};

function norm(value: string): string {
  return value.trim().toLowerCase();
}

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.min(100, Math.round((numerator / denominator) * 100));
}

/**
 * Per-merchant ContactMaster allocation counts for Insight admin, split by
 * loyaltyAssignedTier into platinum / gold / other buckets. Rolls alias
 * labels into roster merchants; leftover labels stay as their own rows.
 *
 * Every row also carries `completeCount` / `completePercent`: contacts
 * allocated to that merchant that have BOTH an email and a birthday (month &
 * day) on file, over the merchant's allocation total. This is all-time and
 * never scoped to `dateRange`.
 *
 * When `dateRange` is supplied, each row also gets `dateRangeStats`:
 * - callsTaken: distinct contacts contacted in that window via a non-allocation
 *   ContactAllocationUpdate event (allocation-only events are excluded, matching
 *   how "contacted" is counted elsewhere in Insight — see lib/customer-insight/
 *   contacted.ts / call-queue.ts)
 * - birthdayCount / birthdayPercent: birthday fields updated in the window,
 *   divided by calls taken in the window (capped at 100%)
 * - emailCount / emailPercent: email fields updated in the window, divided by
 *   calls taken in the window (capped at 100%)
 */
export async function listMerchantAllocationCounts(
  companyId: string,
  dateRange?: MerchantAllocationDateRange
): Promise<MerchantAllocationSummary> {
  const [grouped, completeGrouped, roster] = await Promise.all([
    prisma.contactMaster.groupBy({
      by: ["assignedMerchant", "loyaltyAssignedTier"],
      where: { companyId },
      _count: { _all: true },
    }),
    // Contacts with BOTH email and birthday (month & day) on file, per merchant.
    // All-time — the "profile complete" column is never date-range scoped.
    prisma.contactMaster.groupBy({
      by: ["assignedMerchant"],
      where: {
        companyId,
        assignedMerchant: { not: null },
        email: { not: null },
        birthMonth: { not: null },
        birthDay: { not: null },
      },
      _count: { _all: true },
    }),
    listInsightMerchantRosterOptions(companyId),
  ]);

  const aliasToRoster = new Map<
    string,
    { value: string; label: string }
  >();
  await Promise.all(
    roster.map(async (opt) => {
      const aliases = await resolveAssignedMerchantFilterLabels(
        companyId,
        opt.value
      );
      for (const alias of aliases) {
        const key = norm(alias);
        if (!key || aliasToRoster.has(key)) continue;
        aliasToRoster.set(key, { value: opt.value, label: opt.label });
      }
      const valueKey = norm(opt.value);
      if (valueKey && !aliasToRoster.has(valueKey)) {
        aliasToRoster.set(valueKey, { value: opt.value, label: opt.label });
      }
    })
  );

  const counts = new Map<string, MerchantAllocationCountRow>();
  let unallocatedCount = 0;

  for (const row of grouped) {
    const n = row._count._all;
    const raw = row.assignedMerchant?.trim() ?? "";
    if (!raw) {
      unallocatedCount += n;
      continue;
    }

    const matched = aliasToRoster.get(norm(raw));
    const merchantValue = matched?.value ?? raw;
    const merchantLabel = matched?.label ?? raw;
    const key = norm(merchantValue);

    let entry = counts.get(key);
    if (!entry) {
      entry = {
        merchantValue,
        merchantLabel,
        platinum: 0,
        gold: 0,
        other: 0,
        total: 0,
        completeCount: 0,
        completePercent: 0,
      };
      counts.set(key, entry);
    }

    const tier = norm(row.loyaltyAssignedTier ?? "");
    if (tier === "platinum") {
      entry.platinum += n;
    } else if (tier === "gold") {
      entry.gold += n;
    } else {
      entry.other += n;
    }
    entry.total += n;
  }

  const rows = [...counts.values()];

  const completeByMerchant = new Map<string, number>();
  for (const g of completeGrouped) {
    const raw = g.assignedMerchant?.trim() ?? "";
    if (!raw) continue;

    const matched = aliasToRoster.get(norm(raw));
    const key = norm(matched?.value ?? raw);
    completeByMerchant.set(
      key,
      (completeByMerchant.get(key) ?? 0) + g._count._all
    );
  }
  for (const row of rows) {
    row.completeCount = completeByMerchant.get(norm(row.merchantValue)) ?? 0;
    row.completePercent = pct(row.completeCount, row.total);
  }

  if (dateRange) {
    await attachDateRangeStats(companyId, dateRange, rows, aliasToRoster);
  }

  rows.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return a.merchantLabel.localeCompare(b.merchantLabel, undefined, {
      sensitivity: "base",
    });
  });

  const allocatedTotal = rows.reduce((sum, r) => sum + r.total, 0);

  return {
    rows,
    allocatedTotal,
    unallocatedCount,
    contactTotal: allocatedTotal + unallocatedCount,
  };
}

/**
 * Mutates `rows` in place, attaching `dateRangeStats` per merchant.
 */
async function attachDateRangeStats(
  companyId: string,
  dateRange: MerchantAllocationDateRange,
  rows: MerchantAllocationCountRow[],
  aliasToRoster: Map<string, { value: string; label: string }>
): Promise<void> {
  const { from, to } = dateRange;

  const [calledPairs, 
    birthdayGrouped, emailGrouped
  ] = await Promise.all([
    prisma.contactAllocationUpdate.groupBy({
      by: ["merchantName", "contactId"],
      where: {
        companyId,
        createdAt: { gte: from, lte: to },
        // Exclude pure allocation/reassignment events so "calls taken" lines up
        // with how the rest of Insight counts contact activity.
        NOT: { category: "allocation" },
      },
      _count: { _all: true },
    }),
    // Birthday / email collection counts per merchant, filtered to the window in
    // SQL so we never load the full ContactMaster table into memory.
    prisma.contactMaster.groupBy({
      by: ["assignedMerchant"],
      where: {
        companyId,
        assignedMerchant: { not: null },
        birthdayUpdatedAt: { gte: from, lte: to },
      },
      _count: { _all: true },
    }),
    prisma.contactMaster.groupBy({
      by: ["assignedMerchant"],
      where: {
        companyId,
        assignedMerchant: { not: null },
        emailUpdatedAt: { gte: from, lte: to },
      },
      _count: { _all: true },
    }),
  ]);

  const callsTakenByMerchant = new Map<string, number>();
  for (const pair of calledPairs) {
    const merchantName = pair.merchantName?.trim() ?? "";
    if (!merchantName) continue;

    const matched = aliasToRoster.get(norm(merchantName));
    const merchantValue = matched?.value ?? merchantName;
    const key = norm(merchantValue);
    callsTakenByMerchant.set(key, (callsTakenByMerchant.get(key) ?? 0) + 1);
  }

  const birthdayByMerchant = new Map<string, number>();
  for (const g of birthdayGrouped) {
    const raw = g.assignedMerchant?.trim() ?? "";
    if (!raw) continue;

    const matched = aliasToRoster.get(norm(raw));
    const key = norm(matched?.value ?? raw);
    birthdayByMerchant.set(key, (birthdayByMerchant.get(key) ?? 0) + g._count._all);
  }

  const emailByMerchant = new Map<string, number>();
  for (const g of emailGrouped) {
    const raw = g.assignedMerchant?.trim() ?? "";
    if (!raw) continue;

    const matched = aliasToRoster.get(norm(raw));
    const key = norm(matched?.value ?? raw);
    emailByMerchant.set(key, (emailByMerchant.get(key) ?? 0) + g._count._all);
  }

  for (const row of rows) {
    const key = norm(row.merchantValue);
    const callsTaken = callsTakenByMerchant.get(key) ?? 0;
    const birthdayCount = birthdayByMerchant.get(key) ?? 0;
    const emailCount = emailByMerchant.get(key) ?? 0;

    row.dateRangeStats = {
      callsTaken,
      birthdayCount,
      birthdayPercent: pct(birthdayCount, callsTaken),
      emailCount,
      emailPercent: pct(emailCount, callsTaken),
    };
  }
}
// Merchant Allocation - Data Collection ---- End

//Merchant Allocation - Purchase Performance
export type PurchaseCountPreset =
  | "today"
  | "1-30"
  | "31-90"
  | "91-180"
  | "181-365"
  | "over-365";

export type PurchaseCountFilter =
  | { preset: PurchaseCountPreset }
  | { preset: "custom"; from: Date; to: Date };

export type MerchantTierStats = {
  platinum: number;
  gold: number;
  other: number;
  total: number;
};

export type MerchantPurchaseCountRow = {
  /** Filter value (MER / bucket) or raw label. */
  merchantValue: string;
  merchantLabel: string;
  allocation: MerchantTierStats;
  purchaseCount: MerchantTierStats;
};

export type MerchantPurchaseCountSummary = {
  rows: MerchantPurchaseCountRow[];
  filter: PurchaseCountFilter;
};

function emptyTierStats(): MerchantTierStats {
  return { platinum: 0, gold: 0, other: 0, total: 0 };
}

function addToTier(stats: MerchantTierStats, tier: string, n: number): void {
  const t = norm(tier);
  if (t === "platinum") stats.platinum += n;
  else if (t === "gold") stats.gold += n;
  else stats.other += n;
  stats.total += n;
}

function startOfDayUTC(d: Date): Date {
  const copy = new Date(d);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

function endOfDayUTC(d: Date): Date {
  const copy = new Date(d);
  copy.setUTCHours(23, 59, 59, 999);
  return copy;
}

function daysAgoUTC(base: Date, days: number): Date {
  const copy = new Date(base);
  copy.setUTCDate(copy.getUTCDate() - days);
  return copy;
}

/**
 * Resolves a preset into a concrete [from, to] window, computed against
 * "today" at call time — never hardcoded — so the six presets stay
 * non-overlapping. Each contact's lastPurchaseAt falls into exactly one
 * bucket, never counted twice across two presets.
 */
export function resolvePurchaseCountRange(
  filter: PurchaseCountFilter
): { from: Date | null; to: Date } {
  if (filter.preset === "custom") {
    return { from: filter.from, to: filter.to };
  }

  const today = startOfDayUTC(new Date());

  switch (filter.preset) {
    case "today":
      return { from: today, to: endOfDayUTC(today) };
    case "1-30":
      return {
        from: daysAgoUTC(today, 30),
        to: endOfDayUTC(daysAgoUTC(today, 1)),
      };
    case "31-90":
      return {
        from: daysAgoUTC(today, 90),
        to: endOfDayUTC(daysAgoUTC(today, 31)),
      };
    case "91-180":
      return {
        from: daysAgoUTC(today, 180),
        to: endOfDayUTC(daysAgoUTC(today, 91)),
      };
    case "181-365":
      return {
        from: daysAgoUTC(today, 365),
        to: endOfDayUTC(daysAgoUTC(today, 181)),
      };
    case "over-365":
      return { from: null, to: endOfDayUTC(daysAgoUTC(today, 366)) };
  }
}

/**
 * Allocation (Platinum/Gold/Other/Total) + Purchase Count (same tier
 * breakdown, counted from ContactMaster.lastPurchaseAt within the selected
 * window) per merchant. Defaults to "today" when no filter is supplied.
 * Reuses the same roster/alias resolution as listMerchantAllocationCounts so
 * merchant rows line up identically between the two tables.
 */
export async function listMerchantPurchaseCountSummary(
  companyId: string,
  filter: PurchaseCountFilter = { preset: "today" }
): Promise<MerchantPurchaseCountSummary> {
  const [allocationGrouped, roster] = await Promise.all([
    prisma.contactMaster.groupBy({
      by: ["assignedMerchant", "loyaltyAssignedTier"],
      where: { companyId },
      _count: { _all: true },
    }),
    listInsightMerchantRosterOptions(companyId),
  ]);

  const aliasToRoster = new Map<string, { value: string; label: string }>();
  await Promise.all(
    roster.map(async (opt) => {
      const aliases = await resolveAssignedMerchantFilterLabels(
        companyId,
        opt.value
      );
      for (const alias of aliases) {
        const key = norm(alias);
        if (!key || aliasToRoster.has(key)) continue;
        aliasToRoster.set(key, { value: opt.value, label: opt.label });
      }
      const valueKey = norm(opt.value);
      if (valueKey && !aliasToRoster.has(valueKey)) {
        aliasToRoster.set(valueKey, { value: opt.value, label: opt.label });
      }
    })
  );

  const rowsByKey = new Map<string, MerchantPurchaseCountRow>();

  for (const row of allocationGrouped) {
    const n = row._count._all;
    const raw = row.assignedMerchant?.trim() ?? "";
    if (!raw) continue; // unallocated contacts don't get a merchant row here

    const matched = aliasToRoster.get(norm(raw));
    const merchantValue = matched?.value ?? raw;
    const merchantLabel = matched?.label ?? raw;
    const key = norm(merchantValue);

    let entry = rowsByKey.get(key);
    if (!entry) {
      entry = {
        merchantValue,
        merchantLabel,
        allocation: emptyTierStats(),
        purchaseCount: emptyTierStats(),
      };
      rowsByKey.set(key, entry);
    }
    addToTier(entry.allocation, row.loyaltyAssignedTier ?? "", n);
  }

  const { from, to } = resolvePurchaseCountRange(filter);

  const purchaseGrouped = await prisma.contactMaster.groupBy({
    by: ["assignedMerchant", "loyaltyAssignedTier"],
    where: {
      companyId,
      lastPurchaseAt: { ...(from ? { gte: from } : {}), lte: to },
    },
    _count: { _all: true },
  });

  for (const row of purchaseGrouped) {
    const n = row._count._all;
    const raw = row.assignedMerchant?.trim() ?? "";
    if (!raw) continue;

    const matched = aliasToRoster.get(norm(raw));
    const merchantValue = matched?.value ?? raw;
    const merchantLabel = matched?.label ?? raw;
    const key = norm(merchantValue);

    let entry = rowsByKey.get(key);
    if (!entry) {
      // A merchant with purchases in-window but no allocation rows at all
      // shouldn't normally happen (both queries come from ContactMaster),
      // but this guards against it defensively.
      entry = {
        merchantValue,
        merchantLabel,
        allocation: emptyTierStats(),
        purchaseCount: emptyTierStats(),
      };
      rowsByKey.set(key, entry);
    }
    addToTier(entry.purchaseCount, row.loyaltyAssignedTier ?? "", n);
  }

  const rows = [...rowsByKey.values()].sort((a, b) => {
    if (b.allocation.total !== a.allocation.total) {
      return b.allocation.total - a.allocation.total;
    }
    return a.merchantLabel.localeCompare(b.merchantLabel, undefined, {
      sensitivity: "base",
    });
  });

  return { rows, filter };
}
//Merchant Allocation - Purchase Performance -------- End

/**
 * Merchant-role roster + any ContactMaster assignedMerchant labels with allocations
 * (e.g. legacy display names like "Zeenath" not linked to a merchant user).
 */
export async function listCallQueueMerchantOptions(
  companyId: string,
  q?: string
): Promise<Array<{ value: string; label: string }>> {
  const [roster, allocation] = await Promise.all([
    listInsightMerchantRosterOptions(companyId),
    listMerchantAllocationCounts(companyId),
  ]);

  const needle = q?.trim().toLowerCase();
  const out: Array<{ value: string; label: string }> = [];
  const seen = new Set<string>();

  const push = (value: string, label: string) => {
    const key = norm(value);
    if (!key || seen.has(key)) return;
    if (needle) {
      const hay = `${value} ${label}`.toLowerCase();
      if (!hay.includes(needle)) return;
    }
    seen.add(key);
    out.push({ value, label });
  };

  for (const opt of roster) {
    push(opt.value, opt.label);
  }
  for (const row of allocation.rows) {
    push(row.merchantValue, row.merchantLabel);
  }

  out.sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
  );
  return out;
}
