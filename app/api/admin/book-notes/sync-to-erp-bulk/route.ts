import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import {
  postingDateToUtcMidnight,
} from "@/lib/book-notes/serialize";
import { pushBookNoteDayToErp } from "@/lib/book-notes/push-day";
import { formatAppIsoDate } from "@/lib/format-datetime";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { LIMITS } from "@/lib/validation";
import { bookNoteBulkSyncToErpBodySchema } from "@/lib/validation/book-notes";

export const maxDuration = 120;

const BULK_DAY_LIMIT = 80;

function daysBetweenInclusive(fromYmd: string, toYmd: string): number {
  const from = postingDateToUtcMidnight(fromYmd).getTime();
  const to = postingDateToUtcMidnight(toYmd).getTime();
  return Math.floor((to - from) / (24 * 60 * 60 * 1000)) + 1;
}

/**
 * Admin bulk push of saved book-note days to ERP.
 *
 * mode:
 *   - unsynced — never successfully synced (includes failed + never tried)
 *   - failed   — last push failed
 *   - all      — every sheet with rows in the range (full re-sync)
 *
 * Permission: book_notes.admin
 */
export async function POST(request: NextRequest) {
  const auth = await requirePermission("book_notes.admin");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error, code: "AUTH" },
      { status: auth.status },
    );
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account", code: "NO_COMPANY" },
      { status: 404 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "BAD_JSON" },
      { status: 400 },
    );
  }

  const parsed = bookNoteBulkSyncToErpBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid body — need from, to, and mode",
        code: "VALIDATION",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { from, to, mode, companyLocationId } = parsed.data;
  if (daysBetweenInclusive(from, to) > LIMITS.bookNoteRetrieveMaxDays) {
    return NextResponse.json(
      {
        error: `Date range cannot exceed ${LIMITS.bookNoteRetrieveMaxDays} days`,
        code: "RANGE_TOO_WIDE",
      },
      { status: 400 },
    );
  }

  if (companyLocationId) {
    const loc = await prisma.companyLocation.findFirst({
      where: { id: companyLocationId, companyId },
      select: { id: true },
    });
    if (!loc) {
      return NextResponse.json(
        { error: "Shop not found", code: "LOCATION_NOT_FOUND" },
        { status: 404 },
      );
    }
  }

  const statusFilter: Prisma.BookNoteDayWhereInput =
    mode === "failed"
      ? { erpSyncFailedAt: { not: null }, erpSyncedAt: null }
      : mode === "unsynced"
        ? { erpSyncedAt: null }
        : {};

  const days = await prisma.bookNoteDay.findMany({
    where: {
      companyId,
      ...(companyLocationId ? { companyLocationId } : {}),
      postingDate: {
        gte: postingDateToUtcMidnight(from),
        lte: postingDateToUtcMidnight(to),
      },
      rows: { some: {} },
      ...statusFilter,
    },
    orderBy: [{ postingDate: "asc" }, { updatedAt: "asc" }],
    take: BULK_DAY_LIMIT + 1,
    select: {
      id: true,
      companyLocationId: true,
      postingDate: true,
      companyLocation: { select: { name: true, shortName: true } },
    },
  });

  const truncated = days.length > BULK_DAY_LIMIT;
  const batch = truncated ? days.slice(0, BULK_DAY_LIMIT) : days;

  let succeeded = 0;
  let failed = 0;
  const failures: Array<{
    id: string;
    shopName: string;
    postingDate: string;
    error: string;
    code: string;
  }> = [];

  for (const day of batch) {
    const postingDateYmd = formatAppIsoDate(day.postingDate);
    const shopName =
      day.companyLocation.shortName?.trim() || day.companyLocation.name;
    const result = await pushBookNoteDayToErp({
      companyId,
      companyLocationId: day.companyLocationId,
      postingDateYmd,
      bookNoteDayId: day.id,
    });
    if (result.ok) {
      succeeded += 1;
    } else {
      failed += 1;
      if (failures.length < 15) {
        failures.push({
          id: day.id,
          shopName,
          postingDate: postingDateYmd,
          error: result.error,
          code: result.code,
        });
      }
    }
  }

  return NextResponse.json({
    success: true,
    mode,
    from,
    to,
    matched: batch.length,
    truncated,
    limit: BULK_DAY_LIMIT,
    succeeded,
    failed,
    failures,
  });
}
