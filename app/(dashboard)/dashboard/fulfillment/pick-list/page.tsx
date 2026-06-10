import { redirect } from "next/navigation";

import { PickListPage } from "@/components/organisms/fulfillment-pages/pick-list";
import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function InventoryPickListPage() {
  const auth = await requirePermission("fulfillment.order_print.read");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return <PermissionDeniedCard />;
  }

  return <PickListPage />;
}
