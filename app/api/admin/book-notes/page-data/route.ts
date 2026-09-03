import { NextRequest, NextResponse } from "next/server";

import {
  assertBookNoteShopAllowed,
  resolveBookNoteShopAccess,
  resolveBookNoteWriteAccess,
} from "@/lib/book-notes/access";
import {
  loadBookNoteDayDto,
  loadBookNoteHistory,
} from "@/lib/book-notes/load";
import { formatAppIsoDate } from "@/lib/format-datetime";
import { requirePermission } from "@/lib/rbac";
import { bookNotePageDataQuerySchema } from "@/lib/validation/book-notes";

export async function GET(request: NextRequest) {
  const auth = await requirePermission("book_notes.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  const userId = auth.context!.user?.id ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 },
    );
  }

  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = bookNotePageDataQuerySchema.safeParse({
    companyLocationId: raw.companyLocationId || undefined,
    postingDate: raw.postingDate || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const access = await resolveBookNoteShopAccess(auth.context!, companyId);
  const writeAccess = resolveBookNoteWriteAccess(auth.context!);
  const locations = access.locations;
  const allowedIds = locations.map((l) => l.id);
  const today = formatAppIsoDate(new Date());
  const canBackdateBookNotes = writeAccess.canBackdate;

  let day = null;
  let history: Awaited<ReturnType<typeof loadBookNoteHistory>> = [];

  const locationId = parsed.data.companyLocationId;
  if (locationId && !assertBookNoteShopAllowed(access, locationId)) {
    return NextResponse.json(
      { error: "Shop not allowed for your account", code: "SHOP_FORBIDDEN" },
      { status: 403 },
    );
  }

  if (allowedIds.length > 0 && userId) {
    history = await loadBookNoteHistory({
      companyId,
      createdByUserId: userId,
      companyLocationIds: allowedIds,
      writeAccess,
    });
  }

  if (locationId && parsed.data.postingDate) {
    day = await loadBookNoteDayDto({
      companyId,
      companyLocationId: locationId,
      postingDateYmd: parsed.data.postingDate,
      writeAccess,
    });
  }

  return NextResponse.json({
    locations,
    canAccessAllShops: access.canAccessAllShops,
    canBackdateBookNotes,
    today,
    day,
    history,
  });
}
