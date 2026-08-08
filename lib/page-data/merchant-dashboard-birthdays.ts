import "server-only";

import { formatAppIsoDate } from "@/lib/format-datetime";
import { viewerMerchantLabels } from "@/lib/customer-insight/ownership";
import { prisma } from "@/lib/prisma";

export type MerchantBirthdayRow = {
  contactId: string;
  name: string;
  phoneNumber: string | null;
  birthMonth: number;
  birthDay: number | null;
  daysUntil: number;
  assignedMerchant: string | null;
};

function colomboYmdParts(now = new Date()) {
  const ymd = formatAppIsoDate(now);
  const [y, m, d] = ymd.split("-").map(Number);
  return { y, m, d, ymd };
}

/** Days until next birthday (0 = today). Requires birthMonth 1–12; day defaults to 1 if missing. */
export function daysUntilNextBirthday(
  birthMonth: number,
  birthDay: number | null | undefined,
  now = new Date(),
): number | null {
  if (!Number.isFinite(birthMonth) || birthMonth < 1 || birthMonth > 12) return null;
  const day = birthDay != null && birthDay >= 1 && birthDay <= 31 ? birthDay : 1;
  const { y, m, d } = colomboYmdParts(now);

  const todayUtc = Date.UTC(y, m - 1, d);
  let nextUtc = Date.UTC(y, birthMonth - 1, day);
  // Clamp invalid dates (e.g. Feb 31 → rolls); compare month after construct
  const nextDate = new Date(nextUtc);
  if (nextDate.getUTCMonth() !== birthMonth - 1) {
    // Use last day of month
    nextUtc = Date.UTC(y, birthMonth, 0);
  }
  if (nextUtc < todayUtc) {
    nextUtc = Date.UTC(y + 1, birthMonth - 1, day);
    const rolled = new Date(nextUtc);
    if (rolled.getUTCMonth() !== birthMonth - 1) {
      nextUtc = Date.UTC(y + 1, birthMonth, 0);
    }
  }
  return Math.round((nextUtc - todayUtc) / 86_400_000);
}

/**
 * Nearest upcoming birthdays among contacts allocated to this merchant
 * (ContactMaster.assignedMerchant matches knownName/name/email).
 */
export async function fetchMerchantNearestBirthdays(
  companyId: string,
  merchantUser: {
    knownName?: string | null;
    name?: string | null;
    email?: string | null;
  },
  params?: { limit?: number; withinDays?: number },
): Promise<MerchantBirthdayRow[]> {
  const limit = params?.limit ?? 15;
  const withinDays = params?.withinDays ?? 45;
  const labels = viewerMerchantLabels(merchantUser);
  if (labels.length === 0) return [];

  const contacts = await prisma.contactMaster.findMany({
    where: {
      companyId,
      birthMonth: { not: null, gte: 1, lte: 12 },
      OR: labels.map((label) => ({
        assignedMerchant: { equals: label, mode: "insensitive" as const },
      })),
    },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      birthMonth: true,
      birthDay: true,
      assignedMerchant: true,
    },
    take: 2_000,
  });

  const rows: MerchantBirthdayRow[] = [];
  for (const contact of contacts) {
    const month = contact.birthMonth;
    if (month == null) continue;
    const daysUntil = daysUntilNextBirthday(month, contact.birthDay);
    if (daysUntil == null || daysUntil > withinDays) continue;
    rows.push({
      contactId: contact.id,
      name: contact.name,
      phoneNumber: contact.phoneNumber,
      birthMonth: month,
      birthDay: contact.birthDay,
      daysUntil,
      assignedMerchant: contact.assignedMerchant,
    });
  }

  return rows
    .sort((a, b) => a.daysUntil - b.daysUntil || a.name.localeCompare(b.name))
    .slice(0, limit);
}
