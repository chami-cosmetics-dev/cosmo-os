import { redirect } from "next/navigation";

import { ReturnedOrdersPanel } from "@/components/organisms/returned-orders-panel";
import { fetchReturnsTrackingData } from "@/lib/page-data/order-returns";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function ReturnedOrdersPage() {
  const auth = await requirePermission("returns.read");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    redirect("/dashboard");
  }

  const companyId = auth.context!.user!.companyId;
  if (!companyId) redirect("/dashboard");

  const initialData = await fetchReturnsTrackingData({ companyId });

  return <ReturnedOrdersPanel initialData={initialData} />;
}
