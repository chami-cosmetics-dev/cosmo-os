import { NextRequest, NextResponse } from "next/server";

import { listLoyaltyEligiblePending } from "@/lib/customer-insight/loyalty-eligible-summary";
import { hasInsightAdminView } from "@/lib/customer-insight/ownership";
import { requirePermission } from "@/lib/rbac";
import { customerInsightLoyaltyEligibleListQuerySchema } from "@/lib/validation/customer-insight";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requirePermission("contacts.insight.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const roleNames = (auth.context!.roleNames as string[]) ?? [];
  const permissionKeys = (auth.context!.permissionKeys as string[]) ?? [];
  if (!hasInsightAdminView({ roleNames, permissionKeys })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const sp = request.nextUrl.searchParams;
  const parsed = customerInsightLoyaltyEligibleListQuerySchema.safeParse({
    page: sp.get("page") ?? undefined,
    pageSize: sp.get("pageSize") ?? undefined,
    assignedMerchant: sp.get("assignedMerchant") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const result = await listLoyaltyEligiblePending({
    companyId,
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    assignedMerchant: parsed.data.assignedMerchant,
  });
  return NextResponse.json(result);
}
