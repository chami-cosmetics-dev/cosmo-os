import { redirect } from "next/navigation";

import { DeliveryInvoiceFulfillmentPage } from "@/components/organisms/fulfillment-pages/delivery-invoice";
import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { buildFulfillmentPermissions } from "@/lib/fulfillment-permissions";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function DeliveryInvoicePage() {
  const auth = await requirePermission("fulfillment.delivery_invoice.read");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return <PermissionDeniedCard />;
  }

  const permissions = buildFulfillmentPermissions(auth.context);
  return <DeliveryInvoiceFulfillmentPage permissions={permissions} />;
}
