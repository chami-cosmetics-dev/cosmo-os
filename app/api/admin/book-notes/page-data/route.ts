import { NextRequest, NextResponse } from "next/server";

import {
  loadBookNoteDayDto,
} from "@/lib/book-notes/load";
import { formatAppIsoDate } from "@/lib/format-datetime";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { bookNotePageDataQuerySchema } from "@/lib/validation/book-notes";

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

  const locations = await prisma.companyLocation.findMany({
    where: { companyId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      shortName: true,
      erpnextCompany: true,
    },
  });

  const today = formatAppIsoDate(new Date());
  let day = null;

  if (parsed.data.companyLocationId && parsed.data.postingDate) {
    const location = locations.find((l) => l.id === parsed.data.companyLocationId);
    if (!location) {
      return NextResponse.json({ error: "Location not found" }, { status: 404 });
    }
    day = await loadBookNoteDayDto({
      companyId,
      companyLocationId: parsed.data.companyLocationId,
      postingDateYmd: parsed.data.postingDate,
    });
  }

  return NextResponse.json({ locations, today, day });
}
