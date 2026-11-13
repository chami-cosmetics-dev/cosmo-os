import { redirect } from "next/navigation";

import { PurchaseHistoryPanel } from "@/components/organisms/purchase-history-panel";
import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function PurchaseHistoryPage() {
  const context = await getCurrentUserContext();
  if (!context?.user) redirect("/login");

  const canReadPurchaseHistory = hasPermission(context, "purchasing.purchase_history.read");
  const canReadHighRisk = hasPermission(context, "purchasing.high_risk.read");
  if (!canReadPurchaseHistory && !canReadHighRisk) {
    return <PermissionDeniedCard />;
  }

  return (
    <PurchaseHistoryPanel
      canReadPurchaseHistory={canReadPurchaseHistory}
      canReadHighRisk={canReadHighRisk}
      canManageHighRisk={hasPermission(context, "purchasing.high_risk.manage")}
    />
  );
}
