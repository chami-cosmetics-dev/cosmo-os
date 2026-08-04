import { NextRequest, NextResponse } from "next/server";

import {
  companyLabelForLocation,
  shopLabelForLocation,
} from "@/lib/book-notes/serialize";
import { sendBookNoteRowsToErp } from "@/lib/book-notes/erp-verify";
import { loadBookNoteDayDto } from "@/lib/book-notes/load";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { bookNoteSendToErpBodySchema } from "@/lib/validation/book-notes";

/**
 * Push a saved book-note day to ERP ss9 verify Server Script
 * (api_method default: verify_book_note).
 *
 * POST body: { companyLocationId, postingDate }
 * Sends form_dict: rows_json, company, posting_date
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

  const location = await prisma.companyLocation.findFirst({
    where: { id: companyLocationId, companyId, isMainCompany: false },
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

  const company = companyLabelForLocation(location);
  const result = await sendBookNoteRowsToErp({
    erpnextInstance: location.erpnextInstance,
    company,
    postingDate,
    rows: day.rows.map((r) => ({
      idx_no: r.idx_no,
      sales_invoice: r.sales_invoice,
      cash: r.cash,
      card: r.card,
      koko: r.koko,
      bank_transfer: r.bank_transfer,
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

  return NextResponse.json({
    success: true,
    method: result.method,
    company: result.company,
    erpUrl: result.erpUrl,
    posting_date: postingDate,
    locationName: shopLabel,
    summary: result.summary,
    rows: result.rows,
  });
}
