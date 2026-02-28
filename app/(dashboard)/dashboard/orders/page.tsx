import { redirect } from "next/navigation";

import { OrdersPanel } from "@/components/organisms/orders-panel";
import { buildFulfillmentPermissions } from "@/lib/fulfillment-permissions";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const auth = await requirePermission("orders.read");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    redirect("/dashboard");
  }

  const permissions = buildFulfillmentPermissions(auth.context);
  return (
    <OrdersPanel
      canPrint={permissions.canPrint}
      canResendRiderSms={permissions.canResendRiderSms}
    />
  );
}
