import { NextRequest, NextResponse } from "next/server";

import { requireStoreStockCountAccess } from "@/lib/store-stock-count/auth";
import { refreshStoreStockCountLiveStock } from "@/lib/store-stock-count/reports";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Ctx) {
  const auth = await requireStoreStockCountAccess();
  if (!auth.ok)
    return NextResponse.json({ error: auth.error }, { status: auth.status });

  let scope: "all" | "counted" = "counted";
  try {
    const body = (await request.json()) as { scope?: string };
    if (body.scope === "all") scope = "all";
  } catch {
    // Empty body defaults to counted items only.
  }

  const { id } = await context.params;
  try {
    const report = await refreshStoreStockCountLiveStock({
      companyId: auth.companyId,
      reportId: id,
      scope,
    });
    if (!report)
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    return NextResponse.json({
      report,
      liveStockAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Could not refresh live stock",
      },
      { status: 502 },
    );
  }
}
