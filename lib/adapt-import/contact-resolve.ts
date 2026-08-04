import type { AdaptImportDb } from "@/lib/adapt-import/db";
import {
  adaptEmailForContactUse,
  normalizeAdaptEmail,
  normalizeAdaptPhone,
} from "@/lib/adapt-import/shared-emails";
import { buildPhoneLookupVariants } from "@/lib/phone-lookup";

export {
  adaptEmailForContactUse,
  isSharedMerchantEmail,
  normalizeAdaptEmail,
  normalizeAdaptPhone,
} from "@/lib/adapt-import/shared-emails";

type ContactCandidate = {
  id: string;
  name: string;
  email: string | null;
  phoneNumber: string | null;
  recentMerchant: string | null;
  lastPurchaseAt: Date | null;
  source: string | null;
  updatedAt: Date;
};

function pickBetterContact<T extends { lastPurchaseAt: Date | null; updatedAt?: Date; id: string }>(
  current: T,
  candidate: T
): T {
  if (!current.lastPurchaseAt && candidate.lastPurchaseAt) return candidate;
  if (
    current.lastPurchaseAt &&
    candidate.lastPurchaseAt &&
    candidate.lastPurchaseAt > current.lastPurchaseAt
  ) {
    return candidate;
  }
  const curUpdated = current.updatedAt?.getTime() ?? 0;
  const candUpdated = candidate.updatedAt?.getTime() ?? 0;
  if (candUpdated > curUpdated) return candidate;
  return current;
}

export type ResolveAdaptContactResult =
  | { status: "none" }
  | { status: "match"; contact: ContactCandidate; ambiguous: boolean; matchCount: number };

async function findByPhone(db: AdaptImportDb, companyId: string, phoneNumber: string) {
  const phoneVariants = buildPhoneLookupVariants(phoneNumber);

  const primaryCandidates = await db.contactMaster.findMany({
    where: {
      companyId,
      phoneNumber: { in: phoneVariants },
    },
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      recentMerchant: true,
      lastPurchaseAt: true,
      source: true,
      updatedAt: true,
    },
  });

  const phoneAliasMatches = await db.contactPhone.findMany({
    where: {
      phoneNumber: { in: phoneVariants },
      contact: { is: { companyId } },
    },
    select: {
      contact: {
        select: {
          id: true,
          name: true,
          email: true,
          phoneNumber: true,
          recentMerchant: true,
          lastPurchaseAt: true,
          source: true,
          updatedAt: true,
        },
      },
    },
  });

  const candidateMap = new Map<string, ContactCandidate>();
  for (const contact of primaryCandidates) {
    candidateMap.set(contact.id, contact);
  }
  for (const match of phoneAliasMatches) {
    candidateMap.set(match.contact.id, match.contact);
  }
  return [...candidateMap.values()];
}

async function findByEmail(db: AdaptImportDb, companyId: string, email: string) {
  const primaryCandidates = await db.contactMaster.findMany({
    where: {
      companyId,
      email: { equals: email, mode: "insensitive" as const },
    },
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      recentMerchant: true,
      lastPurchaseAt: true,
      source: true,
      updatedAt: true,
    },
  });

  const emailAliasMatches = await db.contactEmail.findMany({
    where: {
      email: { equals: email, mode: "insensitive" },
      contact: { is: { companyId } },
    },
    select: {
      contact: {
        select: {
          id: true,
          name: true,
          email: true,
          phoneNumber: true,
          recentMerchant: true,
          lastPurchaseAt: true,
          source: true,
          updatedAt: true,
        },
      },
    },
  });

  const candidateMap = new Map<string, ContactCandidate>();
  for (const contact of primaryCandidates) {
    candidateMap.set(contact.id, contact);
  }
  for (const match of emailAliasMatches) {
    candidateMap.set(match.contact.id, match.contact);
  }
  return [...candidateMap.values()];
}

/**
 * Resolve ContactMaster for Adapt row.
 * Phone-first: if phone present, match ONLY by phone (ignore email — merchants reuse emails).
 * Email fallback only when no phone; shared merchant emails never match.
 */
export async function resolveAdaptContact(input: {
  companyId: string;
  phone: string | null;
  email: string | null;
  db: AdaptImportDb;
}): Promise<ResolveAdaptContactResult> {
  const phone = normalizeAdaptPhone(input.phone);
  const email = adaptEmailForContactUse(input.email);

  if (!phone && !email) return { status: "none" };

  const candidates = phone
    ? await findByPhone(input.db, input.companyId, phone)
    : await findByEmail(input.db, input.companyId, email!);

  if (candidates.length === 0) return { status: "none" };

  let best = candidates[0]!;
  for (let i = 1; i < candidates.length; i += 1) {
    best = pickBetterContact(best, candidates[i]!);
  }

  return {
    status: "match",
    contact: best,
    ambiguous: candidates.length > 1,
    matchCount: candidates.length,
  };
}

export { pickBetterContact };
