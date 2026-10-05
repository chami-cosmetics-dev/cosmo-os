import { redirect } from "next/navigation";

import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { CosmeticsStockComparer } from "@/components/organisms/cosmetics-stock-comparer";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function CosmeticsStockComparerPage() {
  const context = await getCurrentUserContext();
  if (!context?.user) redirect("/login");

  if (!hasPermission(context, "reports.stock_comparer")) {
    return <PermissionDeniedCard />;
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Cosmetics Stock Comparer</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Cosmetics main vs other main warehouses first, then shops. Brand tab flags stock on the wrong
          company.
        </p>
      </header>
      <CosmeticsStockComparer />
    </div>
  );
}
