import { redirect } from "next/navigation";

import { DispatchFulfillmentPage } from "@/components/organisms/fulfillment-pages/dispatch";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function DispatchPage() {
  const auth = await requirePermission("orders.read");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    redirect("/dashboard");
  }

  return <DispatchFulfillmentPage />;
}
