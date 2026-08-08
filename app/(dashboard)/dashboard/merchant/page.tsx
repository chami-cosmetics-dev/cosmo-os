import { redirect } from "next/navigation";

import { MerchantDashboardPanel } from "@/app/(dashboard)/dashboard/merchant/merchant-dashboard-panel";
import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import {
  canAccessMerchantDashboard,
  isCompanyAdminRole,
  userHasMerchantRole,
} from "@/lib/merchant-role";
import { getMerchantDashboardPageData } from "@/lib/page-data/merchant-dashboard";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function MerchantDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ merchantUserId?: string; yearMonth?: string }>;
}) {
  const context = await getCurrentUserContext();
  if (!context?.user) {
    redirect("/login");
  }

  const roleNames = (context.roleNames ?? []) as string[];
  const allowed =
    canAccessMerchantDashboard(roleNames) ||
    hasPermission(context, "dashboard.merchant_view");
  if (!allowed) {
    return <PermissionDeniedCard />;
  }

  const companyId = context.user.companyId ?? null;
  if (!companyId) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const viewerIsAdmin = isCompanyAdminRole(roleNames);
  const data = await getMerchantDashboardPageData({
    companyId,
    viewerUserId: context.user.id,
    viewerIsAdmin,
    canManageTargets:
      viewerIsAdmin || hasPermission(context, "dashboard.merchant_targets.manage"),
    selectedMerchantId: viewerIsAdmin
      ? params.merchantUserId
      : context.user.id,
    yearMonth: params.yearMonth,
  });

  if ("error" in data) {
    if (data.status === 403 && !userHasMerchantRole(roleNames) && !viewerIsAdmin) {
      return <PermissionDeniedCard />;
    }
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm">
        <p className="font-medium">Merchant dashboard</p>
        <p className="text-muted-foreground mt-2">{data.error}</p>
      </div>
    );
  }

  return <MerchantDashboardPanel initialData={data} />;
}
