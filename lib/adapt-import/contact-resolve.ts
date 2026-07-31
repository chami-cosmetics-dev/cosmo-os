import type { AdaptImportDb } from "@/lib/adapt-import/db";
import { buildPhoneLookupVariants } from "@/lib/phone-lookup";
import { LIMITS } from "@/lib/validation";

export function normalizeAdaptEmail(value: string | null | undefined) {
  const trimmed = value?.trim().toLowerCase() ?? "";
  return trimmed ? trimmed.slice(0, LIMITS.email.max) : null;
}

export function normalizeAdaptPhone(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed.slice(0, LIMITS.mobile.max) : null;
}

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

async function findAdaptContactCandidates(
  db: AdaptImportDb,
  companyId: string,
  email: string | null,
  phoneNumber: string | null
) {
  const phoneVariants = phoneNumber ? buildPhoneLookupVariants(phoneNumber) : [];

  const primaryCandidates = await db.contactMaster.findMany({
    where: {
      companyId,
      OR: [
        ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []),
        ...(phoneVariants.length > 0 ? [{ phoneNumber: { in: phoneVariants } }] : []),
      ],
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

  const emailAliasMatches = email
    ? await db.contactEmail.findMany({
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
      })
    : [];

  const phoneAliasMatches =
    phoneVariants.length > 0
      ? await db.contactPhone.findMany({
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
        })
      : [];

  const candidateMap = new Map<string, ContactCandidate>();
  for (const contact of primaryCandidates) {
    candidateMap.set(contact.id, contact);
  }
  for (const match of emailAliasMatches) {
    candidateMap.set(match.contact.id, match.contact);
  }
  for (const match of phoneAliasMatches) {
    candidateMap.set(match.contact.id, match.contact);
  }

  return [...candidateMap.values()];
}

/** Resolve ContactMaster for Adapt phone/email; multi-match → one best + ambiguous. */
export async function resolveAdaptContact(input: {
  companyId: string;
  phone: string | null;
  email: string | null;
  db: AdaptImportDb;
}): Promise<ResolveAdaptContactResult> {
  const email = normalizeAdaptEmail(input.email);
  const phone = normalizeAdaptPhone(input.phone);
  if (!email && !phone) return { status: "none" };

  const candidates = await findAdaptContactCandidates(
    input.db,
    input.companyId,
    email,
    phone
  );
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
