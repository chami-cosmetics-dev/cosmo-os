import { redirect } from "next/navigation";

import { MarketPricesPanel } from "@/components/organisms/market-prices-panel";
import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function MarketPricesPage() {
  const context = await getCurrentUserContext();
  if (!context?.user) redirect("/login");

  const canRead = hasPermission(context, "purchasing.market_prices.read");
  const canManage = hasPermission(context, "purchasing.market_prices.manage");
  if (!canRead) return <PermissionDeniedCard />;

  return <MarketPricesPanel canManage={canManage} />;
}
