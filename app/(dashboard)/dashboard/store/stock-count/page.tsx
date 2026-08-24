import { redirect } from "next/navigation";

import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { StoreStockCountPanel } from "@/components/organisms/store-stock-count-panel";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";
import { STORE_STOCK_COUNT_PERMISSION } from "@/lib/store-stock-count/auth";

export const dynamic = "force-dynamic";

export default async function StoreStockCountPage() {
  const context = await getCurrentUserContext();
  if (!context?.user) redirect("/login");

  if (!hasPermission(context, STORE_STOCK_COUNT_PERMISSION)) {
    return (
      <div className="p-4 md:p-6">
        <PermissionDeniedCard
          title="Store stock count"
          message="You need the store stock count permission to use this tool. Ask an administrator to grant store.stock_count.read."
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <StoreStockCountPanel />
    </div>
  );
}
