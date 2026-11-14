import { redirect } from "next/navigation";

import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { ShopStockStatusPanel } from "@/components/organisms/shop-stock-status-panel";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function ShopStockStatusPage() {
  const context = await getCurrentUserContext();
  if (!context?.user) redirect("/login");
  if (!hasPermission(context, "store.shop_stock_status.read")) return <PermissionDeniedCard />;

  return <ShopStockStatusPanel />;
}
