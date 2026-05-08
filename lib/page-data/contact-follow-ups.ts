import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type ContactFollowUpItem = {
  id: string;
  name: string;
  email: string | null;
  phoneNumber: string | null;
  lastPurchaseAt: string | null;
  recentMerchant: string | null;
  lastContactedAt: string | null;
};

type FetchContactFollowUpsInput = {
  companyId: string;
  merchantName?: string | null;
  merchantEmail?: string | null;
  includeRecentlyContacted?: boolean;
  limit?: number;
};

export async function fetchContactFollowUps(input: FetchContactFollowUpsInput) {
  const safeLimit = Math.max(1, Math.min(input.limit ?? 30, 100));
  const merchantKeys = [input.merchantName, input.merchantEmail]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  try {
    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        email: string | null;
        phoneNumber: string | null;
        lastPurchaseAt: Date | null;
        recentMerchant: string | null;
        lastContactedAt: Date | null;
      }>
    >(
      Prisma.sql`
        WITH latest_contacted AS (
          SELECT "entityId", MAX("createdAt") AS "lastContactedAt"
          FROM "AuditLog"
          WHERE "companyId" = ${input.companyId}
            AND "module" = 'contacts'
            AND "action" = 'contact_follow_up_contacted'
          GROUP BY "entityId"
        )
        SELECT
          c."id",
          c."name",
          c."email",
          c."phoneNumber",
          c."lastPurchaseAt",
          c."recentMerchant",
          lc."lastContactedAt"
        FROM "ContactMaster" c
        LEFT JOIN latest_contacted lc ON lc."entityId" = c."id"
        WHERE c."companyId" = ${input.companyId}
          AND (c."lastPurchaseAt" IS NULL OR c."lastPurchaseAt" < NOW() - INTERVAL '60 days')
          AND (
            ${merchantKeys.length === 0}::boolean
            OR c."recentMerchant" IN (${Prisma.join(merchantKeys.length ? merchantKeys : ["__none__"])})
          )
          AND (
            ${Boolean(input.includeRecentlyContacted)}::boolean
            OR lc."lastContactedAt" IS NULL
            OR lc."lastContactedAt" < NOW() - INTERVAL '60 days'
          )
        ORDER BY c."lastPurchaseAt" ASC NULLS FIRST, c."updatedAt" DESC
        LIMIT ${safeLimit}
      `
    );

    return rows.map((row) => ({
      ...row,
      lastPurchaseAt: row.lastPurchaseAt?.toISOString() ?? null,
      lastContactedAt: row.lastContactedAt?.toISOString() ?? null,
    })) satisfies ContactFollowUpItem[];
  } catch (error) {
    console.error("Failed to fetch contact follow-up queue:", error);
    return [] satisfies ContactFollowUpItem[];
  }
}
