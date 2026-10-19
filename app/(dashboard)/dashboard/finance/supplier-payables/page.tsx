import { redirect } from "next/navigation";

import { SupplierPayablesPanel } from "@/components/organisms/supplier-payables-panel";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";

export default async function SupplierPayablesPage() {
  const context = await getCurrentUserContext();
  if (!context?.user) redirect("/login");
  if (
    !hasPermission(context, "finance.supplier_payables.read") &&
    !hasPermission(context, "purchasing.purchase_history.read")
  ) {
    redirect("/dashboard");
  }

  return <SupplierPayablesPanel />;
}
