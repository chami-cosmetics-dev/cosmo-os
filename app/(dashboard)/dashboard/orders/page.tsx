import { redirect } from "next/navigation";

import { OrdersPanel } from "@/components/organisms/orders-panel";
import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import {
  getRevertPermissionKeys,
  buildFulfillmentPermissions,
} from "@/lib/fulfillment-permissions";
import { fetchOrdersPageData } from "@/lib/page-data/orders";
import { requirePermission } from "@/lib/rbac";

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
  const initialData = await fetchOrdersPageData(companyId, {
    page: 1,
    limit: 10,
    sortOrder: "desc",
  });

  return (
    <OrdersPanel
      canPrint={permissions.canPrint}
      canResendRiderSms={permissions.canResendRiderSms}
      revertPermissionKeys={revertPermissionKeys}
      initialData={initialData}
    />
  );
}
