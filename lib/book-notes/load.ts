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
    include: {
      companyLocation: {
        select: { name: true, erpnextCompany: true, companyId: true },
      },
      rows: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!day || day.companyId !== input.companyId) return null;

  return serializeBookNoteDay({
    id: day.id,
    companyLocationId: day.companyLocationId,
    postingDate: day.postingDate,
    location: day.companyLocation,
    rows: day.rows,
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
      now: input.now,
    }),
  );
}

/** Recent saved days for an outlet (newest first). */
export async function loadBookNoteHistory(input: {
  companyId: string;
  companyLocationId: string;
  limit?: number;
  now?: Date;
}): Promise<BookNoteHistoryItem[]> {
  const limit = Math.min(Math.max(input.limit ?? 30, 1), 60);
  const days = await prisma.bookNoteDay.findMany({
    where: {
      companyId: input.companyId,
      companyLocationId: input.companyLocationId,
    },
    orderBy: { postingDate: "desc" },
    take: limit,
    include: {
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
    return {
      id: day.id,
      posting_date,
      rowCount: day.rows.length,
      grandTotal: Math.round(grandTotal * 100) / 100,
      updatedAt: day.updatedAt.toISOString(),
      locked: isBookNoteDayLocked(posting_date, now),
    };
  });
}
