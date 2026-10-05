import { getAppBaseUrl } from "@/lib/app-base-url";
import {
  REGISTER_EMAIL_PHOTO_PREVIEW_PATH,
  isRemoteEmailPhotoUrl,
} from "@/lib/register-users/email-photo";
import {
  formatAppIsoDate,
  parseAppCalendarDayStart,
} from "@/lib/format-datetime";
import { prisma } from "@/lib/prisma";
import QRCode from "qrcode";

export type RegisterEmailTemplateDto = {
  header: string;
  body: string;
  photoUrl: string | null;
};

export type RegisterTodayQrDto = {
  token: string;
  url: string;
  qrDataUrl: string;
};

export async function getOrCreateRegisterSettings(companyId: string) {
  const existing = await prisma.osRegistrationSettings.findUnique({
    where: { companyId },
    include: { latestQr: true },
  });
  if (existing) return existing;
  return prisma.osRegistrationSettings.create({
    data: { companyId },
    include: { latestQr: true },
  });
}

export async function upsertRegisterEmailTemplate(
  companyId: string,
  input: { header: string; body: string; photoUrl?: string | null },
) {
  return prisma.osRegistrationSettings.upsert({
    where: { companyId },
    create: {
      companyId,
      emailHeader: input.header,
      emailBody: input.body,
      emailPhotoUrl: input.photoUrl ?? null,
    },
    update: {
      emailHeader: input.header,
      emailBody: input.body,
      ...(input.photoUrl !== undefined ? { emailPhotoUrl: input.photoUrl } : {}),
    },
  });
}

export async function upsertRegisterHeader(
  companyId: string,
  input: {
    location: string;
    badgeStart: Date;
    badgeEnd: Date;
    headerDate: string;
  },
) {
  return prisma.osRegistrationSettings.upsert({
    where: { companyId },
    create: {
      companyId,
      headerLocation: input.location,
      headerBadgeStart: input.badgeStart,
      headerBadgeEnd: input.badgeEnd,
      headerDate: input.headerDate,
    },
    update: {
      headerLocation: input.location,
      headerBadgeStart: input.badgeStart,
      headerBadgeEnd: input.badgeEnd,
      headerDate: input.headerDate,
    },
  });
}

export async function setLatestRegisterQr(companyId: string, qrId: string) {
  return prisma.osRegistrationSettings.upsert({
    where: { companyId },
    create: { companyId, latestQrId: qrId },
    update: { latestQrId: qrId },
  });
}

export function serializeEmailTemplate(settings: {
  emailHeader: string;
  emailBody: string;
  emailPhotoUrl: string | null;
}): RegisterEmailTemplateDto {
  const stored = settings.emailPhotoUrl?.trim() || null;
  return {
    header: settings.emailHeader,
    body: settings.emailBody,
    photoUrl: stored
      ? isRemoteEmailPhotoUrl(stored)
        ? stored
        : REGISTER_EMAIL_PHOTO_PREVIEW_PATH
      : null,
  };
}

export async function todayQrDto(
  qr: { token: string; createdAt: Date } | null,
  today: string,
): Promise<RegisterTodayQrDto | null> {
  if (!qr) return null;
  if (formatAppIsoDate(qr.createdAt) !== today) return null;
  const url = `${getAppBaseUrl()}/register/${qr.token}`;
  const qrDataUrl = await QRCode.toDataURL(url, { width: 512, margin: 2 });
  return { token: qr.token, url, qrDataUrl };
}

export function todayHeaderDto(
  settings: {
    headerLocation: string | null;
    headerBadgeStart: Date | null;
    headerBadgeEnd: Date | null;
    headerDate: string | null;
  },
  today: string,
): { location: string; badgeStart: string; badgeEnd: string } | null {
  if (settings.headerDate !== today) return null;
  if (
    !settings.headerLocation?.trim() ||
    !settings.headerBadgeStart ||
    !settings.headerBadgeEnd
  ) {
    return null;
  }
  return {
    location: settings.headerLocation.trim(),
    badgeStart: formatAppIsoDate(settings.headerBadgeStart),
    badgeEnd: formatAppIsoDate(settings.headerBadgeEnd),
  };
}

export function parseHeaderDates(badgeStart: string, badgeEnd: string) {
  return {
    badgeStart: parseAppCalendarDayStart(badgeStart),
    badgeEnd: parseAppCalendarDayStart(badgeEnd),
  };
}
