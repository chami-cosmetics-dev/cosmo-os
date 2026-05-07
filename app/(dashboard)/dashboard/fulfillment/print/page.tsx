import { redirect } from "next/navigation";

import { PrintFulfillmentPage } from "@/components/organisms/fulfillment-pages/print";
import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { buildFulfillmentPermissions } from "@/lib/fulfillment-permissions";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function OrderPrintPage() {
  const auth = await requirePermission("fulfillment.order_print.read");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return <PermissionDeniedCard />;
  }

  const permissions = buildFulfillmentPermissions(auth.context);
  return <PrintFulfillmentPage permissions={permissions} />;
}
