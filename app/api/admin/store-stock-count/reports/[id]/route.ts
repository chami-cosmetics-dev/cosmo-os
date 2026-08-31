import { NextRequest, NextResponse } from "next/server";

import {
  deleteStoreStockCountReport,
  getStoreStockCountReport,
  saveStoreStockCountReport,
} from "@/lib/store-stock-count/reports";
import { requireStoreStockCountAccess } from "@/lib/store-stock-count/auth";
import { storeStockCountSaveCountsSchema } from "@/lib/validation/store-stock-count";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Ctx) {
  const auth = await requireStoreStockCountAccess();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await context.params;
  const report = await getStoreStockCountReport({
    companyId: auth.companyId,
    reportId: id,
    viewerUserId: auth.context.user.id,
  });
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  return NextResponse.json({ report });
}

export async function PATCH(request: NextRequest, context: Ctx) {
  const auth = await requireStoreStockCountAccess();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = storeStockCountSaveCountsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  const light = request.nextUrl.searchParams.get("light") === "1";
  try {
    const report = await saveStoreStockCountReport({
      companyId: auth.companyId,
      reportId: id,
      items: parsed.data.items,
      reload: !light,
      actor: {
        userId: auth.context.user.id,
        name: auth.context.user.name ?? null,
        email: auth.context.user.email ?? null,
      },
    });
    if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });
    if (light) return NextResponse.json({ ok: true, report });
    return NextResponse.json({ report });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save report" },
      { status: 400 },
    );
  }
}
export async function DELETE(_request: NextRequest, context: Ctx) {
  const auth = await requireStoreStockCountAccess();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await context.params;
  const deleted = await deleteStoreStockCountReport({ companyId: auth.companyId, reportId: id });
  if (!deleted) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  return new NextResponse(null, { status: 204 });
}
