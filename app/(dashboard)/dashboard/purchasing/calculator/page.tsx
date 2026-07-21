import { redirect } from "next/navigation";

import { PurchasingSkuCalculator } from "@/components/organisms/purchasing-sku-calculator";
import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function PurchasingCalculatorPage() {
  const context = await getCurrentUserContext();
  if (!context?.user) redirect("/login");

  const canTools =
    hasPermission(context, "purchasing.tools.read") ||
    hasPermission(context, "purchasing.tools.manage");
  if (!canTools) return <PermissionDeniedCard />;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Purchasing calculator</h1>
        <p className="text-sm text-muted-foreground">
          Margin and supplier price-change checks by SKU — without downloading the full OSF.
        </p>
      </div>
      <section className="rounded-lg border p-4">
        <PurchasingSkuCalculator />
      </section>
    </div>
  );
}
