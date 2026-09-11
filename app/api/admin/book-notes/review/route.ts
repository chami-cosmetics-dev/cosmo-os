import { NextRequest, NextResponse } from "next/server";

import { resolveBookNoteShopAccess } from "@/lib/book-notes/access";
import { loadBookNoteFinanceReview } from "@/lib/book-notes/finance-review";
import { requirePermission } from "@/lib/rbac";
import { bookNoteFinanceReviewQuerySchema } from "@/lib/validation/book-notes";

export const dynamic = "force-dynamic";

/**
 * Finance review of merchant book notes: per-day payment totals, invoice rows,
 * uploaded slips and who submitted each sheet, filtered by outlet and
 * posting-date range. Read-only — entry and ERP send stay with merchants.
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
  });

  return NextResponse.json({ locations: access.locations, ...review });
}
