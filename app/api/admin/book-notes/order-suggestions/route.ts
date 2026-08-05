import { NextRequest, NextResponse } from "next/server";

import {
  assertBookNoteShopAllowed,
  resolveBookNoteShopAccess,
} from "@/lib/book-notes/access";
import { searchBookNoteOrderSuggestions } from "@/lib/book-notes/order-suggestions";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { bookNoteSuggestionsQuerySchema } from "@/lib/validation/book-notes";

export async function GET(request: NextRequest) {
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

  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = bookNoteSuggestionsQuerySchema.safeParse({
    companyLocationId: raw.companyLocationId,
    q: raw.q,
    postingDate: raw.postingDate || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const access = await resolveBookNoteShopAccess(auth.context!, companyId);
  if (!assertBookNoteShopAllowed(access, parsed.data.companyLocationId)) {
    return NextResponse.json(
      { error: "Shop not allowed for your account", code: "SHOP_FORBIDDEN" },
      { status: 403 },
    );
  }

  const location = await prisma.companyLocation.findFirst({
    where: { id: parsed.data.companyLocationId, companyId },
    select: { id: true },
  });
  if (!location) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  const suggestions = await searchBookNoteOrderSuggestions({
    companyId,
    companyLocationId: parsed.data.companyLocationId,
    q: parsed.data.q,
    postingDate: parsed.data.postingDate,
  });

  return NextResponse.json({ suggestions });
}
