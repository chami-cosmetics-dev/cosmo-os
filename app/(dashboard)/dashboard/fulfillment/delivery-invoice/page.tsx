import { redirect } from "next/navigation";

import { DeliveryInvoiceFulfillmentPage } from "@/components/organisms/fulfillment-pages/delivery-invoice";
import { buildFulfillmentPermissions } from "@/lib/fulfillment-permissions";
import { requireAnyPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function DeliveryInvoicePage() {
  const auth = await requireAnyPermission([
    "orders.read",
    "fulfillment.delivery_invoice.read",
  ]);
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    redirect("/dashboard");
  }

  const permissions = buildFulfillmentPermissions(auth.context);
  return <DeliveryInvoiceFulfillmentPage permissions={permissions} />;
}
