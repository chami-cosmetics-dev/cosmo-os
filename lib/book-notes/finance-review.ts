import {
  postingDateToUtcMidnight,
  serializeBookNoteReceipt,
  serializeBookNoteRow,
} from "@/lib/book-notes/serialize";
import {
  mergeBookNoteSummaries,
  summarizeBookNoteRows,
  type BookNoteRowsSummary,
} from "@/lib/book-notes/summary";
import type {
  BookNoteActor,
  BookNoteFinanceDay,
  BookNoteFinanceSummary,
} from "@/lib/book-notes/types";
import { prisma } from "@/lib/prisma";

/** Hard ceiling so a wide date range cannot pull the whole table. */
const MAX_DAYS = 200;

function postingDateYmd(value: Date): string {
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function actor(
  user: { name: string | null; email: string | null } | null,
  at: Date | null,
): BookNoteActor | null {
  if (!user && !at) return null;
  return {
    name: user?.name?.trim() || user?.email || "Unknown user",
    at: (at ?? new Date()).toISOString(),
  };
}

export type BookNoteFinanceReview = {
  days: BookNoteFinanceDay[];
  summary: BookNoteFinanceSummary;
  /** True when the range hit `MAX_DAYS` and more sheets exist. */
  truncated: boolean;
};

/**
 * Everything finance needs to review merchant book notes for an outlet (or all
 * outlets) over a posting-date range: per-day payment totals, the invoice rows
 * behind them, the uploaded slips, and who entered each sheet.
 *
 * Callers must have already checked `book_notes.read` — this applies no
 * per-user outlet scoping, because finance is meant to see every shop.
 */
export async function loadBookNoteFinanceReview(input: {
  companyId: string;
  /** Omit for every shop in the company. */
  companyLocationId?: string;
  fromYmd: string;
  toYmd: string;
}): Promise<BookNoteFinanceReview> {
  const days = await prisma.bookNoteDay.findMany({
    where: {
      companyId: input.companyId,
      ...(input.companyLocationId
        ? { companyLocationId: input.companyLocationId }
        : {}),
      postingDate: {
        gte: postingDateToUtcMidnight(input.fromYmd),
        lte: postingDateToUtcMidnight(input.toYmd),
      },
    },
    orderBy: [{ postingDate: "desc" }, { updatedAt: "desc" }],
    take: MAX_DAYS + 1,
    include: {
      companyLocation: {
        select: { name: true, shortName: true, erpnextCompany: true },
      },
      createdBy: { select: { name: true, email: true } },
      updatedBy: { select: { name: true, email: true } },
      rows: { orderBy: { sortOrder: "asc" } },
      receipts: { orderBy: { sortOrder: "asc" } },
    },
  });

  const truncated = days.length > MAX_DAYS;
  const page = truncated ? days.slice(0, MAX_DAYS) : days;

  const daySummaries: BookNoteRowsSummary[] = [];
  let receiptCount = 0;
  let rowCount = 0;

  const financeDays: BookNoteFinanceDay[] = page.map((day) => {
    const rows = day.rows.map(serializeBookNoteRow);
    const summary = summarizeBookNoteRows(rows);
    daySummaries.push(summary);
    receiptCount += day.receipts.length;
    rowCount += rows.length;

    return {
      id: day.id,
      companyLocationId: day.companyLocationId,
      shopName: day.companyLocation.shortName?.trim() || day.companyLocation.name,
      company: day.companyLocation.erpnextCompany ?? "",
      posting_date: postingDateYmd(day.postingDate),
      submittedBy: actor(day.createdBy, day.createdAt),
      lastUpdatedBy:
        day.updatedByUserId && day.updatedByUserId !== day.createdByUserId
          ? actor(day.updatedBy, day.updatedAt)
          : null,
      rowCount: rows.length,
      methods: summary.methods,
      entryCount: summary.entryCount,
      grandTotal: summary.grandTotal,
      rows,
      receipts: day.receipts.map(serializeBookNoteReceipt),
    };
  });

  const merged = mergeBookNoteSummaries(daySummaries);

  return {
    days: financeDays,
    summary: {
      dayCount: financeDays.length,
      rowCount,
      receiptCount,
      methods: merged.methods,
      entryCount: merged.entryCount,
      grandTotal: merged.grandTotal,
    },
    truncated,
  };
}
