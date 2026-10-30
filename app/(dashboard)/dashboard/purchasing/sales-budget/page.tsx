import { redirect } from "next/navigation";

import { SalesBudgetPanel } from "@/components/organisms/sales-budget-panel";
import { getCurrentUserContext } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function SalesBudgetPage() {
  const context = await getCurrentUserContext();
  if (!context?.user) redirect("/login");

  return <SalesBudgetPanel />;
}
