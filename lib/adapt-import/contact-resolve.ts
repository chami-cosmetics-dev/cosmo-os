import {
  findMatchingContacts,
  normalizeContactEmail,
  normalizeContactPhone,
} from "@/lib/contact-identifiers";
import { prisma } from "@/lib/prisma";

type ContactCandidate = {
  id: string;
  name: string;
  email: string | null;
  phoneNumber: string | null;
  recentMerchant: string | null;
  lastPurchaseAt: Date | null;
  source: string | null;
  updatedAt?: Date;
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

/** Resolve ContactMaster for Adapt phone/email; multi-match → one best + ambiguous. */
export async function resolveAdaptContact(input: {
  companyId: string;
  phone: string | null;
  email: string | null;
  db?: typeof prisma;
}): Promise<ResolveAdaptContactResult> {
  const db = input.db ?? prisma;
  const email = normalizeContactEmail(input.email);
  const phone = normalizeContactPhone(input.phone);
  if (!email && !phone) return { status: "none" };

  const { candidates } = await findMatchingContacts(input.companyId, email, phone, db);
  if (candidates.length === 0) return { status: "none" };

  const withUpdated = await db.contactMaster.findMany({
    where: { id: { in: candidates.map((c) => c.id) } },
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

  let best = withUpdated[0]!;
  for (let i = 1; i < withUpdated.length; i += 1) {
    best = pickBetterContact(best, withUpdated[i]!);
  }

  return {
    status: "match",
    contact: best,
    ambiguous: withUpdated.length > 1,
    matchCount: withUpdated.length,
  };
}

export { pickBetterContact };
