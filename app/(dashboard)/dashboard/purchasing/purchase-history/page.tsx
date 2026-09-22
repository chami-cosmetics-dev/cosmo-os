import { redirect } from "next/navigation";

import { PurchaseHistoryPanel } from "@/components/organisms/purchase-history-panel";
import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { isVaultOsDeployment } from "@/lib/falcon-waybill-brand";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function PurchaseHistoryPage() {
  const context = await getCurrentUserContext();
  if (!context?.user) redirect("/login");

  const canTools =
    hasPermission(context, "purchasing.tools.read") ||
    hasPermission(context, "purchasing.tools.manage");
  if (!canTools) return <PermissionDeniedCard />;

  if (!isVaultOsDeployment()) {
    return (
      <div className="space-y-2 p-6">
        <h1 className="text-xl font-semibold">Purchase History</h1>
        <p className="text-sm text-muted-foreground">
          This dashboard is available on Vault OS only.
        </p>
      </div>
    );
  }

  return <PurchaseHistoryPanel />;
}
