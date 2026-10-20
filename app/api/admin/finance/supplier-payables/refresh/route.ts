import { NextRequest, NextResponse } from "next/server";

import {
  defaultSupplierPayablesReportDate,
  refreshSupplierPayables,
} from "@/lib/supplier-payables";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function POST(request: NextRequest) {
  const context = await getCurrentUserContext();
  if (!context?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (
    !hasPermission(context, "finance.supplier_payables.read") &&
    !hasPermission(context, "purchasing.purchase_history.read")
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const companyId = context.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const reportDate =
    typeof body.reportDate === "string" ? body.reportDate : defaultSupplierPayablesReportDate();
  if (!isDateOnly(reportDate)) {
    return NextResponse.json({ error: "Invalid reportDate" }, { status: 400 });
  }

  const loaded = await refreshSupplierPayables(companyId, reportDate);
  return NextResponse.json(loaded);
}
