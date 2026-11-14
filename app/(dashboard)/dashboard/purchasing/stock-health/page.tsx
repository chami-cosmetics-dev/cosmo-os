import { redirect } from "next/navigation";

import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { StockHealthPanel } from "@/components/organisms/stock-health-panel";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function StockHealthPage() {
  const context = await getCurrentUserContext();
  if (!context?.user) redirect("/login");
  if (!hasPermission(context, "purchasing.stock_health.read")) return <PermissionDeniedCard />;

  return (
    <StockHealthPanel
      canManageExcludedSkus={hasPermission(context, "purchasing.stock_health.manage")}
    />
  );
}
