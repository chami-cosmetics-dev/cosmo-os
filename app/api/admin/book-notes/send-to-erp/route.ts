import { NextRequest, NextResponse } from "next/server";

import { companyLabelForLocation } from "@/lib/book-notes/serialize";
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
 * Permission: book_notes.manage
 */
export async function POST(request: NextRequest) {
  const auth = await requirePermission("book_notes.manage");
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bookNoteSendToErpBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { companyLocationId, postingDate } = parsed.data;

  const location = await prisma.companyLocation.findFirst({
    where: { id: companyLocationId, companyId },
    select: {
      id: true,
      name: true,
      erpnextCompany: true,
      erpnextInstance: true,
    },
  });
  if (!location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  const day = await loadBookNoteDayDto({
    companyId,
    companyLocationId,
    postingDateYmd: postingDate,
  });
  if (!day || day.rows.length === 0) {
    return NextResponse.json(
      { error: "Save the book note first, then send to ERP" },
      { status: 400 },
    );
  }

  const company = companyLabelForLocation(location);
  const result = await sendBookNoteRowsToErp({
    erpnextInstance: location.erpnextInstance,
    company,
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
        method: result.method,
        company: result.company,
        raw: result.rawMessage,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    success: true,
    method: result.method,
    company: result.company,
    posting_date: postingDate,
    summary: result.summary,
    rows: result.rows,
  });
}
