import { redirect } from "next/navigation";

import { PosOrdersPanel } from "@/components/organisms/pos-orders-panel";
import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { isAdminRole } from "@/lib/order-cancel-finance";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function PosOrdersPage() {
  const auth = await requirePermission("orders.read");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return <PermissionDeniedCard />;
  }

  return (
    <PosOrdersPanel
      currentUserId={auth.context?.user?.id ?? null}
      canCancelAnyPosOrder={isAdminRole(auth.context?.roleNames)}
    />
  );
}
