import { NextRequest, NextResponse } from "next/server";

import {
  DAY_LOCKED_CODE,
  bookNoteLockMessage,
  isBookNoteWritable,
} from "@/lib/book-notes/lock";
import {
  assertBookNoteShopAllowed,
  canViewBookNoteDay,
  resolveBookNoteShopAccess,
  resolveBookNoteViewScope,
  resolveBookNoteWriteAccess,
} from "@/lib/book-notes/access";
import {
  loadBookNoteDayDto,
  loadBookNoteDaysInRange,
} from "@/lib/book-notes/load";
import { postingDateToUtcMidnight } from "@/lib/book-notes/serialize";
import {
  aggregateSplitLines,
  bookNoteRowUsesSplitPayload,
  normalizeBookNoteSplitLines,
} from "@/lib/book-notes/split-lines";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { LIMITS } from "@/lib/validation";
import {
  bookNotePutBodySchema,
  bookNoteRetrieveQuerySchema,
} from "@/lib/validation/book-notes";

function daysBetweenInclusive(fromYmd: string, toYmd: string): number {
  const from = postingDateToUtcMidnight(fromYmd).getTime();
  const to = postingDateToUtcMidnight(toYmd).getTime();
  return Math.floor((to - from) / (24 * 60 * 60 * 1000)) + 1;
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission("book_notes.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 },
    );
  }

  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = bookNoteRetrieveQuerySchema.safeParse({
    companyLocationId: raw.companyLocationId,
    postingDate: raw.postingDate || undefined,
    from: raw.from || undefined,
    to: raw.to || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const location = await prisma.companyLocation.findFirst({
    where: { id: parsed.data.companyLocationId, companyId },
    select: { id: true },
  });
  if (!location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  if (parsed.data.postingDate) {
    const day = await loadBookNoteDayDto({
      companyId,
      companyLocationId: parsed.data.companyLocationId,
      postingDateYmd: parsed.data.postingDate,
    });
    return NextResponse.json({ days: day ? [day] : [] });
  }

  const from = parsed.data.from!;
  const to = parsed.data.to!;
  if (daysBetweenInclusive(from, to) > LIMITS.bookNoteRetrieveMaxDays) {
    return NextResponse.json(
      { error: `Date range cannot exceed ${LIMITS.bookNoteRetrieveMaxDays} days` },
      { status: 400 },
    );
  }

  const days = await loadBookNoteDaysInRange({
    companyId,
    companyLocationId: parsed.data.companyLocationId,
    fromYmd: from,
    toYmd: to,
  });
  return NextResponse.json({ days });
}

/**
 * Find which sheet a save should land on.
 *
 * Sheets are per merchant, so a save without an explicit `bookNoteDayId`
 * targets the caller's *own* sheet for that shop and date — never a
 * colleague's. An explicit id (finance or an admin opening a sheet from the
 * review/history list) is honoured only if the caller may see that sheet,
 * because saving replaces every row on it.
 */
async function resolveSaveTarget(input: {
  context: Parameters<typeof resolveBookNoteViewScope>[0];
  companyId: string;
  userId: string;
  companyLocationId: string;
  postingDate: string;
  bookNoteDayId?: string | null;
}): Promise<{
  denied: NextResponse | null;
  existingId: string | null;
  isOwner: boolean;
}> {
  const postingDate = postingDateToUtcMidnight(input.postingDate);

  const existing = await prisma.bookNoteDay.findFirst({
    where: input.bookNoteDayId
      ? { id: input.bookNoteDayId }
      : {
          companyLocationId: input.companyLocationId,
          postingDate,
          createdByUserId: input.userId,
        },
    select: {
      id: true,
      companyId: true,
      companyLocationId: true,
      postingDate: true,
      createdByUserId: true,
      updatedByUserId: true,
      createdBy: { select: { name: true, email: true } },
      updatedBy: { select: { name: true, email: true } },
    },
  });

  if (!existing || existing.companyId !== input.companyId) {
    // Nothing of theirs yet — this save starts a fresh sheet.
    if (input.bookNoteDayId) {
      return {
        denied: NextResponse.json(
          { error: "Book note not found" },
          { status: 404 },
        ),
        existingId: null,
        isOwner: false,
      };
    }
    return { denied: null, existingId: null, isOwner: false };
  }

  const isOwner = existing.createdByUserId === input.userId;

  const viewScope = await resolveBookNoteViewScope(input.context);
  const allowed = canViewBookNoteDay({
    viewScope,
    userId: input.userId,
    day: {
      companyLocationId: existing.companyLocationId,
      createdByUserId: existing.createdByUserId,
      updatedByUserId: existing.updatedByUserId,
    },
  });
  if (!allowed) {
    const author = existing.updatedBy ?? existing.createdBy;
    const who = author?.name?.trim() || author?.email || "another merchant";
    return {
      denied: NextResponse.json(
        {
          error: `${who} submitted this book note. Only they or finance can change it.`,
          code: "DAY_NOT_YOURS",
          enteredBy: who,
        },
        { status: 403 },
      ),
      existingId: existing.id,
      isOwner,
    };
  }

  // An explicit id must still match the shop and date being saved, or a save
  // would quietly move someone's sheet to another shop or day.
  if (
    input.bookNoteDayId &&
    (existing.companyLocationId !== input.companyLocationId ||
      existing.postingDate.getTime() !== postingDate.getTime())
  ) {
    return {
      denied: NextResponse.json(
        {
          error:
            "This book note belongs to a different shop or date. Reopen it from history and try again.",
          code: "DAY_MISMATCH",
        },
        { status: 409 },
      ),
      existingId: existing.id,
      isOwner,
    };
  }

  return { denied: null, existingId: existing.id, isOwner };
}

export async function PUT(request: NextRequest) {
  const auth = await requirePermission("book_notes.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  const userId = auth.context!.user?.id ?? null;
  if (!companyId || !userId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bookNotePutBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { companyLocationId, postingDate, rows, bookNoteDayId } = parsed.data;

  const access = await resolveBookNoteShopAccess(auth.context!, companyId);
  if (!assertBookNoteShopAllowed(access, companyLocationId)) {
    return NextResponse.json(
      {
        error: "Shop not allowed for your account",
        code: "SHOP_FORBIDDEN",
      },
      { status: 403 },
    );
  }

  // Ownership decides the lock: the merchant who submitted a past sheet may
  // reopen it, so this has to run before the writable check.
  const target = await resolveSaveTarget({
    context: auth.context!,
    companyId,
    userId,
    companyLocationId,
    postingDate,
    bookNoteDayId,
  });
  if (target.denied) return target.denied;

  const writeAccess = {
    ...resolveBookNoteWriteAccess(auth.context!),
    isOwner: target.isOwner,
  };

  if (!isBookNoteWritable(postingDate, new Date(), writeAccess)) {
    return NextResponse.json(
      {
        error: bookNoteLockMessage(postingDate, new Date(), writeAccess),
        code: DAY_LOCKED_CODE,
      },
      { status: 409 },
    );
  }

  const location = await prisma.companyLocation.findFirst({
    where: { id: companyLocationId, companyId },
    select: { id: true, name: true, shortName: true, erpnextCompany: true },
  });
  if (!location) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const splitNorm = normalizeBookNoteSplitLines(r.splitLines ?? null);
    if (!splitNorm.ok) {
      return NextResponse.json(
        { error: `Row ${r.idxNo || i + 1}: ${splitNorm.error}` },
        { status: 400 },
      );
    }
  }

  const cleaned = rows
    .map((r, i) => {
      const splitNorm = normalizeBookNoteSplitLines(r.splitLines ?? null);
      const splitLines = splitNorm.ok ? splitNorm.lines : [];
      const usesSplit = bookNoteRowUsesSplitPayload(splitLines);
      const agg = usesSplit ? aggregateSplitLines(splitLines) : null;
      return {
        idxNo: r.idxNo || String(i + 1),
        salesInvoice: r.salesInvoice.trim(),
        cash: agg ? agg.cash : r.cash,
        card: agg ? agg.card : r.card,
        cardReceiptRefLast4: usesSplit
          ? agg!.cardReceiptRefLast4
          : r.card > 0 && r.cardReceiptRefLast4
            ? r.cardReceiptRefLast4
            : null,
        koko: agg ? agg.koko : r.koko,
        bankTransfer: agg ? agg.bankTransfer : r.bankTransfer,
        splitLines: usesSplit ? splitLines : null,
        orderId: r.orderId ?? null,
      };
    })
    .filter((r) => {
      const total = r.cash + r.card + r.koko + r.bankTransfer;
      const hasInvoice = r.salesInvoice.length > 0;
      if (!hasInvoice && total === 0) return false;
      return true;
    });

  for (const r of cleaned) {
    const total = r.cash + r.card + r.koko + r.bankTransfer;
    if (!r.salesInvoice && total > 0) {
      return NextResponse.json(
        { error: "Sales invoice is required when amounts are entered" },
        { status: 400 },
      );
    }
    if (r.salesInvoice && total <= 0) {
      return NextResponse.json(
        { error: `Row ${r.idxNo}: enter at least one payment amount` },
        { status: 400 },
      );
    }
  }

  const postingDateUtc = postingDateToUtcMidnight(postingDate);

  // Validate optional orderIds belong to same company/location
  const orderIds = cleaned
    .map((r) => r.orderId)
    .filter((id): id is string => Boolean(id));
  if (orderIds.length > 0) {
    const validOrders = await prisma.order.findMany({
      where: {
        id: { in: orderIds },
        companyId,
        companyLocationId,
      },
      select: { id: true },
    });
    const valid = new Set(validOrders.map((o) => o.id));
    for (const r of cleaned) {
      if (r.orderId && !valid.has(r.orderId)) {
        r.orderId = null;
      }
    }
  }

  const savedDayId = await prisma.$transaction(async (tx) => {
    // Target is resolved above: the caller's own sheet, or the one they opened
    // by id. Never an upsert on shop + date, which would collide with whichever
    // merchant happened to save that shop first.
    // Row edits invalidate ERP sync — clear status so admin bulk / resend
    // picks the sheet up again.
    const day = target.existingId
      ? await tx.bookNoteDay.update({
          where: { id: target.existingId },
          data: {
            updatedByUserId: userId,
            erpSyncedAt: null,
            erpSyncFailedAt: null,
            erpSyncError: null,
          },
          select: { id: true },
        })
      : await tx.bookNoteDay.create({
          data: {
            companyId,
            companyLocationId,
            postingDate: postingDateUtc,
            createdByUserId: userId,
            updatedByUserId: userId,
          },
          select: { id: true },
        });

    await tx.bookNoteRow.deleteMany({ where: { bookNoteDayId: day.id } });

    if (cleaned.length > 0) {
      await tx.bookNoteRow.createMany({
        data: cleaned.map((r, sortOrder) => ({
          bookNoteDayId: day.id,
          idxNo: r.idxNo.slice(0, LIMITS.bookNoteIdxNo.max),
          salesInvoice: r.salesInvoice.slice(0, LIMITS.bookNoteSalesInvoice.max),
          cash: r.cash,
          card: r.card,
          cardReceiptRefLast4: r.cardReceiptRefLast4,
          koko: r.koko,
          bankTransfer: r.bankTransfer,
          splitLines: r.splitLines ?? Prisma.JsonNull,
          orderId: r.orderId,
          sortOrder,
        })),
      });
    }

    return day.id;
  });

  const dayDto = await loadBookNoteDayDto({
    companyId,
    companyLocationId,
    postingDateYmd: postingDate,
    bookNoteDayId: savedDayId,
    writeAccess,
    viewerUserId: userId,
  });

  return NextResponse.json(dayDto);
}
