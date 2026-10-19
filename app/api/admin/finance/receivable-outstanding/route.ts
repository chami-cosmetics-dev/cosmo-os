import { NextRequest, NextResponse } from "next/server";

import { defaultSupplierPayablesReportDate } from "@/lib/supplier-payables";
import { loadCachedReceivables } from "@/lib/receivable-outstanding";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const context = await getCurrentUserContext();
  if (!context?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(context, "finance.receivable_outstanding.read")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = context.user.companyId;
  if (!companyId) return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  const reportDate = request.nextUrl.searchParams.get("reportDate") ?? defaultSupplierPayablesReportDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) return NextResponse.json({ error: "Invalid reportDate" }, { status: 400 });
  return NextResponse.json(await loadCachedReceivables(companyId, reportDate));
}
