import { NextRequest, NextResponse } from "next/server";

import { fetchBookNoteIssuesFromErps } from "@/lib/book-notes/erp-issues";
import { requirePermission } from "@/lib/rbac";
import { bookNoteIssuesQuerySchema } from "@/lib/validation/book-notes";

export const dynamic = "force-dynamic";

/**
 * Live book-note verification issues from every linked ERP instance.
 * Read-only; ERP re-verifies on each call so fixed rows auto-disappear.
 */
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
  const parsed = bookNoteIssuesQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { date_from, date_to, status, include_resolved } = parsed.data;
  const aggregate = await fetchBookNoteIssuesFromErps(companyId, {
    dateFrom: date_from,
    dateTo: date_to,
    status,
    includeResolved: include_resolved === true,
  });

  return NextResponse.json(aggregate);
}
