import { redirect } from "next/navigation";

import { FailedOrderWebhooksPanel } from "@/components/organisms/failed-order-webhooks-panel";
import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function FailedOrderWebhooksPage() {
  const auth = await requirePermission("orders.read");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return <PermissionDeniedCard />;
  }

  return <FailedOrderWebhooksPanel />;
}
