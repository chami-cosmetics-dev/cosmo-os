import { NextRequest, NextResponse } from "next/server";

import { listMerchantAllocationCounts } from "@/lib/customer-insight/allocation-summary";
import { hasInsightAdminView } from "@/lib/customer-insight/ownership";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  const auth = await requirePermission("contacts.insight.read");
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

  const roleNames = (auth.context!.roleNames as string[]) ?? [];
  const permissionKeys = (auth.context!.permissionKeys as string[]) ?? [];
  if (!hasInsightAdminView({ roleNames, permissionKeys })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const summary = await listMerchantAllocationCounts(companyId);
  return NextResponse.json(summary);
}
