import { NextRequest, NextResponse } from "next/server";

import {
  assertBookNoteShopAllowed,
  resolveBookNoteShopAccess,
  resolveBookNoteViewScope,
} from "@/lib/book-notes/access";
import { loadBookNoteDayDto } from "@/lib/book-notes/load";
import { pushBookNoteDayToErp } from "@/lib/book-notes/push-day";
import { shopLabelForLocation } from "@/lib/book-notes/serialize";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { bookNoteSendToErpBodySchema } from "@/lib/validation/book-notes";

/**
 * Push a saved book-note day to ERP ss9 verify Server Script
 * (api_method default: verify_book_note).
 *
 * POST body: { companyLocationId, postingDate, bookNoteDayId? }
 * Permission: book_notes.manage
 */
export async function POST(request: NextRequest) {
  const auth = await requirePermission("book_notes.manage");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error, code: "AUTH", step: "auth" },
      { status: auth.status },
    );
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      {
        error: "No company associated with your account",
        code: "NO_COMPANY",
        step: "auth",
      },
      { status: 404 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "BAD_JSON", step: "validate" },
      { status: 400 },
    );
  }

  const parsed = bookNoteSendToErpBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid body — need companyLocationId and postingDate (YYYY-MM-DD)",
        code: "VALIDATION",
        step: "validate",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { companyLocationId, postingDate, bookNoteDayId } = parsed.data;

  const access = await resolveBookNoteShopAccess(auth.context!, companyId);
  if (!assertBookNoteShopAllowed(access, companyLocationId)) {
    return NextResponse.json(
      {
        error: "Shop not allowed for your account",
        code: "SHOP_FORBIDDEN",
        step: "auth",
      },
      { status: 403 },
    );
  }

  const location = await prisma.companyLocation.findFirst({
    where: { id: companyLocationId, companyId },
    select: {
      id: true,
      name: true,
      shortName: true,
    },
  });
  if (!location) {
    return NextResponse.json(
      {
        error: `Shop not found for id ${companyLocationId}`,
        code: "LOCATION_NOT_FOUND",
        step: "load_location",
      },
      { status: 404 },
    );
  }

  const shopLabel = shopLabelForLocation(location);

  // Withheld days come back with no rows, so a merchant cannot push a sheet
  // they were never allowed to see.
  const viewScope = await resolveBookNoteViewScope(auth.context!);
  const viewerUserId = auth.context!.user?.id ?? null;
  const day = await loadBookNoteDayDto({
    companyId,
    companyLocationId,
    postingDateYmd: postingDate,
    bookNoteDayId,
    ownerUserId: bookNoteDayId ? undefined : viewerUserId,
    viewScope,
    viewerUserId,
  });
  if (day?.restricted) {
    return NextResponse.json(
      {
        error: `${day.enteredBy ?? "Another merchant"} entered this shop's book note for ${postingDate}. Only they or finance can send it to ERP.`,
        code: "DAY_NOT_YOURS",
        step: "load_day",
        locationName: shopLabel,
        postingDate,
      },
      { status: 403 },
    );
  }
  if (!day || day.rows.length === 0) {
    return NextResponse.json(
      {
        error: `No saved rows for shop "${shopLabel}" on ${postingDate}. Save/send from an editable day with invoice lines first.`,
        code: "NO_SAVED_ROWS",
        step: "load_day",
        locationName: shopLabel,
        postingDate,
      },
      { status: 400 },
    );
  }

  const result = await pushBookNoteDayToErp({
    companyId,
    companyLocationId,
    postingDateYmd: postingDate,
    bookNoteDayId: day.id,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        code: result.code,
        step: result.step,
        method: result.method,
        company: result.company,
        erpUrl: result.erpUrl,
        httpStatus: result.httpStatus,
        locationName: result.locationName ?? shopLabel,
        postingDate: result.postingDate ?? postingDate,
        rowCount: result.rowCount,
        raw: result.raw,
      },
      { status: result.status },
    );
  }

  return NextResponse.json({
    success: true,
    method: result.method,
    company: result.company,
    erpUrl: result.erpUrl,
    book_note_id: result.bookNoteDayId,
    posting_date: result.postingDate,
    locationName: result.locationName,
    summary: result.summary,
    rows: result.rows,
    receiptUpload: result.receiptUpload,
  });
}
