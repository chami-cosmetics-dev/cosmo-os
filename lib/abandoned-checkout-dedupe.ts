import { randomBytes } from "crypto";

import { normalizeAdaptEmail } from "@/lib/adapt-import/shared-emails";
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
  customerEmail: string | null;
  cartFingerprint: string | null;
  exactDuplicateGroupId: string | null;
  supersededByCheckoutId: string | null;
  lineItemsJson: unknown;
};

/** Phone cohort, else email cohort (covers checkouts missing phone). */
function cohortKey(row: Pick<DedupeRow, "phoneNormalized" | "customerEmail">): string | null {
  if (row.phoneNormalized) return `p:${row.phoneNormalized}`;
  const email = normalizeAdaptEmail(row.customerEmail);
  if (email) return `e:${email}`;
  return null;
}

async function loadCompanyRows(
  companyId: string,
  opts?: { phoneNormalized?: string; customerEmail?: string }
): Promise<DedupeRow[]> {
  const email = normalizeAdaptEmail(opts?.customerEmail);
  return prisma.shopifyAbandonedCheckout.findMany({
    where: {
      companyId,
      ...(opts?.phoneNormalized
        ? { phoneNormalized: opts.phoneNormalized }
        : email
          ? { customerEmail: { equals: email, mode: "insensitive" } }
          : {}),
    },
    select: {
      id: true,
      abandonedAt: true,
      phoneNormalized: true,
      customerEmail: true,
      cartFingerprint: true,
      exactDuplicateGroupId: true,
      supersededByCheckoutId: true,
      lineItemsJson: true,
    },
    orderBy: { abandonedAt: "asc" },
  });
}

async function ensureFingerprints(
  companyId: string,
  opts?: { phoneNormalized?: string; customerEmail?: string }
) {
  const email = normalizeAdaptEmail(opts?.customerEmail);
  const stale = await prisma.shopifyAbandonedCheckout.findMany({
    where: {
      companyId,
      cartFingerprint: null,
      ...(opts?.phoneNormalized
        ? { phoneNormalized: opts.phoneNormalized }
        : email
          ? { customerEmail: { equals: email, mode: "insensitive" } }
          : {}),
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
 * Link exact duplicates (hide older copies — keep newest only),
 * and soft-hide older proper-subset carts.
 */
export async function dedupeAbandonedCheckoutsForCompany(
  companyId: string,
  opts?: { phoneNormalized?: string; customerEmail?: string }
): Promise<void> {
  await ensureFingerprints(companyId, opts);
  const rows = await loadCompanyRows(companyId, opts);

  const byCohort = new Map<string, DedupeRow[]>();
  for (const row of rows) {
    const key = cohortKey(row);
    if (!key) continue;
    const list = byCohort.get(key) ?? [];
    list.push(row);
    byCohort.set(key, list);
  }

  for (const cohortRows of byCohort.values()) {
    // Exact-duplicate groups: include already-superseded so a newer twin re-links them.
    const byFingerprint = new Map<string, DedupeRow[]>();
    for (const row of cohortRows) {
      if (!row.cartFingerprint) continue;
      const list = byFingerprint.get(row.cartFingerprint) ?? [];
      list.push(row);
      byFingerprint.set(row.cartFingerprint, list);
    }

    for (const peers of byFingerprint.values()) {
      if (peers.length < 2) continue;

      const existingGroup =
        peers.map((p) => p.exactDuplicateGroupId).find((id) => Boolean(id)) ?? createGroupId();

      const sortedNewestFirst = [...peers].sort(
        (a, b) => b.abandonedAt.getTime() - a.abandonedAt.getTime()
      );
      const keeper = sortedNewestFirst[0]!;

      for (const peer of peers) {
        const shouldSupersede = peer.id !== keeper.id;
        const nextSupersededBy = shouldSupersede ? keeper.id : null;
        const nextSupersededAt = shouldSupersede ? new Date() : null;
        const needsUpdate =
          peer.exactDuplicateGroupId !== existingGroup ||
          peer.supersededByCheckoutId !== nextSupersededBy ||
          (shouldSupersede && !peer.supersededByCheckoutId) ||
          (!shouldSupersede && peer.supersededByCheckoutId);

        if (!needsUpdate) {
          peer.exactDuplicateGroupId = existingGroup;
          continue;
        }

        await prisma.shopifyAbandonedCheckout.update({
          where: { id: peer.id },
          data: {
            exactDuplicateGroupId: existingGroup,
            supersededByCheckoutId: nextSupersededBy,
            supersededAt: nextSupersededAt,
          },
        });
        peer.exactDuplicateGroupId = existingGroup;
        peer.supersededByCheckoutId = nextSupersededBy;
      }
    }

    // Proper-subset supersession among remaining visible rows.
    const chronological = [...cohortRows].sort(
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
        // Exact duplicates already handled above.
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
  customerEmail?: string | null | undefined;
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
  } else if (normalizeAdaptEmail(input.customerEmail)) {
    await dedupeAbandonedCheckoutsForCompany(input.companyId, {
      customerEmail: input.customerEmail ?? undefined,
    });
  }
}
