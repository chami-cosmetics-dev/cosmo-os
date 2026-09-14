import { randomBytes } from "crypto";

import {
  buildCartFingerprint,
  isProperCartSubset,
  normalizeAbandonedCheckoutLines,
} from "@/lib/abandoned-checkout-cart";
import { canonicalPhoneForErpCustomerId } from "@/lib/phone-lookup";
import { prisma } from "@/lib/prisma";

function createGroupId() {
  return `c${randomBytes(12).toString("hex")}`;
}

export function recomputeCheckoutCartFields(input: {
  customerPhone: string | null | undefined;
  lineItemsJson: unknown;
}): { phoneNormalized: string | null; cartFingerprint: string | null } {
  const phoneRaw = input.customerPhone?.trim() ?? "";
  const phoneNormalized = phoneRaw ? canonicalPhoneForErpCustomerId(phoneRaw) : null;
  const lines = normalizeAbandonedCheckoutLines(input.lineItemsJson);
  const fingerprint = buildCartFingerprint(lines);
  return {
    phoneNormalized,
    // Empty string marks "computed empty cart" so null can mean not yet processed.
    cartFingerprint: fingerprint,
  };
}

type DedupeRow = {
  id: string;
  abandonedAt: Date;
  phoneNormalized: string | null;
  cartFingerprint: string | null;
  exactDuplicateGroupId: string | null;
  supersededByCheckoutId: string | null;
  lineItemsJson: unknown;
};

async function loadCompanyRows(companyId: string, phoneNormalized?: string): Promise<DedupeRow[]> {
  return prisma.shopifyAbandonedCheckout.findMany({
    where: {
      companyId,
      ...(phoneNormalized ? { phoneNormalized } : {}),
    },
    select: {
      id: true,
      abandonedAt: true,
      phoneNormalized: true,
      cartFingerprint: true,
      exactDuplicateGroupId: true,
      supersededByCheckoutId: true,
      lineItemsJson: true,
    },
    orderBy: { abandonedAt: "asc" },
  });
}

async function ensureFingerprints(companyId: string, phoneNormalized?: string) {
  const stale = await prisma.shopifyAbandonedCheckout.findMany({
    where: {
      companyId,
      ...(phoneNormalized ? { phoneNormalized } : {}),
      cartFingerprint: null,
    },
    select: {
      id: true,
      customerPhone: true,
      lineItemsJson: true,
      phoneNormalized: true,
      cartFingerprint: true,
    },
  });

  for (const row of stale) {
    const next = recomputeCheckoutCartFields({
      customerPhone: row.customerPhone,
      lineItemsJson: row.lineItemsJson,
    });
    if (
      next.phoneNormalized === row.phoneNormalized &&
      next.cartFingerprint === row.cartFingerprint
    ) {
      continue;
    }
    await prisma.shopifyAbandonedCheckout.update({
      where: { id: row.id },
      data: {
        phoneNormalized: next.phoneNormalized,
        cartFingerprint: next.cartFingerprint,
      },
    });
  }
}

function linesFor(row: DedupeRow) {
  return normalizeAbandonedCheckoutLines(row.lineItemsJson);
}

/**
 * Link exact duplicates and soft-hide older proper-subset carts for a company
 * (optionally scoped to one normalized phone).
 */
export async function dedupeAbandonedCheckoutsForCompany(
  companyId: string,
  opts?: { phoneNormalized?: string }
): Promise<void> {
  await ensureFingerprints(companyId, opts?.phoneNormalized);
  const rows = await loadCompanyRows(companyId, opts?.phoneNormalized);

  const byPhone = new Map<string, DedupeRow[]>();
  for (const row of rows) {
    if (!row.phoneNormalized) continue;
    const list = byPhone.get(row.phoneNormalized) ?? [];
    list.push(row);
    byPhone.set(row.phoneNormalized, list);
  }

  for (const phoneRows of byPhone.values()) {
    // Exact-duplicate groups among currently non-superseded rows first.
    const active = phoneRows.filter((r) => !r.supersededByCheckoutId);
    const byFingerprint = new Map<string, DedupeRow[]>();
    for (const row of active) {
      if (!row.cartFingerprint) continue;
      const list = byFingerprint.get(row.cartFingerprint) ?? [];
      list.push(row);
      byFingerprint.set(row.cartFingerprint, list);
    }

    for (const peers of byFingerprint.values()) {
      if (peers.length < 2) {
        // Single row: clear stale group id if it was left alone.
        const only = peers[0];
        if (only?.exactDuplicateGroupId) {
          // Keep group id if other superseded peers still share it — skip cleanup for simplicity.
        }
        continue;
      }

      const existingGroup =
        peers.map((p) => p.exactDuplicateGroupId).find((id) => Boolean(id)) ?? createGroupId();

      for (const peer of peers) {
        if (peer.exactDuplicateGroupId === existingGroup) continue;
        await prisma.shopifyAbandonedCheckout.update({
          where: { id: peer.id },
          data: { exactDuplicateGroupId: existingGroup },
        });
        peer.exactDuplicateGroupId = existingGroup;
      }
    }

    // Refresh active list after group assignment for supersession (still use original chronological order).
    const chronological = [...phoneRows].sort(
      (a, b) => a.abandonedAt.getTime() - b.abandonedAt.getTime()
    );

    for (let i = 0; i < chronological.length; i++) {
      const older = chronological[i]!;
      if (older.supersededByCheckoutId) continue;
      const olderLines = linesFor(older);
      if (olderLines.length === 0) continue;

      let winner: DedupeRow | null = null;
      for (let j = i + 1; j < chronological.length; j++) {
        const newer = chronological[j]!;
        if (newer.supersededByCheckoutId) continue;
        // Exact duplicates link; do not supersede.
        if (
          older.cartFingerprint &&
          newer.cartFingerprint &&
          older.cartFingerprint === newer.cartFingerprint
        ) {
          continue;
        }
        if (isProperCartSubset(olderLines, linesFor(newer))) {
          winner = newer;
        }
      }

      if (winner) {
        await prisma.shopifyAbandonedCheckout.update({
          where: { id: older.id },
          data: {
            supersededByCheckoutId: winner.id,
            supersededAt: new Date(),
          },
        });
        older.supersededByCheckoutId = winner.id;
      }
    }
  }
}

export async function backfillAbandonedCheckoutDedupe(companyId: string): Promise<{
  processed: number;
}> {
  const count = await prisma.shopifyAbandonedCheckout.count({ where: { companyId } });
  await dedupeAbandonedCheckoutsForCompany(companyId);
  return { processed: count };
}

/** Persist fingerprint fields on a single row id after upsert. */
export async function refreshCheckoutDedupeFields(input: {
  id: string;
  companyId: string;
  customerPhone: string | null | undefined;
  lineItemsJson: unknown;
}): Promise<void> {
  const fields = recomputeCheckoutCartFields({
    customerPhone: input.customerPhone,
    lineItemsJson: input.lineItemsJson,
  });
  await prisma.shopifyAbandonedCheckout.update({
    where: { id: input.id },
    data: {
      phoneNormalized: fields.phoneNormalized,
      cartFingerprint: fields.cartFingerprint,
    },
  });
  if (fields.phoneNormalized) {
    await dedupeAbandonedCheckoutsForCompany(input.companyId, {
      phoneNormalized: fields.phoneNormalized,
    });
  }
}
