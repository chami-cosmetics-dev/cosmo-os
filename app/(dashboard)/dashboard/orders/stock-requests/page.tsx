import { redirect } from "next/navigation";

import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { StockRequestsPanel } from "@/components/organisms/stock-requests-panel";
import { requireAnyPermission } from "@/lib/rbac";
import { canViewScope, viewerFromPermissions, type StockRequestScope } from "@/lib/wishlist-buddy/access";
import { listStockRequests } from "@/lib/wishlist-buddy/requests";

export const dynamic = "force-dynamic";

export default async function StockRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const auth = await requireAnyPermission([
    "stock_requests.read",
    "stock_requests.create",
    "stock_requests.read_all",
  ]);
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return <PermissionDeniedCard />;
  }

  const user = auth.context.user;
  if (!user?.companyId || !user.id) return <PermissionDeniedCard />;

  const viewer = viewerFromPermissions({
    userId: user.id,
    roleNames: auth.context.roleNames as string[],
    permissionKeys: auth.context.permissionKeys as string[],
  });

  const tabParam = (await searchParams).tab;
  const requested: StockRequestScope =
    tabParam === "mine" ? "mine" : tabParam === "staff" ? "staff" : "web";
  const initialTab: StockRequestScope = canViewScope(viewer, requested)
    ? requested
    : ((["web", "mine", "staff"] as const).find((scope) => canViewScope(viewer, scope)) ?? "web");

  const initialData = await listStockRequests({
    companyId: user.companyId,
    viewer,
    scope: initialTab,
    status: "open",
    page: 1,
    limit: 25,
  });

  return (
    <StockRequestsPanel
      viewer={{
        userId: viewer.userId,
        isAdmin: viewer.isAdmin,
        canViewWeb: viewer.canViewWeb,
        canManageWeb: viewer.canManageWeb,
        canCreate: viewer.canCreate,
        canViewAllStaff: viewer.canViewAllStaff,
      }}
      initialTab={initialTab}
      initialData={initialData}
    />
  );
}
