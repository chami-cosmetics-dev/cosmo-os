import { redirect } from "next/navigation";

import { PrintFulfillmentPage } from "@/components/organisms/fulfillment-pages/print";
import { buildFulfillmentPermissions } from "@/lib/fulfillment-permissions";
import { requireAnyPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function OrderPrintPage() {
  const auth = await requireAnyPermission([
    "orders.read",
    "fulfillment.order_print.read",
  ]);
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    redirect("/dashboard");
  }

  const permissions = buildFulfillmentPermissions(auth.context);
  return <PrintFulfillmentPage permissions={permissions} />;
}
