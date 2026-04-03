import { redirect } from "next/navigation";

import { CreateManualOrderPanel } from "@/components/organisms/create-manual-order-panel";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function CreateManualOrderPage() {
  const auth = await requirePermission("orders.create_manual");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    redirect("/dashboard");
  }

  return <CreateManualOrderPanel />;
}
