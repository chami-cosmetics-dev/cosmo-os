import { NextRequest, NextResponse } from "next/server";

import { getMerchantDashboardPageData } from "@/lib/page-data/merchant-dashboard";
import {
  canAccessMerchantDashboard,
  isCompanyAdminRole,
} from "@/lib/merchant-role";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";
import { merchantDashboardPageDataQuerySchema } from "@/lib/validation/merchant-dashboard";

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
  const parsed = merchantDashboardPageDataQuerySchema.safeParse({
    merchantUserId: raw.merchantUserId || undefined,
    yearMonth: raw.yearMonth || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const viewerIsAdmin = isCompanyAdminRole(roleNames);
  const data = await getMerchantDashboardPageData({
    companyId,
    viewerUserId: context.user.id,
    viewerIsAdmin,
    canManageTargets:
      viewerIsAdmin || hasPermission(context, "dashboard.merchant_targets.manage"),
    selectedMerchantId: viewerIsAdmin ? parsed.data.merchantUserId : context.user.id,
    yearMonth: parsed.data.yearMonth,
  });

  if ("error" in data) {
    return NextResponse.json({ error: data.error }, { status: data.status });
  }

  return NextResponse.json(data);
}
