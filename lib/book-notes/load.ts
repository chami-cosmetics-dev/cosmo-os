import type { Prisma } from "@prisma/client";

import { canViewBookNoteDay, type BookNoteViewScope } from "@/lib/book-notes/access";
import type {
  BookNoteDayDto,
  BookNoteHistoryItem,
  BookNoteReceiptGalleryItem,
} from "@/lib/book-notes/types";
import type { BookNoteWriteAccess } from "@/lib/book-notes/lock";
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
  createdBy: { select: { name: true, email: true } },
  updatedBy: { select: { name: true, email: true } },
  rows: { orderBy: { sortOrder: "asc" as const } },
  receipts: { orderBy: { sortOrder: "asc" as const } },
};

export async function loadBookNoteDayDto(input: {
  companyId: string;
  companyLocationId: string;
  postingDateYmd: string;
  now?: Date;
  writeAccess?: BookNoteWriteAccess;
  /** Supply both to withhold days this user may not see. */
  viewScope?: BookNoteViewScope;
  viewerUserId?: string | null;
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

  if (
    input.viewScope &&
    !canViewBookNoteDay({
      viewScope: input.viewScope,
      userId: input.viewerUserId ?? null,
      day: {
        companyLocationId: day.companyLocationId,
        createdByUserId: day.createdByUserId,
        updatedByUserId: day.updatedByUserId,
      },
    })
  ) {
    const author = day.updatedBy ?? day.createdBy;
    const base = serializeBookNoteDay({
      id: day.id,
      companyLocationId: day.companyLocationId,
      postingDate: day.postingDate,
      location: day.companyLocation,
      rows: [],
      receipts: [],
      now: input.now,
      writeAccess: input.writeAccess,
    });
    return {
      ...base,
      locked: true,
      restricted: true,
      enteredBy: author?.name?.trim() || author?.email || null,
    };
  }

  return serializeBookNoteDay({
    id: day.id,
    companyLocationId: day.companyLocationId,
    postingDate: day.postingDate,
    location: day.companyLocation,
    rows: day.rows,
    receipts: day.receipts,
    now: input.now,
    writeAccess: input.writeAccess,
  });
}

export async function loadBookNoteDaysInRange(input: {
  companyId: string;
  companyLocationId: string;
  fromYmd: string;
  toYmd: string;
  now?: Date;
  writeAccess?: BookNoteWriteAccess;
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
      writeAccess: input.writeAccess,
    }),
  );
}

/**
 * Turn a free-text search fragment into a posting-date range when it looks like
 * a date: `2026`, `2026-09` or `2026-09-08`. Returns null for anything else.
 */
export function postingDateRangeFromQuery(
  q: string,
): { gte: Date; lte: Date } | null {
  const t = q.trim();
  if (/^\d{4}$/.test(t)) {
    return {
      gte: postingDateToUtcMidnight(`${t}-01-01`),
      lte: postingDateToUtcMidnight(`${t}-12-31`),
    };
  }
  if (/^\d{4}-\d{2}$/.test(t)) {
    const [y, m] = t.split("-").map(Number);
    const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
    return {
      gte: postingDateToUtcMidnight(`${t}-01`),
      lte: postingDateToUtcMidnight(`${t}-${String(last).padStart(2, "0")}`),
    };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const day = postingDateToUtcMidnight(t);
    return { gte: day, lte: day };
  }
  return null;
}

/**
 * Saved book-note days this user is allowed to see, newest first.
 *
 * Visibility: sheets they created or last saved, plus every sheet for the
 * outlets they are posted to (so two merchants in one shop share a history),
 * plus everything when `viewScope.canViewAllShops` (finance / admin).
 * `search` matches shop name, posting date, and sales invoice numbers.
 */
export async function loadBookNoteHistory(input: {
  companyId: string;
  /** Current user — always sees their own sheets. */
  createdByUserId: string;
  /** When set, only that shop. When omitted, all `companyLocationIds`. */
  companyLocationId?: string;
  companyLocationIds: string[];
  viewScope?: BookNoteViewScope;
  /** Free text: shop name, posting date (YYYY, YYYY-MM, YYYY-MM-DD), invoice no. */
  search?: string;
  limit?: number;
  now?: Date;
  writeAccess?: BookNoteWriteAccess;
}): Promise<BookNoteHistoryItem[]> {
  const allowed = input.companyLocationIds.filter(Boolean);
  if (allowed.length === 0) return [];

  const locationFilter = input.companyLocationId
    ? allowed.includes(input.companyLocationId)
      ? [input.companyLocationId]
      : []
    : allowed;
  if (locationFilter.length === 0) return [];

  const userId = input.createdByUserId;
  if (!userId) return [];

  const viewScope = input.viewScope ?? {
    canViewAllShops: false,
    assignedLocationIds: [],
  };

  const visibleLocationIds = viewScope.assignedLocationIds.filter((id) =>
    locationFilter.includes(id),
  );
  const visibility: Prisma.BookNoteDayWhereInput[] = [
    { createdByUserId: userId },
    { updatedByUserId: userId },
  ];
  if (visibleLocationIds.length > 0) {
    visibility.push({ companyLocationId: { in: visibleLocationIds } });
  }

  const search = (input.search ?? "").trim();
  const searchClauses: Prisma.BookNoteDayWhereInput[] = [];
  if (search) {
    searchClauses.push({
      companyLocation: {
        is: {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { shortName: { contains: search, mode: "insensitive" } },
          ],
        },
      },
    });
    searchClauses.push({
      rows: {
        some: { salesInvoice: { contains: search, mode: "insensitive" } },
      },
    });
    const dateRange = postingDateRangeFromQuery(search);
    if (dateRange) {
      searchClauses.push({ postingDate: dateRange });
    }
  }

  const where: Prisma.BookNoteDayWhereInput = {
    companyId: input.companyId,
    companyLocationId: { in: locationFilter },
    ...(viewScope.canViewAllShops ? {} : { OR: visibility }),
    ...(searchClauses.length > 0 ? { AND: [{ OR: searchClauses }] } : {}),
  };

  const limit = Math.min(Math.max(input.limit ?? 30, 1), 60);
  const days = await prisma.bookNoteDay.findMany({
    where,
    orderBy: [{ postingDate: "desc" }, { updatedAt: "desc" }],
    take: limit,
    include: {
      companyLocation: {
        select: { name: true, shortName: true },
      },
      createdBy: { select: { name: true, email: true } },
      updatedBy: { select: { name: true, email: true } },
      rows: {
        select: { cash: true, card: true, koko: true, bankTransfer: true },
      },
    },
  });

  const now = input.now ?? new Date();
  const writeAccess = input.writeAccess ?? { canBackdate: false };
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
    const author = day.updatedBy ?? day.createdBy;
    return {
      id: day.id,
      companyLocationId: day.companyLocationId,
      shopName,
      posting_date,
      rowCount: day.rows.length,
      grandTotal: Math.round(grandTotal * 100) / 100,
      updatedAt: day.updatedAt.toISOString(),
      locked: isBookNoteDayLocked(posting_date, now, writeAccess),
      enteredBy: author?.name?.trim() || author?.email || null,
      isOwn:
        day.createdByUserId === userId || day.updatedByUserId === userId,
    };
  });
}

/**
 * Receipt photos for the finance gallery: every slip uploaded against a shop's
 * book-note days inside a posting-date range, newest day first.
 * Callers must have already checked `book_notes.read`.
 */
export async function loadBookNoteReceiptGallery(input: {
  companyId: string;
  /** Omit for every shop in the company. */
  companyLocationId?: string;
  fromYmd: string;
  toYmd: string;
  limit?: number;
}): Promise<BookNoteReceiptGalleryItem[]> {
  const limit = Math.min(Math.max(input.limit ?? 300, 1), 500);
  const receipts = await prisma.bookNoteReceipt.findMany({
    where: {
      bookNoteDay: {
        companyId: input.companyId,
        ...(input.companyLocationId
          ? { companyLocationId: input.companyLocationId }
          : {}),
        postingDate: {
          gte: postingDateToUtcMidnight(input.fromYmd),
          lte: postingDateToUtcMidnight(input.toYmd),
        },
      },
    },
    orderBy: [{ bookNoteDay: { postingDate: "desc" } }, { sortOrder: "asc" }],
    take: limit,
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      fileSize: true,
      createdAt: true,
      bookNoteDayId: true,
      bookNoteDay: {
        select: {
          companyLocationId: true,
          postingDate: true,
          companyLocation: { select: { name: true, shortName: true } },
        },
      },
    },
  });

  return receipts.map((r) => ({
    id: r.id,
    bookNoteDayId: r.bookNoteDayId,
    companyLocationId: r.bookNoteDay.companyLocationId,
    shopName:
      r.bookNoteDay.companyLocation.shortName?.trim() ||
      r.bookNoteDay.companyLocation.name,
    posting_date: postingDateYmd(r.bookNoteDay.postingDate),
    fileName: r.fileName,
    mimeType: r.mimeType,
    fileSize: r.fileSize,
    url: `/api/admin/book-notes/receipts/${r.id}`,
    createdAt: r.createdAt.toISOString(),
  }));
}
