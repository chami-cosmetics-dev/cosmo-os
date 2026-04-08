import { redirect } from "next/navigation";

import { CreateManualOrderPanel } from "@/components/organisms/create-manual-order-panel";
import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function CreateManualOrderPage() {
  const auth = await requirePermission("orders.create_manual");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return <PermissionDeniedCard />;
  }

  return <CreateManualOrderPanel />;
}
