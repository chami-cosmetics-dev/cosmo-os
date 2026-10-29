import { redirect } from "next/navigation";

import { FailedOrderWebhooksPanel } from "@/components/organisms/failed-order-webhooks-panel";
import { ErpGrnWebhooksPanel } from "@/components/organisms/erp-grn-webhooks-panel";
import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function FailedOrderWebhooksPage() {
  const auth = await requirePermission("failed_webhooks.read");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return <PermissionDeniedCard />;
  }

  return (
    <div className="space-y-6">
      <FailedOrderWebhooksPanel />
      <ErpGrnWebhooksPanel />
    </div>
  );
}
