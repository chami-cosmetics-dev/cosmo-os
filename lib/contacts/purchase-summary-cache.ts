import { Prisma } from "@prisma/client";

import {
  loadPurchaseSummaryIndexes,
  purchaseSummaryForContact,
} from "@/lib/contacts/purchase-summary-export";
import { prisma } from "@/lib/prisma";

const CONTACT_READ_BATCH = 2_000;
const CONTACT_WRITE_CHUNK = 200;

export type PurchaseSummarySyncStatus = {
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  contactCount: number;
};

export type RefreshPurchaseSummaryResult = {
  companyId: string;
  contactCount: number;
  syncedAt: string;
};

function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function writePurchaseSummaryChunk(
  companyId: string,
  rows: Array<{
    id: string;
    orderCount: number;
    totalSpent: number;
    lastOrderAt: Date | null;
  }>
) {
  if (rows.length === 0) return;

  const values = rows.map(
    (row) => Prisma.sql`(
      ${row.id},
      ${row.orderCount}::int,
      ${row.totalSpent}::numeric,
      ${row.lastOrderAt}::timestamptz
    )`
  );

  await prisma.$executeRaw`
    UPDATE "ContactMaster" AS c
    SET
      "purchaseOrderCount" = v.order_count,
      "purchaseTotalValue" = v.total_spent,
      "purchaseLastOrderAt" = v.last_order_at
    FROM (VALUES ${Prisma.join(values)}) AS v(id, order_count, total_spent, last_order_at)
    WHERE c.id = v.id
      AND c."companyId" = ${companyId}
  `;
}

export async function getPurchaseSummarySyncStatus(
  companyId: string
): Promise<PurchaseSummarySyncStatus> {
  const row = await prisma.companyContactPurchaseSummarySync.findUnique({
    where: { companyId },
    select: {
      lastSyncedAt: true,
      lastSyncError: true,
      contactCount: true,
    },
  });
  return {
    lastSyncedAt: row?.lastSyncedAt?.toISOString() ?? null,
    lastSyncError: row?.lastSyncError ?? null,
    contactCount: row?.contactCount ?? 0,
  };
}

/**
 * Rebuild ContactMaster purchase* cache from Cosmo orders + Adapt history.
 * Heavy: run via cron / admin refresh, not during CSV export.
 */
export async function refreshCompanyPurchaseSummaries(
  companyId: string
): Promise<RefreshPurchaseSummaryResult> {
  const syncedAt = new Date();
  try {
    const indexes = await loadPurchaseSummaryIndexes(companyId);

    let contactCount = 0;
    let cursor: string | undefined;

    for (;;) {
      const contacts = await prisma.contactMaster.findMany({
        where: { companyId },
        take: CONTACT_READ_BATCH,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: "asc" },
        select: {
          id: true,
          phoneNumber: true,
          email: true,
          emails: { select: { email: true } },
          phones: { select: { phoneNumber: true } },
        },
      });
      if (contacts.length === 0) break;

      const rows = contacts.map((contact) => {
        const summary = purchaseSummaryForContact(indexes, {
          contactId: contact.id,
          phoneNumber: contact.phoneNumber,
          email: contact.email,
          aliasPhones: contact.phones.map((p) => p.phoneNumber),
          aliasEmails: contact.emails.map((e) => e.email),
        });
        return {
          id: contact.id,
          orderCount: summary?.orderCount ?? 0,
          totalSpent: summary?.totalSpent ?? 0,
          lastOrderAt: summary?.lastOrderAt ?? null,
        };
      });

      for (const chunk of chunkArray(rows, CONTACT_WRITE_CHUNK)) {
        await writePurchaseSummaryChunk(companyId, chunk);
      }

      contactCount += contacts.length;
      cursor = contacts[contacts.length - 1]!.id;
      if (contacts.length < CONTACT_READ_BATCH) break;
    }

    await prisma.companyContactPurchaseSummarySync.upsert({
      where: { companyId },
      create: {
        companyId,
        lastSyncedAt: syncedAt,
        lastSyncError: null,
        contactCount,
      },
      update: {
        lastSyncedAt: syncedAt,
        lastSyncError: null,
        contactCount,
      },
    });

    return {
      companyId,
      contactCount,
      syncedAt: syncedAt.toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Purchase summary refresh failed";
    await prisma.companyContactPurchaseSummarySync.upsert({
      where: { companyId },
      create: {
        companyId,
        lastSyncedAt: null,
        lastSyncError: message.slice(0, 500),
        contactCount: 0,
      },
      update: {
        lastSyncError: message.slice(0, 500),
      },
    });
    throw error;
  }
}

export async function refreshAllCompaniesPurchaseSummaries() {
  const companies = await prisma.company.findMany({
    select: { id: true },
    orderBy: { id: "asc" },
  });

  const results: RefreshPurchaseSummaryResult[] = [];
  const errors: Array<{ companyId: string; error: string }> = [];

  for (const company of companies) {
    try {
      results.push(await refreshCompanyPurchaseSummaries(company.id));
    } catch (error) {
      errors.push({
        companyId: company.id,
        error: error instanceof Error ? error.message : "refresh failed",
      });
    }
  }

  return {
    companyCount: companies.length,
    refreshed: results.length,
    results,
    errors,
  };
}
