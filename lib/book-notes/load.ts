import type { BookNoteDayDto, BookNoteHistoryItem } from "@/lib/book-notes/types";
import { isBookNoteDayLocked } from "@/lib/book-notes/lock";
import {
  postingDateToUtcMidnight,
  serializeBookNoteDay,
} from "@/lib/book-notes/serialize";
import { prisma } from "@/lib/prisma";

function postingDateYmd(value: Date): string {
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function money(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

const dayInclude = {
  companyLocation: {
    select: { name: true, erpnextCompany: true, companyId: true },
  },
  rows: { orderBy: { sortOrder: "asc" as const } },
  receipts: { orderBy: { sortOrder: "asc" as const } },
};

export async function loadBookNoteDayDto(input: {
  companyId: string;
  companyLocationId: string;
  postingDateYmd: string;
  now?: Date;
}): Promise<BookNoteDayDto | null> {
  const postingDate = postingDateToUtcMidnight(input.postingDateYmd);
  const day = await prisma.bookNoteDay.findUnique({
    where: {
      companyLocationId_postingDate: {
        companyLocationId: input.companyLocationId,
        postingDate,
      },
    },
    include: dayInclude,
  });

  if (!day || day.companyId !== input.companyId) return null;

  return serializeBookNoteDay({
    id: day.id,
    companyLocationId: day.companyLocationId,
    postingDate: day.postingDate,
    location: day.companyLocation,
    rows: day.rows,
    receipts: day.receipts,
    now: input.now,
  });
}

export async function loadBookNoteDaysInRange(input: {
  companyId: string;
  companyLocationId: string;
  fromYmd: string;
  toYmd: string;
  now?: Date;
}): Promise<BookNoteDayDto[]> {
  const from = postingDateToUtcMidnight(input.fromYmd);
  const to = postingDateToUtcMidnight(input.toYmd);
  const days = await prisma.bookNoteDay.findMany({
    where: {
      companyId: input.companyId,
      companyLocationId: input.companyLocationId,
      postingDate: { gte: from, lte: to },
    },
    include: {
      companyLocation: {
        select: { name: true, erpnextCompany: true },
      },
      rows: { orderBy: { sortOrder: "asc" } },
      receipts: { orderBy: { sortOrder: "asc" } },
    },
    orderBy: { postingDate: "asc" },
  });

  return days.map((day) =>
    serializeBookNoteDay({
      id: day.id,
      companyLocationId: day.companyLocationId,
      postingDate: day.postingDate,
      location: day.companyLocation,
      rows: day.rows,
      receipts: day.receipts,
      now: input.now,
    }),
  );
}

/** Recent saved days for allowed shop(s), newest first. */
export async function loadBookNoteHistory(input: {
  companyId: string;
  /** When set, only that shop. When omitted, all `companyLocationIds`. */
  companyLocationId?: string;
  companyLocationIds: string[];
  limit?: number;
  now?: Date;
}): Promise<BookNoteHistoryItem[]> {
  const allowed = input.companyLocationIds.filter(Boolean);
  if (allowed.length === 0) return [];

  const locationFilter = input.companyLocationId
    ? allowed.includes(input.companyLocationId)
      ? [input.companyLocationId]
      : []
    : allowed;
  if (locationFilter.length === 0) return [];

  const limit = Math.min(Math.max(input.limit ?? 30, 1), 60);
  const days = await prisma.bookNoteDay.findMany({
    where: {
      companyId: input.companyId,
      companyLocationId: { in: locationFilter },
    },
    orderBy: [{ postingDate: "desc" }, { updatedAt: "desc" }],
    take: limit,
    include: {
      companyLocation: {
        select: { name: true, shortName: true },
      },
      rows: {
        select: { cash: true, card: true, koko: true, bankTransfer: true },
      },
    },
  });

  const now = input.now ?? new Date();
  return days.map((day) => {
    const posting_date = postingDateYmd(day.postingDate);
    const grandTotal = day.rows.reduce((sum, r) => {
      return (
        sum +
        money(r.cash) +
        money(r.card) +
        money(r.koko) +
        money(r.bankTransfer)
      );
    }, 0);
    const shopName =
      day.companyLocation.shortName?.trim() || day.companyLocation.name;
    return {
      id: day.id,
      companyLocationId: day.companyLocationId,
      shopName,
      posting_date,
      rowCount: day.rows.length,
      grandTotal: Math.round(grandTotal * 100) / 100,
      updatedAt: day.updatedAt.toISOString(),
      locked: isBookNoteDayLocked(posting_date, now),
    };
  });
}
