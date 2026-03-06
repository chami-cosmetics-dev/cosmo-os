import { redirect } from "next/navigation";

import { DispatchFulfillmentPage } from "@/components/organisms/fulfillment-pages/dispatch";
import { buildFulfillmentPermissions } from "@/lib/fulfillment-permissions";
import { requireAnyPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function DispatchPage() {
  const auth = await requireAnyPermission([
    "orders.read",
    "fulfillment.ready_dispatch.read",
  ]);
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    redirect("/dashboard");
  }

  const permissions = buildFulfillmentPermissions(auth.context);
  return <DispatchFulfillmentPage permissions={permissions} />;
}
