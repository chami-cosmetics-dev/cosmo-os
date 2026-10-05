import { findMatchingContacts } from "@/lib/contact-identifiers";
import {
  formatAppIsoDate,
  parseAppCalendarDayStart,
} from "@/lib/format-datetime";
import { prisma } from "@/lib/prisma";
import {
  normalizeRegisterEmail,
  outcomeForExisting,
  profileFieldsChanged,
} from "@/lib/register-users/outcome";
import { normalizeRegisterPhone } from "@/lib/register-users/phone";
import { serializeCaptureRow } from "@/lib/register-users/serialize";
import {
  RegisterPhoneConflictError,
  type RegisterCaptureRow,
} from "@/lib/register-users/types";
import type { RegisterOutcome } from "@/lib/register-users/outcome";
import type { RegisterSource } from "@/lib/register-users/types";

export type RegisterSaveInput = {
  companyId: string;
  name: string;
  phoneNumber: string;
  email?: string | null;
  birthYear?: number | null;
  birthMonth?: number | null;
  birthDay?: number | null;
  location: string;
  badgeStart: Date;
  badgeEnd: Date;
  source: RegisterSource;
  actorUserId?: string | null;
  qrId?: string | null;
  applyBirthday: boolean;
};

export type RegisterSaveResult = {
  outcome: RegisterOutcome;
  contactId: string;
  row: RegisterCaptureRow;
};

type ContactProfile = {
  id: string;
  name: string;
  email: string | null;
  phoneNumber: string | null;
  birthYear: number | null;
  birthMonth: number | null;
  birthDay: number | null;
};

async function findUniquePhoneContact(
  companyId: string,
  phoneNumber: string,
): Promise<ContactProfile | null> {
  const { phoneMatches } = await findMatchingContacts(
    companyId,
    null,
    phoneNumber,
  );
  const uniqueIds = [...new Set(phoneMatches.map((c) => c.id))];
  if (uniqueIds.length > 1) {
    throw new RegisterPhoneConflictError(
      phoneMatches.map((c) => ({
        contactId: c.id,
        name: c.name,
        email: c.email,
        phone: c.phoneNumber,
      })),
    );
  }
  if (uniqueIds.length === 0) return null;

  return prisma.contactMaster.findFirst({
    where: { id: uniqueIds[0], companyId },
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      birthYear: true,
      birthMonth: true,
      birthDay: true,
    },
  });
}

export async function saveRegisteredUser(
  input: RegisterSaveInput,
): Promise<RegisterSaveResult> {
  const storedPhone =
    normalizeRegisterPhone(input.phoneNumber) ?? input.phoneNumber.trim();
  const email = normalizeRegisterEmail(input.email);
  const name = input.name.trim();
  const location = input.location.trim();
  const captureDate =
    parseAppCalendarDayStart(formatAppIsoDate(new Date())) ?? new Date();

  const existing = await findUniquePhoneContact(input.companyId, storedPhone);

  const nextBirthday = input.applyBirthday
    ? {
        birthYear: input.birthYear ?? null,
        birthMonth: input.birthMonth ?? null,
        birthDay: input.birthDay ?? null,
      }
    : null;

  return prisma.$transaction(async (tx) => {
    let contactId: string;
    let outcome: RegisterOutcome;
    let phone = storedPhone;
    let savedEmail = email;
    let savedName = name;

    if (!existing) {
      const created = await tx.contactMaster.create({
        data: {
          companyId: input.companyId,
          name,
          phoneNumber: storedPhone,
          email,
          birthYear: nextBirthday?.birthYear ?? null,
          birthMonth: nextBirthday?.birthMonth ?? null,
          birthDay: nextBirthday?.birthDay ?? null,
          assignedMerchant: null,
          osRegistrationCreated: true,
          osRegLocation: location,
          osRegBadgeStart: input.badgeStart,
          osRegBadgeEnd: input.badgeEnd,
          source: "os_register",
        },
        select: { id: true, phoneNumber: true, email: true, name: true },
      });
      contactId = created.id;
      outcome = "created";
      phone = created.phoneNumber ?? storedPhone;
      savedEmail = created.email;
      savedName = created.name;
    } else {
      const birthdayAfter = input.applyBirthday
        ? {
            birthYear: nextBirthday!.birthYear,
            birthMonth: nextBirthday!.birthMonth,
            birthDay: nextBirthday!.birthDay,
          }
        : {
            birthYear: existing.birthYear,
            birthMonth: existing.birthMonth,
            birthDay: existing.birthDay,
          };
      const changed = profileFieldsChanged(
        existing,
        { name, email, ...birthdayAfter },
        input.applyBirthday,
      );
      outcome = outcomeForExisting(changed);

      const updated = await tx.contactMaster.update({
        where: { id: existing.id },
        data: {
          name,
          email,
          ...(input.applyBirthday ? birthdayAfter : {}),
          osRegLocation: location,
          osRegBadgeStart: input.badgeStart,
          osRegBadgeEnd: input.badgeEnd,
        },
        select: { id: true, phoneNumber: true, email: true, name: true },
      });
      contactId = updated.id;
      phone = updated.phoneNumber ?? existing.phoneNumber ?? storedPhone;
      savedEmail = updated.email;
      savedName = updated.name;
    }

    const capture = await tx.osRegistrationCapture.create({
      data: {
        companyId: input.companyId,
        contactId,
        qrId: input.qrId ?? null,
        location,
        badgeStart: input.badgeStart,
        badgeEnd: input.badgeEnd,
        captureDate,
        source: input.source,
        outcome,
        actorUserId: input.actorUserId ?? null,
      },
    });

    return {
      outcome,
      contactId,
      row: serializeCaptureRow({
        id: capture.id,
        contactId,
        name: savedName,
        phone,
        email: savedEmail,
        location,
        badgeStart: input.badgeStart,
        badgeEnd: input.badgeEnd,
        source: input.source,
        outcome,
        createdAt: capture.createdAt,
      }),
    };
  });
}
