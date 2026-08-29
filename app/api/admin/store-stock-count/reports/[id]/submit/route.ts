import { NextRequest, NextResponse } from "next/server";

import { submitStoreStockCountReport } from "@/lib/store-stock-count/reports";
import { requireStoreStockCountAccess } from "@/lib/store-stock-count/auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, context: Ctx) {
  const auth = await requireStoreStockCountAccess();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await context.params;
  const report = await submitStoreStockCountReport({
    companyId: auth.companyId,
    reportId: id,
    actor: {
      userId: auth.context.user.id,
      name: auth.context.user.name ?? null,
      email: auth.context.user.email ?? null,
    },
  });
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  return NextResponse.json({ report });
}
