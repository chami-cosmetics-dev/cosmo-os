import { redirect } from "next/navigation";

import { DeliveryInvoiceFulfillmentPage } from "@/components/organisms/fulfillment-pages/delivery-invoice";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function DeliveryInvoicePage() {
  const auth = await requirePermission("orders.read");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    redirect("/dashboard");
  }

  return <DeliveryInvoiceFulfillmentPage />;
}
