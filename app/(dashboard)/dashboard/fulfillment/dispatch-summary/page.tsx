import { redirect } from "next/navigation";

import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { DispatchSummaryPage } from "@/components/organisms/fulfillment-pages/dispatch-summary";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function FulfillmentDispatchSummaryPage() {
  const auth = await requirePermission("fulfillment.ready_dispatch.read");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return <PermissionDeniedCard />;
  }
  return <DispatchSummaryPage />;
}
