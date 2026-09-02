import { NextRequest, NextResponse } from "next/server";

import {
  companyLabelForLocation,
  shopLabelForLocation,
} from "@/lib/book-notes/serialize";
import {
  assertBookNoteShopAllowed,
  resolveBookNoteShopAccess,
} from "@/lib/book-notes/access";
import { sendBookNoteRowsToErp } from "@/lib/book-notes/erp-verify";
import { loadBookNoteDayDto } from "@/lib/book-notes/load";
import { bookNoteRowUsesSplitPayload } from "@/lib/book-notes/split-lines";
import {
  collectBookNoteNamesFromVerifyRows,
  loadReceiptsForDay,
  pushDayReceiptsToErp,
} from "@/lib/book-notes/receipts";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { bookNoteSendToErpBodySchema } from "@/lib/validation/book-notes";

/**
 * Push a saved book-note day to ERP ss9 verify Server Script
 * (api_method default: verify_book_note).
 *
 * POST body: { companyLocationId, postingDate }
 * Sends form_dict: book_note_id, rows_json, company, posting_date
 * (ERP script derives outlet from API user full_name).
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

  const { companyLocationId, postingDate } = parsed.data;

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
      erpnextCompany: true,
      erpnextInstance: true,
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

  if (!location.erpnextInstance) {
    return NextResponse.json(
      {
        error: `Shop "${shopLabel}" has no ErpnextInstance linked. Link ERP credentials on this shop before Send to ERP.`,
        code: "ERP_INSTANCE_MISSING",
        step: "load_location",
        locationName: shopLabel,
      },
      { status: 400 },
    );
  }

  const day = await loadBookNoteDayDto({
    companyId,
    companyLocationId,
    postingDateYmd: postingDate,
  });
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

  for (const r of day.rows) {
    if (bookNoteRowUsesSplitPayload(r.split_lines)) continue;
    if (r.card > 0 && !r.card_receipt_ref_last4) {
      return NextResponse.json(
        {
          error: `Row ${r.idx_no || "?"} (${r.sales_invoice || "no invoice"}): card amount entered but card receipt last 4 digits missing. Open the day, fill Last 4 ref, save, then send again.`,
          code: "CARD_REF_MISSING",
          step: "validate",
          locationName: shopLabel,
          postingDate,
        },
        { status: 400 },
      );
    }
  }

  const company = companyLabelForLocation(location);
  const result = await sendBookNoteRowsToErp({
    erpnextInstance: location.erpnextInstance,
    bookNoteId: day.id,
    company,
    postingDate,
    rows: day.rows.map((r) => ({
      idx_no: r.idx_no,
      sales_invoice: r.sales_invoice,
      cash: r.cash,
      card: r.card,
      card_last_4: r.card_receipt_ref_last4,
      koko: r.koko,
      bank_transfer: r.bank_transfer,
      split_lines: r.split_lines,
    })),
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error ?? "ERP verify failed",
        code: result.code ?? "ERP_UNKNOWN",
        step: "erp_call",
        method: result.method,
        company: result.company,
        erpUrl: result.erpUrl,
        httpStatus: result.httpStatus,
        locationName: shopLabel,
        postingDate,
        rowCount: day.rows.length,
        raw: result.rawMessage,
      },
      { status: 502 },
    );
  }

  // After verify, attach day-level receipt photos to each Book Note Entry
  // docname (ss9 book_note_name) so bank-recon INFO can show them (ss5).
  const bookNoteNames = collectBookNoteNamesFromVerifyRows(result.rows);
  const receipts = await loadReceiptsForDay({
    companyId,
    companyLocationId,
    postingDateYmd: postingDate,
  });
  let receiptUpload = null;
  if (receipts.length > 0 && bookNoteNames.length > 0) {
    receiptUpload = await pushDayReceiptsToErp({
      erpnextInstance: location.erpnextInstance,
      bookNoteNames,
      receipts,
    });
  } else if (receipts.length > 0 && bookNoteNames.length === 0) {
    receiptUpload = {
      receiptCount: receipts.length,
      bookNoteCount: 0,
      uploaded: 0,
      failed: 0,
      errors: [
        "Receipts saved in Cosmo but ERP returned no book_note_name — deploy updated ss9_verify_book_note.py",
      ],
    };
  }

  return NextResponse.json({
    success: true,
    method: result.method,
    company: result.company,
    erpUrl: result.erpUrl,
    book_note_id: day.id,
    posting_date: postingDate,
    locationName: shopLabel,
    summary: result.summary,
    rows: result.rows,
    receiptUpload,
  });
}
