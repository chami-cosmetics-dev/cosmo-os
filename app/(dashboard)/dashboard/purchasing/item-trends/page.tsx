import { redirect } from "next/navigation";

import { ItemTrendsPanel } from "@/components/organisms/item-trends-panel";
import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function ItemTrendsPage() {
  const context = await getCurrentUserContext();
  if (!context?.user) redirect("/login");

  const canRead = hasPermission(context, "purchasing.item_trends.read");
  const canManageRop = hasPermission(context, "purchasing.osf.manage");
  if (!canRead) return <PermissionDeniedCard />;

  return <ItemTrendsPanel canManageRop={canManageRop} />;
}
