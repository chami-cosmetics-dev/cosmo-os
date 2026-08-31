import { NextRequest, NextResponse } from "next/server";

import { requireStoreStockCountAccess } from "@/lib/store-stock-count/auth";
import { incrementStoreStockCountBarcode } from "@/lib/store-stock-count/reports";
import { storeStockCountScanSchema } from "@/lib/validation/store-stock-count";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Ctx) {
  const auth = await requireStoreStockCountAccess();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = storeStockCountScanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  const actor = {
    userId: auth.context.user.id,
    name: auth.context.user.name ?? null,
    email: auth.context.user.email ?? null,
  };
  const barcodes = parsed.data.barcodes?.length ? parsed.data.barcodes : [parsed.data.barcode!];
  const results = [];
  const liveStockCache = new Set<string>();

  for (const barcode of barcodes) {
    try {
      const result = await incrementStoreStockCountBarcode({
        companyId: auth.companyId,
        reportId: id,
        barcode,
        actor,
        liveStockCache,
      });
      if (!result) return NextResponse.json({ error: "Report not found" }, { status: 404 });
      results.push({ ok: true, barcode, ...result });
    } catch (err) {
      results.push({ ok: false, barcode, error: err instanceof Error ? err.message : "Could not count barcode" });
    }
  }

  if (!parsed.data.barcodes?.length) {
    const first = results[0];
    if (!first?.ok) return NextResponse.json({ error: first?.error ?? "Could not count barcode" }, { status: 400 });
    return NextResponse.json(first);
  }

  return NextResponse.json({ ok: true, results });
}