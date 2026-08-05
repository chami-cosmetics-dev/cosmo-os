import { NextRequest, NextResponse } from "next/server";

import {
  DAY_LOCKED_CODE,
  isBookNoteWritable,
} from "@/lib/book-notes/lock";
import {
  assertBookNoteShopAllowed,
  resolveBookNoteShopAccess,
} from "@/lib/book-notes/access";
import {
  loadBookNoteDayDto,
  loadBookNoteDaysInRange,
} from "@/lib/book-notes/load";
import { postingDateToUtcMidnight } from "@/lib/book-notes/serialize";
import { prisma } from "@/lib/prisma";
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

  const { companyLocationId, postingDate, rows } = parsed.data;

  if (!isBookNoteWritable(postingDate)) {
    return NextResponse.json(
      {
        error:
          "This sales date is locked. Merchants can only save book notes for today or past dates.",
        code: DAY_LOCKED_CODE,
      },
      { status: 409 },
    );
  }

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

  const location = await prisma.companyLocation.findFirst({
    where: { id: companyLocationId, companyId },
    select: { id: true, name: true, shortName: true, erpnextCompany: true },
  });
  if (!location) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  const cleaned = rows
    .map((r, i) => ({
      idxNo: r.idxNo || String(i + 1),
      salesInvoice: r.salesInvoice.trim(),
      cash: r.cash,
      card: r.card,
      koko: r.koko,
      bankTransfer: r.bankTransfer,
      orderId: r.orderId ?? null,
    }))
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

  await prisma.$transaction(async (tx) => {
    const day = await tx.bookNoteDay.upsert({
      where: {
        companyLocationId_postingDate: {
          companyLocationId,
          postingDate: postingDateUtc,
        },
      },
      create: {
        companyId,
        companyLocationId,
        postingDate: postingDateUtc,
        createdByUserId: userId,
        updatedByUserId: userId,
      },
      update: {
        updatedByUserId: userId,
      },
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
          koko: r.koko,
          bankTransfer: r.bankTransfer,
          orderId: r.orderId,
          sortOrder,
        })),
      });
    }
  });

  const dayDto = await loadBookNoteDayDto({
    companyId,
    companyLocationId,
    postingDateYmd: postingDate,
  });

  return NextResponse.json(dayDto);
}
