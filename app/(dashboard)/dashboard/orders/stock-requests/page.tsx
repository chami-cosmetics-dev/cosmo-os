import { redirect } from "next/navigation";

import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import {
  StockRequestsPanel,
  type StockRequestsPageTab,
} from "@/components/organisms/stock-requests-panel";
import {
  canAdminNewItemRequests,
  canManageNewItemRequests,
  NEW_ITEM_REQUESTS_ANY_PERMISSION,
} from "@/lib/new-item-requests/permissions";
import { listBrandGroups, listCompanyRequests } from "@/lib/new-item-requests/store";
import { requireAnyPermission } from "@/lib/rbac";
import { canViewScope, viewerFromPermissions, type StockRequestScope } from "@/lib/wishlist-buddy/access";
import { listStockRequests } from "@/lib/wishlist-buddy/requests";

export const dynamic = "force-dynamic";

const STOCK_REQUEST_PAGE_PERMISSIONS = [
  "stock_requests.read",
  "stock_requests.create",
  "stock_requests.read_all",
  ...NEW_ITEM_REQUESTS_ANY_PERMISSION,
] as const;

const STOCK_SCOPES: StockRequestScope[] = ["web", "mine", "staff"];

function requestedStockScope(tabParam: string | undefined): StockRequestScope | null {
  if (tabParam === "mine" || tabParam === "staff" || tabParam === "web") return tabParam;
  return null;
}

export default async function StockRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const auth = await requireAnyPermission([...STOCK_REQUEST_PAGE_PERMISSIONS]);
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
  const canNewItems = canManageNewItemRequests(auth.context);
  const isNewItemAdmin = canAdminNewItemRequests(auth.context);

  const tabParam = (await searchParams).tab;
  const requested = requestedStockScope(tabParam);
  const firstStock = STOCK_SCOPES.find((scope) => canViewScope(viewer, scope));

  let initialTab: StockRequestsPageTab;
  if (tabParam === "new-items" && canNewItems) {
    initialTab = "new-items";
  } else if (requested && canViewScope(viewer, requested)) {
    initialTab = requested;
  } else if (firstStock) {
    initialTab = firstStock;
  } else if (canNewItems) {
    initialTab = "new-items";
  } else {
    return <PermissionDeniedCard />;
  }

  const filters = { status: "open" as const };
  const [initialData, initialRequests, initialBrands] = await Promise.all([
    isStockScope(initialTab)
      ? listStockRequests({
          companyId: user.companyId,
          viewer,
          scope: initialTab,
          status: "open",
          page: 1,
          limit: 25,
        })
      : Promise.resolve(null),
    canNewItems ? listCompanyRequests(auth.context, filters) : Promise.resolve([]),
    canNewItems && isNewItemAdmin ? listBrandGroups(auth.context, filters) : Promise.resolve([]),
  ]);

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
      newItemRequests={
        canNewItems
          ? { isAdmin: isNewItemAdmin, initialRequests, initialBrands }
          : null
      }
    />
  );
}

function isStockScope(tab: StockRequestsPageTab): tab is StockRequestScope {
  return tab === "web" || tab === "mine" || tab === "staff";
}
