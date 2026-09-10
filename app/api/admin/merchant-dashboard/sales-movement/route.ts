import { NextRequest, NextResponse } from "next/server";

import {
  canAccessMerchantDashboard,
  hasMerchantDashboardAdminView,
} from "@/lib/merchant-role";
import { fetchMerchantSalesMovement } from "@/lib/page-data/merchant-dashboard-sales-movement";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";
import { merchantDashboardSalesMovementQuerySchema } from "@/lib/validation/merchant-dashboard";

export async function GET(request: NextRequest) {
  const context = await getCurrentUserContext();
  if (!context?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const roleNames = (context.roleNames ?? []) as string[];
  const allowed =
    canAccessMerchantDashboard(roleNames) ||
    hasPermission(context, "dashboard.merchant_view");
  if (!allowed) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const companyId = context.user.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 },
    );
  }

  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = merchantDashboardSalesMovementQuerySchema.safeParse({
    merchantUserId: raw.merchantUserId || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const viewerIsAdmin = hasMerchantDashboardAdminView({
    roleNames,
    permissionKeys: context.permissionKeys as string[] | undefined,
  });
  const merchantUserId = viewerIsAdmin
    ? (parsed.data.merchantUserId ?? context.user.id)
    : context.user.id;

  const data = await fetchMerchantSalesMovement(companyId, merchantUserId);
  return NextResponse.json(data);
}
