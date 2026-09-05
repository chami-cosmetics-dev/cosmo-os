import {
  listInsightMerchantRosterOptions,
  resolveAssignedMerchantFilterLabels,
} from "@/lib/customer-insight/merchant-label-aliases";
import { prisma } from "@/lib/prisma";

export type MerchantAllocationCountRow = {
  /** Filter value (MER / bucket), raw label, or `__unallocated__`. */
  merchantValue: string;
  merchantLabel: string;
  count: number;
};

export type MerchantAllocationSummary = {
  rows: MerchantAllocationCountRow[];
  allocatedTotal: number;
  unallocatedCount: number;
  contactTotal: number;
};

export type AssignedMerchantRosterMatch = {
  value: string;
  label: string;
};

export const ALLOCATION_EXPORT_BATCH_SIZE = 2500;

function norm(value: string): string {
  return value.trim().toLowerCase();
}

export function uniqueContactPhones(
  primary: string | null | undefined,
  aliases: Array<{ phoneNumber: string }>
): string[] {
  const phones: string[] = [];
  const seen = new Set<string>();
  for (const value of [primary, ...aliases.map((p) => p.phoneNumber)]) {
    const phone = value?.trim();
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    phones.push(phone);
  }
  return phones;
}

export function resolveAllocatedMerchant(
  rawAssigned: string,
  aliasToRoster: Map<string, AssignedMerchantRosterMatch>
): AssignedMerchantRosterMatch {
  const raw = rawAssigned.trim();
  const matched = aliasToRoster.get(norm(raw));
  return {
    value: matched?.value ?? raw,
    label: matched?.label ?? raw,
  };
}

export async function loadAssignedMerchantAliasMap(
  companyId: string
): Promise<Map<string, AssignedMerchantRosterMatch>> {
  const roster = await listInsightMerchantRosterOptions(companyId);
  const aliasToRoster = new Map<string, AssignedMerchantRosterMatch>();
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
  return aliasToRoster;
}

/**
 * Per-merchant ContactMaster allocation counts for Insight admin.
 * Rolls alias labels into roster merchants; leftover labels stay as their own rows.
 */
export async function listMerchantAllocationCounts(
  companyId: string
): Promise<MerchantAllocationSummary> {
  const [grouped, aliasToRoster] = await Promise.all([
    prisma.contactMaster.groupBy({
      by: ["assignedMerchant"],
      where: { companyId },
      _count: { _all: true },
    }),
    loadAssignedMerchantAliasMap(companyId),
  ]);

  const counts = new Map<string, MerchantAllocationCountRow>();
  let unallocatedCount = 0;

  for (const row of grouped) {
    const n = row._count._all;
    const raw = row.assignedMerchant?.trim() ?? "";
    if (!raw) {
      unallocatedCount += n;
      continue;
    }
    const matched = resolveAllocatedMerchant(raw, aliasToRoster);
    const merchantValue = matched.value;
    const merchantLabel = matched.label;
    const existing = counts.get(norm(merchantValue));
    if (existing) {
      existing.count += n;
    } else {
      counts.set(norm(merchantValue), {
        merchantValue,
        merchantLabel,
        count: n,
      });
    }
  }

  const rows = [...counts.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.merchantLabel.localeCompare(b.merchantLabel, undefined, {
      sensitivity: "base",
    });
  });

  const allocatedTotal = rows.reduce((sum, r) => sum + r.count, 0);

  return {
    rows,
    allocatedTotal,
    unallocatedCount,
    contactTotal: allocatedTotal + unallocatedCount,
  };
}

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
