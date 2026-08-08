import {
  ensureSecondaryContactIdentifiers,
  normalizeContactEmail,
  normalizeContactPhone,
} from "@/lib/contact-identifiers";
import { buildPhoneLookupVariants } from "@/lib/phone-lookup";
import { prisma } from "@/lib/prisma";

export type ProfilePatchInput = {
  name?: string;
  email?: string | null;
  /** New primary phone; previous primary is kept as secondary for history/search. */
  addPhoneNumber?: string;
  birthYear?: number | null;
  birthMonth?: number | null;
  birthDay?: number | null;
};

export async function updateContactInsightProfile(input: {
  companyId: string;
  contactId: string;
  patch: ProfilePatchInput;
}) {
  const existing = await prisma.contactMaster.findFirst({
    where: { id: input.contactId, companyId: input.companyId },
    select: {
      id: true,
      email: true,
      phoneNumber: true,
      phones: { select: { phoneNumber: true } },
    },
  });
  if (!existing) return null;

  const data: {
    name?: string;
    email?: string | null;
    phoneNumber?: string | null;
    birthYear?: number | null;
    birthMonth?: number | null;
    birthDay?: number | null;
  } = {};

  const previousPhone = existing.phoneNumber;
  const previousEmail = existing.email;

  if (input.patch.name !== undefined) data.name = input.patch.name;
  if (input.patch.email !== undefined) {
    data.email = input.patch.email === null ? null : normalizeContactEmail(input.patch.email);
  }
  if (input.patch.birthYear !== undefined) data.birthYear = input.patch.birthYear;
  if (input.patch.birthMonth !== undefined) data.birthMonth = input.patch.birthMonth;
  if (input.patch.birthDay !== undefined) data.birthDay = input.patch.birthDay;

  let phoneToPromote: string | null = null;
  if (input.patch.addPhoneNumber !== undefined) {
    const nextPhone = normalizeContactPhone(input.patch.addPhoneNumber);
    if (!nextPhone) {
      throw new Error("Phone number is required");
    }
    const nextVariants = new Set(buildPhoneLookupVariants(nextPhone));
    const alreadyPrimary =
      previousPhone != null &&
      buildPhoneLookupVariants(previousPhone).some((v) => nextVariants.has(v));
    if (!alreadyPrimary) {
      phoneToPromote = nextPhone;
      data.phoneNumber = nextPhone;
    }
  }

  const updated = await prisma.contactMaster.update({
    where: { id: input.contactId },
    data,
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      birthYear: true,
      birthMonth: true,
      birthDay: true,
      assignedMerchant: true,
      phones: { select: { phoneNumber: true }, orderBy: { createdAt: "asc" } },
    },
  });

  // Keep previous primary as secondary so purchase history + search still match it.
  if (phoneToPromote && previousPhone) {
    await ensureSecondaryContactIdentifiers({
      contactId: updated.id,
      primaryPhoneNumber: phoneToPromote,
      phoneNumber: previousPhone,
    });
  }

  if (
    input.patch.email !== undefined &&
    previousEmail &&
    updated.email &&
    normalizeContactEmail(previousEmail) !== normalizeContactEmail(updated.email)
  ) {
    await ensureSecondaryContactIdentifiers({
      contactId: updated.id,
      primaryEmail: updated.email,
      email: previousEmail,
    });
  }

  return updated;
}
