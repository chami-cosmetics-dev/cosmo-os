import { redirect } from "next/navigation";

import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { SalesBudgetPanel } from "@/components/organisms/sales-budget-panel";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function SalesBudgetPage() {
  const context = await getCurrentUserContext();
  if (!context?.user) redirect("/login");
  if (!hasPermission(context, "purchasing.sales_budget.read")) return <PermissionDeniedCard />;

  return <SalesBudgetPanel />;
}
