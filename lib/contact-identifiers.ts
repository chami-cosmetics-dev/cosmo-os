import { buildPhoneLookupVariants } from "@/lib/phone-lookup";
import { prisma } from "@/lib/prisma";
import { LIMITS } from "@/lib/validation";

type ContactIdentifierDb = typeof prisma;

type ContactIdentifierContact = {
  id: string;
  name: string;
  email: string | null;
  phoneNumber: string | null;
  recentMerchant: string | null;
  lastPurchaseAt: Date | null;
};

type ContactEmailModel = {
  findMany: (args: unknown) => Promise<Array<{ contact: ContactIdentifierContact; email: string }>>;
  findFirst: (args: unknown) => Promise<{ id: string } | null>;
  create: (args: unknown) => Promise<unknown>;
};

type ContactPhoneModel = {
  findMany: (args: unknown) => Promise<Array<{ contact: ContactIdentifierContact; phoneNumber: string }>>;
  findFirst: (args: unknown) => Promise<{ id: string } | null>;
  create: (args: unknown) => Promise<unknown>;
};

function getContactEmailModel(db: ContactIdentifierDb = prisma): ContactEmailModel | null {
  const model = (db as unknown as { contactEmail?: ContactEmailModel }).contactEmail;
  return model ?? null;
}

function getContactPhoneModel(db: ContactIdentifierDb = prisma): ContactPhoneModel | null {
  const model = (db as unknown as { contactPhone?: ContactPhoneModel }).contactPhone;
  return model ?? null;
}

export function supportsSecondaryContactIdentifiers() {
  return !!getContactEmailModel() && !!getContactPhoneModel();
}

export function normalizeContactEmail(value: string | null | undefined) {
  const trimmed = value?.trim().toLowerCase() ?? "";
  return trimmed ? trimmed.slice(0, LIMITS.email.max) : null;
}

export function normalizeContactPhone(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed.slice(0, LIMITS.mobile.max) : null;
}

export async function findMatchingContacts(
  companyId: string,
  email: string | null,
  phoneNumber: string | null,
  db: ContactIdentifierDb = prisma
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
    },
  });

  const emailAliasModel = getContactEmailModel(db);
  const phoneAliasModel = getContactPhoneModel(db);

  const emailAliasMatches = email && emailAliasModel
    ? await emailAliasModel.findMany({
        where: {
          email: { equals: email, mode: "insensitive" },
          contact: { is: { companyId } },
        },
        select: {
          email: true,
          contact: {
            select: {
              id: true,
              name: true,
              email: true,
              phoneNumber: true,
              recentMerchant: true,
              lastPurchaseAt: true,
            },
          },
        },
      })
    : [];

  const phoneAliasMatches = phoneVariants.length > 0 && phoneAliasModel
    ? await phoneAliasModel.findMany({
        where: {
          phoneNumber: { in: phoneVariants },
          contact: { is: { companyId } },
        },
        select: {
          phoneNumber: true,
          contact: {
            select: {
              id: true,
              name: true,
              email: true,
              phoneNumber: true,
              recentMerchant: true,
              lastPurchaseAt: true,
            },
          },
        },
      })
    : [];

  const candidateMap = new Map<string, ContactIdentifierContact>();
  for (const contact of primaryCandidates) {
    candidateMap.set(contact.id, contact);
  }
  for (const match of emailAliasMatches) {
    candidateMap.set(match.contact.id, match.contact);
  }
  for (const match of phoneAliasMatches) {
    candidateMap.set(match.contact.id, match.contact);
  }

  const emailAliasIds = new Set(emailAliasMatches.map((match) => match.contact.id));
  const phoneAliasIds = new Set(phoneAliasMatches.map((match) => match.contact.id));

  const candidates = [...candidateMap.values()];
  const emailMatches = email
    ? candidates.filter(
        (contact) =>
          contact.email?.trim().toLowerCase() === email || emailAliasIds.has(contact.id)
      )
    : [];
  const phoneMatches = phoneVariants.length > 0
    ? candidates.filter((contact) => {
        const existingPhone = contact.phoneNumber?.trim();
        return (existingPhone ? phoneVariants.includes(existingPhone) : false) || phoneAliasIds.has(contact.id);
      })
    : [];

  return { candidates, emailMatches, phoneMatches, phoneVariants };
}

export async function listContactEmails(contactId: string, primaryEmail?: string | null) {
  const values = new Set<string>();
  const normalizedPrimary = normalizeContactEmail(primaryEmail);
  if (normalizedPrimary) values.add(normalizedPrimary);

  const model = getContactEmailModel();
  if (!model) {
    return [...values];
  }

  const rows = await model.findMany({
    where: { contactId },
    select: { email: true, contact: { select: { id: true, name: true, email: true, phoneNumber: true, recentMerchant: true, lastPurchaseAt: true } } },
  });

  for (const row of rows) {
    const normalized = normalizeContactEmail(row.email);
    if (normalized && normalized !== normalizedPrimary) values.add(normalized);
  }

  return [...values];
}

export async function listContactPhones(contactId: string, primaryPhone?: string | null) {
  const values = new Set<string>();
  const normalizedPrimary = normalizeContactPhone(primaryPhone);
  const primaryVariants = normalizedPrimary ? buildPhoneLookupVariants(normalizedPrimary) : [];
  if (normalizedPrimary) {
    for (const variant of primaryVariants) {
      values.add(variant);
    }
  }

  const model = getContactPhoneModel();
  if (!model) {
    return [...values];
  }

  const rows = await model.findMany({
    where: { contactId },
    select: { phoneNumber: true, contact: { select: { id: true, name: true, email: true, phoneNumber: true, recentMerchant: true, lastPurchaseAt: true } } },
  });

  for (const row of rows) {
    const normalized = normalizeContactPhone(row.phoneNumber);
    if (!normalized) continue;
    const variants = buildPhoneLookupVariants(normalized);
    if (primaryVariants.some((variant) => variants.includes(variant))) continue;
    for (const variant of variants) {
      values.add(variant);
    }
  }

  return [...values];
}

export async function ensureSecondaryContactIdentifiers(input: {
  contactId: string;
  primaryEmail?: string | null;
  primaryPhoneNumber?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
}, db: ContactIdentifierDb = prisma) {
  const email = normalizeContactEmail(input.email);
  const phoneNumber = normalizeContactPhone(input.phoneNumber);
  const primaryEmail = normalizeContactEmail(input.primaryEmail);
  const primaryPhoneNumber = normalizeContactPhone(input.primaryPhoneNumber);

  const emailModel = getContactEmailModel(db);
  if (email && emailModel && email !== primaryEmail) {
    const exists = await emailModel.findFirst({
      where: {
        contactId: input.contactId,
        email: { equals: email, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (!exists) {
      await emailModel.create({
        data: {
          contactId: input.contactId,
          email,
          isPrimary: false,
        },
      });
    }
  }

  const phoneModel = getContactPhoneModel(db);
  const primaryPhoneVariants = primaryPhoneNumber ? buildPhoneLookupVariants(primaryPhoneNumber) : [];
  const phoneVariants = phoneNumber ? buildPhoneLookupVariants(phoneNumber) : [];
  const matchesPrimaryPhone = phoneVariants.some((variant) => primaryPhoneVariants.includes(variant));
  if (phoneNumber && phoneModel && !matchesPrimaryPhone) {
    const exists = await phoneModel.findFirst({
      where: {
        contactId: input.contactId,
        OR: phoneVariants.map((variant) => ({ phoneNumber: variant })),
      },
      select: { id: true },
    });
    if (!exists) {
      await phoneModel.create({
        data: {
          contactId: input.contactId,
          phoneNumber,
          isPrimary: false,
        },
      });
    }
  }
}
