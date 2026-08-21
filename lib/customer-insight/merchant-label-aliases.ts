/**
 * Insight filter options + query expansion for ContactMaster.assignedMerchant.
 *
 * Dropdown = company merchant-role users + fixed buckets (DM-General, STAFF SALES).
 * Filter expands to all labels that can appear on contacts for that pick.
 */

import { getMerchantDisplayName } from "@/lib/customer-insight/auto-allocate";
import { merchantMatchKeysForUser } from "@/lib/customer-insight/ownership";
import {
  getPrimaryMerCode,
  merMatchKeysFromCouponCodes,
  normalizeMerCodeKey,
} from "@/lib/merchant-allocation";
import { isMerchantRoleName } from "@/lib/merchant-role";
import { prisma } from "@/lib/prisma";

export type AssignedMerchantAliasGroup = {
  /** Stable filter value sent by the UI. */
  value: string;
  /** Dropdown label. */
  label: string;
  /** All stored labels that belong to this group (incl. canonical). */
  aliases: string[];
};

/**
 * Fixed buckets (not merchant-role users):
 * - MER115 ≡ DM - General
 * - STAFF SALES stays separate
 */
export const ASSIGNED_MERCHANT_ALIAS_GROUPS: AssignedMerchantAliasGroup[] = [
  {
    value: "DM - General",
    label: "DM - General (MER115)",
    aliases: ["DM - General", "DM-General", "DM General", "MER115"],
  },
  {
    value: "STAFF SALES",
    label: "STAFF SALES",
    aliases: ["STAFF SALES"],
  },
];

/** Extra contact labels to OR with a merchant user (beyond knownName/name/MER). */
export const EXTRA_MERCHANT_CONTACT_ALIASES: Record<string, string[]> = {
  // Sandali contacts historically stored display names; filter value is MER91.
  MER91: ["sandali", "Sadali Navodya"],
};

function norm(value: string): string {
  return value.trim().toLowerCase();
}

function uniqueLabels(labels: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const label of labels) {
    const t = label.trim();
    if (!t) continue;
    const k = norm(t);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function groupByAliasKey(): Map<string, AssignedMerchantAliasGroup> {
  const map = new Map<string, AssignedMerchantAliasGroup>();
  for (const group of ASSIGNED_MERCHANT_ALIAS_GROUPS) {
    for (const alias of group.aliases) {
      map.set(norm(alias), group);
    }
    map.set(norm(group.value), group);
  }
  return map;
}

const ALIAS_INDEX = groupByAliasKey();

export function findAssignedMerchantAliasGroup(
  label: string | null | undefined
): AssignedMerchantAliasGroup | null {
  const key = norm(label ?? "");
  if (!key) return null;
  return ALIAS_INDEX.get(key) ?? null;
}

/** Static bucket expansion only (no user lookup). */
export function expandAssignedMerchantFilter(
  selected: string | null | undefined
): string[] {
  const trimmed = (selected ?? "").trim();
  if (!trimmed) return [];
  const group = findAssignedMerchantAliasGroup(trimmed);
  if (!group) return [trimmed];
  return uniqueLabels(group.aliases);
}

export function canonicalizeAssignedMerchantOption(
  rawLabel: string
): { value: string; label: string } | null {
  const group = findAssignedMerchantAliasGroup(rawLabel);
  if (!group) return null;
  return { value: group.value, label: group.label };
}

export function insightMerchantOptionValue(user: {
  knownName?: string | null;
  name?: string | null;
  email?: string | null;
  couponCodes?: string[] | null;
}): string | null {
  const mer = getPrimaryMerCode(user.couponCodes ?? null);
  if (mer) return mer;
  return getMerchantDisplayName(user);
}

export function insightMerchantOptionLabel(user: {
  knownName?: string | null;
  name?: string | null;
  email?: string | null;
  couponCodes?: string[] | null;
}): string | null {
  const display = getMerchantDisplayName(user);
  if (!display) return null;
  const mer = getPrimaryMerCode(user.couponCodes ?? null);
  return mer ? `${display} (${mer})` : display;
}

type MerchantFilterUser = {
  id: string;
  knownName: string | null;
  name: string | null;
  email: string | null;
  couponCodes: string[];
};

async function listCompanyMerchantFilterUsers(
  companyId: string
): Promise<MerchantFilterUser[]> {
  const roles = await prisma.role.findMany({ select: { id: true, name: true } });
  const merchantRoleIds = roles
    .filter((r) => isMerchantRoleName(r.name))
    .map((r) => r.id);
  if (merchantRoleIds.length === 0) return [];

  return prisma.user.findMany({
    where: {
      companyId,
      userRoles: { some: { roleId: { in: merchantRoleIds } } },
    },
    select: {
      id: true,
      knownName: true,
      name: true,
      email: true,
      couponCodes: true,
    },
    orderBy: [{ knownName: "asc" }, { name: "asc" }, { email: "asc" }],
  });
}

function userMatchesFilterValue(
  user: MerchantFilterUser,
  selected: string
): boolean {
  const selectedNorm = norm(selected);
  const mer = getPrimaryMerCode(user.couponCodes);
  if (mer && norm(mer) === selectedNorm) return true;
  const display = getMerchantDisplayName(user);
  if (display && norm(display) === selectedNorm) return true;
  return merchantMatchKeysForUser(user).some((k) => norm(k) === selectedNorm);
}

function labelsForMerchantUser(user: MerchantFilterUser): string[] {
  const mer = getPrimaryMerCode(user.couponCodes);
  const extras = mer ? EXTRA_MERCHANT_CONTACT_ALIASES[mer] ?? [] : [];
  return uniqueLabels([
    ...merchantMatchKeysForUser(user),
    ...merMatchKeysFromCouponCodes(user.couponCodes),
    ...extras,
  ]);
}

/**
 * Resolve all ContactMaster.assignedMerchant strings that should match a
 * dropdown selection (MER code, display name, or fixed bucket).
 */
export async function resolveAssignedMerchantFilterLabels(
  companyId: string,
  selected: string | null | undefined
): Promise<string[]> {
  const trimmed = (selected ?? "").trim();
  if (!trimmed) return [];

  if (findAssignedMerchantAliasGroup(trimmed)) {
    return expandAssignedMerchantFilter(trimmed);
  }

  const users = await listCompanyMerchantFilterUsers(companyId);
  const hit = users.find((u) => userMatchesFilterValue(u, trimmed));
  if (hit) return labelsForMerchantUser(hit);

  const merKey = normalizeMerCodeKey(trimmed);
  if (merKey && EXTRA_MERCHANT_CONTACT_ALIASES[merKey]) {
    return uniqueLabels([
      trimmed,
      merKey,
      ...EXTRA_MERCHANT_CONTACT_ALIASES[merKey],
    ]);
  }

  return [trimmed];
}

export async function findMerchantUserForFilterValue(
  companyId: string,
  selected: string | null | undefined
): Promise<{ id: string; value: string; label: string } | null> {
  const trimmed = (selected ?? "").trim();
  if (!trimmed) return null;
  const users = await listCompanyMerchantFilterUsers(companyId);
  const hit = users.find((u) => userMatchesFilterValue(u, trimmed));
  if (!hit) return null;
  const value = insightMerchantOptionValue(hit);
  const label = insightMerchantOptionLabel(hit);
  if (!value || !label) return null;
  return { id: hit.id, value, label };
}

export async function listInsightMerchantRosterOptions(
  companyId: string,
  q?: string
): Promise<Array<{ value: string; label: string }>> {
  const needle = q?.trim().toLowerCase();
  const users = await listCompanyMerchantFilterUsers(companyId);

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

  for (const group of ASSIGNED_MERCHANT_ALIAS_GROUPS) {
    push(group.value, group.label);
  }

  for (const user of users) {
    const value = insightMerchantOptionValue(user);
    const label = insightMerchantOptionLabel(user);
    if (!value || !label) continue;
    push(value, label);
  }

  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}
