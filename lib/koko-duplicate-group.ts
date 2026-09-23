import { createHash } from "crypto";

import { KOKO_DUPLICATE_LOOKBACK_DAYS } from "@/lib/koko-order";
import { canonicalPhoneForErpCustomerId } from "@/lib/phone-lookup";

export type KokoLineForFingerprint = {
  sku?: string | null;
  productItemId?: string | null;
  quantity: number;
};

/** Sorted multiset fingerprint: sku|qty (prefer sku, else productItemId). */
export function buildOrderItemFingerprint(lines: KokoLineForFingerprint[]): string | null {
  const byKey = new Map<string, number>();
  for (const line of lines) {
    const qty = Math.floor(Number(line.quantity));
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const sku = line.sku?.trim();
    const key = sku
      ? `s:${sku.toLowerCase()}`
      : line.productItemId?.trim()
        ? `p:${line.productItemId.trim()}`
        : null;
    if (!key) continue;
    byKey.set(key, (byKey.get(key) ?? 0) + qty);
  }
  if (byKey.size === 0) return null;
  return [...byKey.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, q]) => `${k}|${q}`)
    .join(";");
}

export function phoneKeyForKokoDuplicate(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  return canonicalPhoneForErpCustomerId(raw);
}

export function ephemeralDuplicateGroupId(phoneKey: string, fingerprint: string): string {
  return createHash("sha256").update(`${phoneKey}|${fingerprint}`).digest("hex").slice(0, 16);
}

export type KokoDuplicateCandidate = {
  orderId: string;
  approvalId?: string | null;
  status: string;
  createdAt: Date;
  customerPhone: string | null;
  fingerprint: string | null;
  phoneKey: string | null;
  kokoLinkGeneratedAt?: Date | null;
  invoiceNo?: string | null;
  merchantLabel?: string | null;
  itemSummary?: string | null;
};

export type KokoDuplicateGroupMember = {
  orderId: string;
  approvalId: string | null;
  status: string;
  kokoLinkGeneratedAt: string | null;
  invoiceNo: string | null;
  merchantLabel: string | null;
  itemSummary: string | null;
};

export type KokoDuplicateGroupMeta = {
  duplicateGroupId: string;
  duplicateGroupSize: number;
  duplicateGroupMembers: KokoDuplicateGroupMember[];
};

/**
 * Group candidates by phoneKey + fingerprint within lookback of the newest member.
 * Only returns groups with size >= 2.
 */
export function buildKokoDuplicateGroups(
  candidates: KokoDuplicateCandidate[],
  lookbackDays = KOKO_DUPLICATE_LOOKBACK_DAYS,
): Map<string, KokoDuplicateGroupMeta> {
  const byKey = new Map<string, KokoDuplicateCandidate[]>();
  for (const c of candidates) {
    if (!c.phoneKey || !c.fingerprint) continue;
    if (c.status === "voided" || c.status === "cancelled") continue;
    const key = `${c.phoneKey}|${c.fingerprint}`;
    const list = byKey.get(key) ?? [];
    list.push(c);
    byKey.set(key, list);
  }

  const result = new Map<string, KokoDuplicateGroupMeta>();
  const lookbackMs = lookbackDays * 24 * 60 * 60 * 1000;

  for (const [key, members] of byKey) {
    if (members.length < 2) continue;
    const newest = Math.max(...members.map((m) => m.createdAt.getTime()));
    const inWindow = members.filter((m) => newest - m.createdAt.getTime() <= lookbackMs);
    if (inWindow.length < 2) continue;

    const [phoneKey, fingerprint] = key.split("|");
    const groupId = ephemeralDuplicateGroupId(phoneKey, fingerprint);
    const sorted = [...inWindow].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    result.set(groupId, {
      duplicateGroupId: groupId,
      duplicateGroupSize: sorted.length,
      duplicateGroupMembers: sorted.map((m) => ({
        orderId: m.orderId,
        approvalId: m.approvalId ?? null,
        status: m.status,
        kokoLinkGeneratedAt: m.kokoLinkGeneratedAt?.toISOString() ?? null,
        invoiceNo: m.invoiceNo ?? null,
        merchantLabel: m.merchantLabel ?? null,
        itemSummary: m.itemSummary ?? null,
      })),
    });
  }
  return result;
}

/** Soft notice siblings for an order (same phone within lookback; prefer matching fingerprint). */
export function findDuplicateNoticeSiblings(
  self: {
    orderId: string;
    phoneKey: string | null;
    fingerprint: string | null;
    createdAt: Date;
  },
  others: KokoDuplicateCandidate[],
  lookbackDays = KOKO_DUPLICATE_LOOKBACK_DAYS,
): KokoDuplicateGroupMember[] {
  if (!self.phoneKey) return [];
  const lookbackMs = lookbackDays * 24 * 60 * 60 * 1000;
  const peers = others.filter((o) => {
    if (o.orderId === self.orderId) return false;
    if (o.phoneKey !== self.phoneKey) return false;
    if (o.status === "voided" || o.status === "cancelled") return false;
    const delta = Math.abs(o.createdAt.getTime() - self.createdAt.getTime());
    if (delta > lookbackMs) return false;
    return true;
  });

  const exact = self.fingerprint
    ? peers.filter((o) => o.fingerprint === self.fingerprint)
    : [];
  const chosen = exact.length > 0 ? exact : peers;

  return chosen
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 10)
    .map((m) => ({
      orderId: m.orderId,
      approvalId: m.approvalId ?? null,
      status: m.status,
      kokoLinkGeneratedAt: m.kokoLinkGeneratedAt?.toISOString() ?? null,
      invoiceNo: m.invoiceNo ?? null,
      merchantLabel: m.merchantLabel ?? null,
      itemSummary: m.itemSummary ?? null,
    }));
}
