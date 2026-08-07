import { prisma } from "@/lib/prisma";
import { normalizeContactEmail, normalizeContactPhone } from "@/lib/contact-identifiers";

export type ProfilePatchInput = {
  name?: string;
  email?: string | null;
  phoneNumber?: string | null;
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
    select: { id: true },
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

  if (input.patch.name !== undefined) data.name = input.patch.name;
  if (input.patch.email !== undefined) {
    data.email = input.patch.email === null ? null : normalizeContactEmail(input.patch.email);
  }
  if (input.patch.phoneNumber !== undefined) {
    data.phoneNumber =
      input.patch.phoneNumber === null
        ? null
        : normalizeContactPhone(input.patch.phoneNumber);
  }
  if (input.patch.birthYear !== undefined) data.birthYear = input.patch.birthYear;
  if (input.patch.birthMonth !== undefined) data.birthMonth = input.patch.birthMonth;
  if (input.patch.birthDay !== undefined) data.birthDay = input.patch.birthDay;

  return prisma.contactMaster.update({
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
    },
  });
}
