import { NextRequest, NextResponse } from "next/server";

import { syncErpLoyaltyGroupsToOs } from "@/lib/customer-insight/erp-loyalty";
import { requireAnyPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Pull ERP Customer Group Gold/Platinum onto matching OS contacts.
 * Read from ERP only — never writes loyalty back to ERP.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAnyPermission([
    "contacts.master.manage",
    "contacts.insight.admin_view",
  ]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const sp = request.nextUrl.searchParams;
  const pageSize = Math.min(
    Math.max(Number.parseInt(sp.get("pageSize") ?? "200", 10) || 200, 20),
    200
  );
  const maxPages = Math.min(
    Math.max(Number.parseInt(sp.get("maxPages") ?? "20", 10) || 20, 1),
    30
  );

  try {
    const stats = await syncErpLoyaltyGroupsToOs(companyId, { pageSize, maxPages });
    return NextResponse.json({ ok: true, ...stats });
  } catch (error) {
    console.error("[erp-loyalty-sync] failed", error);
    return NextResponse.json({ error: "ERP loyalty sync failed" }, { status: 500 });
  }
}
