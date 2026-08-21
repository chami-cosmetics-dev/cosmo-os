/**
 * Full-scan helpers for Insight purchase filters.
 * Soft `take` caps biased recent rows and dropped older buyers — page everything.
 */

import { prisma } from "@/lib/prisma";

export const INSIGHT_SCAN_PAGE = 1_000;
export const INSIGHT_LOOKUP_CHUNK = 500;
export const INSIGHT_CONTACT_PAGE = 500;

export function chunkArray<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Walk every page of an id-ordered query until exhausted.
 * `fetchPage` must use `orderBy: { id: "asc" }` and honor cursor/skip.
 */
export async function forEachIdPage<T extends { id: string }>(
  fetchPage: (args: {
    take: number;
    cursor?: string;
  }) => Promise<T[]>,
  onPage: (page: T[]) => void | Promise<void>,
  pageSize = INSIGHT_SCAN_PAGE
): Promise<void> {
  let cursor: string | undefined;
  for (;;) {
    const page = await fetchPage({ take: pageSize, cursor });
    if (page.length === 0) break;
    await onPage(page);
    if (page.length < pageSize) break;
    cursor = page[page.length - 1]!.id;
  }
}

export async function collectAllIdPages<T extends { id: string }>(
  fetchPage: (args: {
    take: number;
    cursor?: string;
  }) => Promise<T[]>,
  pageSize = INSIGHT_SCAN_PAGE
): Promise<T[]> {
  const out: T[] = [];
  await forEachIdPage(fetchPage, (page) => {
    out.push(...page);
  }, pageSize);
  return out;
}

export type PurchaseContactRow = {
  id: string;
  phoneNumber: string | null;
  email: string | null;
  phones: Array<{ phoneNumber: string }>;
  emails: Array<{ email: string }>;
};

/**
 * Load every contact matching phone variants and/or emails (chunked + paged).
 * No hard contact cap — required for accurate order attribution.
 */
export async function findAllContactsForPurchaseLookup(input: {
  companyId: string;
  phoneVariants: string[];
  emails: string[];
}): Promise<PurchaseContactRow[]> {
  const byId = new Map<string, PurchaseContactRow>();
  const select = {
    id: true,
    phoneNumber: true,
    email: true,
    phones: { select: { phoneNumber: true } },
    emails: { select: { email: true } },
  } as const;

  const loadWhere = async (whereExtra: Record<string, unknown>) => {
    let cursor: string | undefined;
    for (;;) {
      const page = await prisma.contactMaster.findMany({
        where: { companyId: input.companyId, ...whereExtra },
        select,
        orderBy: { id: "asc" },
        take: INSIGHT_CONTACT_PAGE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (page.length === 0) break;
      for (const row of page) byId.set(row.id, row);
      if (page.length < INSIGHT_CONTACT_PAGE) break;
      cursor = page[page.length - 1]!.id;
    }
  };

  for (const phones of chunkArray(input.phoneVariants, INSIGHT_LOOKUP_CHUNK)) {
    if (phones.length === 0) continue;
    await loadWhere({
      OR: [
        { phoneNumber: { in: phones } },
        { phones: { some: { phoneNumber: { in: phones } } } },
      ],
    });
  }

  for (const emails of chunkArray(input.emails, INSIGHT_LOOKUP_CHUNK)) {
    if (emails.length === 0) continue;
    await loadWhere({
      OR: [
        { email: { in: emails, mode: "insensitive" } },
        { emails: { some: { email: { in: emails, mode: "insensitive" } } } },
      ],
    });
  }

  return [...byId.values()];
}
