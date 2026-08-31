import { NextRequest, NextResponse } from "next/server";

import {
  createStoreStockCountReport,
  listStoreStockCountReports,
} from "@/lib/store-stock-count/reports";
import { requireStoreStockCountAccess } from "@/lib/store-stock-count/auth";
import { storeStockCountCreateReportSchema } from "@/lib/validation/store-stock-count";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  const auth = await requireStoreStockCountAccess();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const reports = await listStoreStockCountReports(auth.companyId);
  return NextResponse.json({ reports });
}

export async function POST(request: NextRequest) {
  const auth = await requireStoreStockCountAccess();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = storeStockCountCreateReportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const report = await createStoreStockCountReport({
      companyId: auth.companyId,
      title: parsed.data.title,
      companies: parsed.data.companies,
      warehouses: parsed.data.warehouses,
      actor: {
        userId: auth.context.user.id,
        name: auth.context.user.name ?? null,
        email: auth.context.user.email ?? null,
      },
    });
    return NextResponse.json({ report });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create report" },
      { status: 502 },
    );
  }
}
