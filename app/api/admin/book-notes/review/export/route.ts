import { NextRequest, NextResponse } from "next/server";

import { resolveBookNoteShopAccess } from "@/lib/book-notes/access";
import {
  bookNoteCompanyExportFilename,
  buildBookNoteCompanyWorkbook,
} from "@/lib/book-notes/export-company";
import {
  BOOK_NOTE_EXPORT_MAX_DAYS,
  loadBookNoteFinanceReview,
} from "@/lib/book-notes/finance-review";
import { requirePermission } from "@/lib/rbac";
import { bookNoteFinanceReviewQuerySchema } from "@/lib/validation/book-notes";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Excel export of merchant book notes for the finance date range.
 * One sheet per ERP company, plus a Summary sheet of company totals.
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
  const parsed = bookNoteFinanceReviewQuerySchema.safeParse({
    companyLocationId: raw.companyLocationId || undefined,
    from: raw.from,
    to: raw.to,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const access = await resolveBookNoteShopAccess(auth.context!, companyId);
  const { companyLocationId, from, to } = parsed.data;

  if (
    companyLocationId &&
    !access.locations.some((l) => l.id === companyLocationId)
  ) {
    return NextResponse.json(
      { error: "Shop not found in your company", code: "SHOP_FORBIDDEN" },
      { status: 403 },
    );
  }

  const review = await loadBookNoteFinanceReview({
    companyId,
    companyLocationId,
    fromYmd: from,
    toYmd: to,
    maxDays: BOOK_NOTE_EXPORT_MAX_DAYS,
  });

  const buffer = buildBookNoteCompanyWorkbook({
    days: review.days,
    truncated: review.truncated,
    maxDays: BOOK_NOTE_EXPORT_MAX_DAYS,
  });
  const filename = bookNoteCompanyExportFilename(from, to);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
