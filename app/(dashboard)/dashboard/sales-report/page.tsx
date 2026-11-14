import { redirect } from "next/navigation";
import { SalesReportSettingsPanel } from "@/components/organisms/sales-report-settings-panel";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";
import { isVaultOsDeployment } from "@/lib/falcon-waybill-brand";

export default async function SalesReportPage() {
  if (isVaultOsDeployment()) redirect("/dashboard");
  const context = await getCurrentUserContext();
  if (!context?.user) redirect("/login");
  if (!hasPermission(context, "finance.sales_report.read")) redirect("/dashboard");
  return <SalesReportSettingsPanel />;
}
