import { redirect } from "next/navigation";

import { ReceivableOutstandingPanel } from "@/components/organisms/receivable-outstanding-panel";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";

export default async function ReceivableOutstandingReportPage() {
  const context = await getCurrentUserContext();
  if (!context?.user) redirect("/login");
  if (!hasPermission(context, "finance.receivable_outstanding.read")) redirect("/dashboard");
  return <ReceivableOutstandingPanel />;
}
