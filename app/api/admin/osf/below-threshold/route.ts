import { NextRequest, NextResponse } from "next/server";

import { listBelowThresholdSkus } from "@/lib/osf/below-threshold-skus";
import { OsfErpError } from "@/lib/osf/erp-stock";
import { requirePermission } from "@/lib/rbac";
import { osfBelowThresholdQuerySchema } from "@/lib/validation/osf";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const auth = await requirePermission("purchasing.osf.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const companyId = auth.context!.user!.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = osfBelowThresholdQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const items = await listBelowThresholdSkus(companyId, {
      maxPercent: parsed.data.percent,
      q: parsed.data.q,
      limit: parsed.data.limit,
    });
    return NextResponse.json({
      items,
      total: items.length,
      percent: parsed.data.percent,
    });
  } catch (err) {
    if (err instanceof OsfErpError) {
      return NextResponse.json(
        { error: "ERP unreachable", code: "ERP_UNAVAILABLE", detail: err.message },
        { status: 502 },
      );
    }
    console.error("[OSF below-threshold]", err);
    return NextResponse.json({ error: "Failed to list SKUs below % of ROP" }, { status: 500 });
  }
}
