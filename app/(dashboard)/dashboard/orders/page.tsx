import { redirect } from "next/navigation";

import { OrdersPanel } from "@/components/organisms/orders-panel";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const auth = await requirePermission("orders.read");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    redirect("/dashboard");
  }

  return <OrdersPanel />;
}
