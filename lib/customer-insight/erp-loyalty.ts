import { findMatchingContacts } from "@/lib/contact-identifiers";
import {
  getErpContactSyncInstances,
  listCustomersByGroup,
} from "@/lib/erpnext-contact-sync";
import { prisma } from "@/lib/prisma";
import type { LoyaltyTierKey } from "@/lib/customer-insight/types";

export type AssignedLoyaltyTier = "gold" | "platinum";

const ERP_GROUP_TO_TIER: Record<string, AssignedLoyaltyTier> = {
  gold: "gold",
  loyalcs: "gold",
  platinum: "platinum",
  loyalcs2: "platinum",
};

/** ERP Customer Group → OS assigned tier. Individual / other groups → null (no OS write-back). */
export function mapErpCustomerGroupToLoyaltyTier(
  group: string | null | undefined
): AssignedLoyaltyTier | null {
  const key = group?.trim().toLowerCase() ?? "";
  if (!key) return null;
  return ERP_GROUP_TO_TIER[key] ?? null;
}

export function higherAssignedLoyaltyTier(
  a: string | null | undefined,
  b: string | null | undefined
): AssignedLoyaltyTier | null {
  const rank = (t: string | null | undefined) =>
    t === "platinum" ? 2 : t === "gold" ? 1 : 0;
  const r = Math.max(rank(a), rank(b));
  if (r >= 2) return "platinum";
  if (r >= 1) return "gold";
  return null;
}

export function effectiveLoyaltyTierKey(
  assigned: string | null | undefined,
  computed: LoyaltyTierKey
): LoyaltyTierKey {
  return higherAssignedLoyaltyTier(assigned, computed) ?? computed;
}

export async function applyErpLoyaltyTierToContact(input: {
  contactId: string;
  tier: AssignedLoyaltyTier;
}): Promise<"updated" | "unchanged" | "missing"> {
  const current = await prisma.contactMaster.findUnique({
    where: { id: input.contactId },
    select: {
      loyaltyAssignedTier: true,
      loyaltyAssignedAt: true,
      loyaltyOutreachStatus: true,
    },
  });
  if (!current) return "missing";
  const next = higherAssignedLoyaltyTier(current.loyaltyAssignedTier, input.tier);
  if (!next) return "unchanged";
  const alreadyAssigned =
    current.loyaltyAssignedTier === next &&
    current.loyaltyOutreachStatus === "assigned";
  if (alreadyAssigned) return "unchanged";
  await prisma.contactMaster.update({
    where: { id: input.contactId },
    data: {
      loyaltyAssignedTier: next,
      loyaltyAssignedAt: current.loyaltyAssignedAt ?? new Date(),
      loyaltyOutreachStatus: "assigned",
    },
  });
  return "updated";
}

export async function applyErpCustomerGroupToContact(input: {
  companyId: string;
  contactId: string;
  customerGroup: string | null | undefined;
}): Promise<"updated" | "unchanged" | "skipped"> {
  const tier = mapErpCustomerGroupToLoyaltyTier(input.customerGroup);
  if (!tier) return "skipped";
  const result = await applyErpLoyaltyTierToContact({
    contactId: input.contactId,
    tier,
  });
  return result === "missing" ? "skipped" : result;
}

export type ErpLoyaltySyncResult = {
  scanned: number;
  matched: number;
  updated: number;
  unchanged: number;
  skipped: number;
};

/**
 * Pull Gold/Platinum customer_group from ERP1/ERP2 onto matching OS contacts.
 * Never writes OS loyalty back to ERP.
 */
export async function syncErpLoyaltyGroupsToOs(
  companyId: string,
  options: { pageSize?: number; maxPages?: number } = {}
): Promise<ErpLoyaltySyncResult> {
  const instances = await getErpContactSyncInstances(companyId);
  const stats: ErpLoyaltySyncResult = {
    scanned: 0,
    matched: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
  };
  const seen = new Set<string>();

  for (const instance of instances) {
    for (const group of ["Gold", "Platinum"] as const) {
      const rows = await listCustomersByGroup(instance.cfg, group, {
        pageSize: options.pageSize ?? 200,
        maxPages: options.maxPages ?? 20,
      });
      for (const row of rows) {
        stats.scanned += 1;
        const tier = mapErpCustomerGroupToLoyaltyTier(row.customer_group ?? group);
        if (!tier) {
          stats.skipped += 1;
          continue;
        }
        const phone = row.mobile_no?.trim() || row.name?.trim() || null;
        const email = row.email_id?.trim() || null;
        if (!phone && !email) {
          stats.skipped += 1;
          continue;
        }
        const { phoneMatches, emailMatches } = await findMatchingContacts(
          companyId,
          email,
          phone
        );
        const ids = [
          ...new Set(
            (phoneMatches.length > 0 ? phoneMatches : emailMatches).map((c) => c.id)
          ),
        ];
        if (ids.length === 0) {
          stats.skipped += 1;
          continue;
        }
        stats.matched += ids.length;
        for (const contactId of ids) {
          const key = `${contactId}:${tier}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const result = await applyErpLoyaltyTierToContact({ contactId, tier });
          if (result === "updated") stats.updated += 1;
          else stats.unchanged += 1;
        }
      }
    }
  }

  return stats;
}
