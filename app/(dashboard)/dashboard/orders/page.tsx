import { redirect } from "next/navigation";

import { OrdersPanel } from "@/components/organisms/orders-panel";
import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { FulfillmentPermissionsProvider } from "@/components/contexts/fulfillment-permissions-context";
import {
  getRevertPermissionKeys,
  buildFulfillmentPermissions,
} from "@/lib/fulfillment-permissions";
import { fetchOrdersPageData } from "@/lib/page-data/orders";
import { hasPermission, requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const auth = await requirePermission("orders.read");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return <PermissionDeniedCard />;
  }

  const companyId = auth.context!.user!.companyId;
  if (!companyId) {
    return <PermissionDeniedCard />;
  }

  const permissions = buildFulfillmentPermissions(auth.context);
  const revertPermissionKeys = getRevertPermissionKeys(auth.context);
  const canManageFinanceApprovals = hasPermission(auth.context!, "finance.approvals.manage");
  const canRevertPaid = hasPermission(auth.context!, "finance.hod.revert_paid_to_unpaid");
  const initialData = await fetchOrdersPageData(companyId, {
    page: 1,
    limit: 10,
    sortOrder: "desc",
  });

  return (
    <FulfillmentPermissionsProvider permissions={permissions}>
      <OrdersPanel
        canPrint={permissions.canPrint}
        canResendRiderSms={permissions.canResendRiderSms}
        revertPermissionKeys={revertPermissionKeys}
        canManageFinanceApprovals={canManageFinanceApprovals}
        canRevertPaid={canRevertPaid}
        initialData={initialData}
      />
    </FulfillmentPermissionsProvider>
  );
}
