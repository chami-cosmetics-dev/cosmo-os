import { redirect } from "next/navigation";
import { SalesReportSettingsPanel } from "@/components/organisms/sales-report-settings-panel";
import { VaultSalesReportPanel } from "@/components/organisms/vault-sales-report-panel";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";
import { isVaultOsDeployment } from "@/lib/falcon-waybill-brand";

export default async function SalesReportPage() {
  const context = await getCurrentUserContext();
  if (!context?.user) redirect("/login");
  if (!hasPermission(context, "finance.sales_report.read")) redirect("/dashboard");
  return isVaultOsDeployment() ? <VaultSalesReportPanel /> : <SalesReportSettingsPanel />;
}
