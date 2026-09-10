import { NextRequest, NextResponse } from "next/server";

import { resolveBookNoteShopAccess } from "@/lib/book-notes/access";
import { loadBookNoteReceiptGallery } from "@/lib/book-notes/load";
import { requirePermission } from "@/lib/rbac";
import { bookNoteReceiptGalleryQuerySchema } from "@/lib/validation/book-notes";

export const dynamic = "force-dynamic";

/**
 * Finance view of merchant-uploaded receipt photos, filtered by outlet and
 * posting-date range. Read-only — uploading and deleting stay with merchants.
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
  const parsed = bookNoteReceiptGalleryQuerySchema.safeParse({
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

  const items = await loadBookNoteReceiptGallery({
    companyId,
    companyLocationId,
    fromYmd: from,
    toYmd: to,
  });

  return NextResponse.json({ locations: access.locations, items });
}
