import { redirect } from "next/navigation";

import { CancelOrdersPanel } from "@/components/organisms/cancel-orders-panel";
import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function CancelOrdersPage() {
  const auth = await requirePermission("orders.cancel");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return <PermissionDeniedCard />;
  }

  return <CancelOrdersPanel />;
}
