import { redirect } from "next/navigation";

import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { StockRequestsPanel } from "@/components/organisms/stock-requests-panel";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { listStockRequests } from "@/lib/wishlist-buddy/requests";

export const dynamic = "force-dynamic";

export default async function StockRequestsPage() {
  const auth = await requirePermission("stock_requests.read");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return <PermissionDeniedCard />;
  }

  const companyId = auth.context!.user!.companyId;
  if (!companyId) return <PermissionDeniedCard />;

  const canManage = hasPermission(auth.context!, "stock_requests.manage");
  const initialData = await listStockRequests({ companyId, status: "open", page: 1, limit: 25 });

  return <StockRequestsPanel initialData={initialData} canManage={canManage} />;
}
