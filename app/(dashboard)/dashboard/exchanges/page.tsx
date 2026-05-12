import { redirect } from "next/navigation";

import { ExchangesPanel } from "@/components/organisms/exchanges-panel";
import { fetchExchangesTrackingData } from "@/lib/page-data/order-exchanges";
import { hasPermission, requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function ExchangesPage() {
  const auth = await requirePermission("exchanges.read");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    redirect("/dashboard");
  }

  const companyId = auth.context!.user!.companyId;
  if (!companyId) redirect("/dashboard");

  const initialData = await fetchExchangesTrackingData({
    companyId,
    viewerUserId: auth.context!.user!.id,
    canManage: hasPermission(auth.context!, "orders.manage"),
  });

  return <ExchangesPanel initialData={initialData} />;
}
