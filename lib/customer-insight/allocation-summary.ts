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

function norm(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Per-merchant ContactMaster allocation counts for Insight admin.
 * Rolls alias labels into roster merchants; leftover labels stay as their own rows.
 */
export async function listMerchantAllocationCounts(
  companyId: string
): Promise<MerchantAllocationSummary> {
  const [grouped, roster] = await Promise.all([
    prisma.contactMaster.groupBy({
      by: ["assignedMerchant"],
      where: { companyId },
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
