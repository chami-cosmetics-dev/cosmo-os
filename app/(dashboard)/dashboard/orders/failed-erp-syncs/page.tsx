import { redirect } from "next/navigation";

import { FailedErpSyncsPanel } from "@/components/organisms/failed-erp-syncs-panel";
import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function FailedErpSyncsPage() {
  const auth = await requirePermission("failed_webhooks.read");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return <PermissionDeniedCard />;
  }

  return <FailedErpSyncsPanel />;
}
