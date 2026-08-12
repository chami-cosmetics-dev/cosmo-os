import { writeAuditLog } from "@/lib/audit-log";
import { normalizeContactEmail } from "@/lib/contact-identifiers";
import { prisma } from "@/lib/prisma";
import { emailSchema } from "@/lib/validation";
import type { ContactEmailCleanupReason } from "@/lib/validation/contact-email-cleanup";

export type SuspectEmailReviewItem = {
  contactId: string;
  name: string;
  phoneNumber: string | null;
  email: string | null;
  matchedEmail: string;
  reason: ContactEmailCleanupReason;
};

type ContactWithEmails = {
  id: string;
  name: string;
  phoneNumber: string | null;
  email: string | null;
  emails: Array<{ id: string; email: string; createdAt: Date }>;
};

export function isInvalidContactEmail(value: string | null | undefined): boolean {
  const normalized = normalizeContactEmail(value);
  if (!normalized) return false;
  return !emailSchema.safeParse(normalized).success;
}

export function matchesCosmeticsPattern(value: string | null | undefined): boolean {
  const normalized = normalizeContactEmail(value);
  if (!normalized) return false;
  return /cosmetic|cosmatics/i.test(normalized);
}

export function emailMatchesReason(
  email: string | null | undefined,
  reason: ContactEmailCleanupReason
): boolean {
  if (reason === "invalid") return isInvalidContactEmail(email);
  return matchesCosmeticsPattern(email);
}

export function collectSuspectMatches(
  contact: ContactWithEmails,
  reason: ContactEmailCleanupReason
): SuspectEmailReviewItem[] {
  const seen = new Set<string>();
  const matches: SuspectEmailReviewItem[] = [];

  const pushMatch = (matchedEmail: string) => {
    const key = matchedEmail.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    matches.push({
      contactId: contact.id,
      name: contact.name,
      phoneNumber: contact.phoneNumber,
      email: contact.email,
      matchedEmail,
      reason,
    });
  };

  const primary = normalizeContactEmail(contact.email);
  if (primary && emailMatchesReason(primary, reason)) {
    pushMatch(primary);
  }

  for (const row of contact.emails) {
    const secondary = normalizeContactEmail(row.email);
    if (!secondary || secondary === primary) continue;
    if (emailMatchesReason(secondary, reason)) {
      pushMatch(secondary);
    }
  }

  return matches;
}

export function buildSuspectReviewItem(
  contact: ContactWithEmails,
  reason: ContactEmailCleanupReason
): SuspectEmailReviewItem | null {
  const matches = collectSuspectMatches(contact, reason);
  return matches[0] ?? null;
}

function paginate<T>(items: T[], page: number, pageSize: number) {
  const total = items.length;
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page,
    pageSize,
    total,
  };
}

export async function listSuspectEmails(input: {
  companyId: string;
  reason: ContactEmailCleanupReason;
  page: number;
  pageSize: number;
}) {
  const contacts = await prisma.contactMaster.findMany({
    where: {
      companyId: input.companyId,
      ...(input.reason === "cosmetics_pattern"
        ? {
            OR: [
              { email: { contains: "cosmetic", mode: "insensitive" as const } },
              {
                emails: {
                  some: { email: { contains: "cosmetic", mode: "insensitive" as const } },
                },
              },
            ],
          }
        : {
            OR: [{ email: { not: null } }, { emails: { some: {} } }],
          }),
    },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      emails: { select: { id: true, email: true, createdAt: true }, orderBy: { createdAt: "asc" } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const items: SuspectEmailReviewItem[] = [];
  for (const contact of contacts) {
    const item = buildSuspectReviewItem(contact, input.reason);
    if (item) items.push(item);
  }

  return paginate(items, input.page, input.pageSize);
}

function emailsToClearForContact(
  contact: ContactWithEmails,
  reason: ContactEmailCleanupReason
): string[] {
  const toClear = new Set<string>();
  const primary = normalizeContactEmail(contact.email);
  if (primary && emailMatchesReason(primary, reason)) {
    toClear.add(primary);
  }
  for (const row of contact.emails) {
    const secondary = normalizeContactEmail(row.email);
    if (secondary && emailMatchesReason(secondary, reason)) {
      toClear.add(secondary);
    }
  }
  return [...toClear];
}

async function promoteOldestValidSecondary(input: {
  contactId: string;
  excluded: Set<string>;
}) {
  const rows = await prisma.contactEmail.findMany({
    where: { contactId: input.contactId },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true },
  });

  const candidate = rows.find((row) => {
    const normalized = normalizeContactEmail(row.email);
    return normalized && !input.excluded.has(normalized) && !isInvalidContactEmail(normalized);
  });

  if (!candidate) return null;

  const promoted = normalizeContactEmail(candidate.email);
  if (!promoted) return null;

  await prisma.$transaction([
    prisma.contactMaster.update({
      where: { id: input.contactId },
      data: { email: promoted },
    }),
    prisma.contactEmail.delete({ where: { id: candidate.id } }),
  ]);

  return promoted;
}

export async function clearSuspectEmails(input: {
  companyId: string;
  actorUserId: string;
  reason: ContactEmailCleanupReason;
  contactIds: string[];
}) {
  let cleared = 0;
  const skipped: Array<{ contactId: string; error: string }> = [];

  for (const contactId of input.contactIds) {
    const contact = await prisma.contactMaster.findFirst({
      where: { id: contactId, companyId: input.companyId },
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        email: true,
        emails: { select: { id: true, email: true, createdAt: true }, orderBy: { createdAt: "asc" } },
      },
    });

    if (!contact) {
      skipped.push({ contactId, error: "contact not found" });
      continue;
    }

    const removeEmails = emailsToClearForContact(contact, input.reason);
    if (removeEmails.length === 0) {
      skipped.push({ contactId, error: "no longer matches reason" });
      continue;
    }

    const removeSet = new Set(removeEmails);
    const previousPrimary = normalizeContactEmail(contact.email);
    const primaryCleared = previousPrimary != null && removeSet.has(previousPrimary);

    const secondaryIdsToDelete = contact.emails
      .filter((row) => {
        const normalized = normalizeContactEmail(row.email);
        return normalized != null && removeSet.has(normalized);
      })
      .map((row) => row.id);

    await prisma.$transaction(async (tx) => {
      if (primaryCleared) {
        await tx.contactMaster.update({
          where: { id: contact.id },
          data: { email: null },
        });
      }

      if (secondaryIdsToDelete.length > 0) {
        await tx.contactEmail.deleteMany({
          where: { id: { in: secondaryIdsToDelete } },
        });
      }
    });

    let promotedPrimary: string | null = null;
    if (primaryCleared) {
      promotedPrimary = await promoteOldestValidSecondary({
        contactId: contact.id,
        excluded: removeSet,
      });
    }

    await writeAuditLog({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      module: "contacts",
      action: "contact_email_cleared",
      entityType: "ContactMaster",
      entityId: contact.id,
      summary: `Cleared ${removeEmails.length} email(s) from contact ${contact.name}`,
      beforeData: {
        primaryEmail: previousPrimary,
        removedEmails: removeEmails,
      },
      afterData: {
        primaryEmail: promotedPrimary ?? (primaryCleared ? null : previousPrimary),
      },
      metadata: {
        contactId: contact.id,
        reason: input.reason,
        removedEmails: removeEmails,
        promotedPrimary,
      },
    });

    cleared += 1;
  }

  return { cleared, skipped };
}
