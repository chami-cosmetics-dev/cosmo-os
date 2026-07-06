import { DashboardMainSlot } from "@/components/organisms/dashboard-main-slot";
import { hasPermission, requirePermission } from "@/lib/rbac";

export default async function DashboardMainParallelPage() {
  const auth = await requirePermission("dashboard.view");
  if (!auth.ok) {
    return null;
  }

  const canEditDashboard = hasPermission(auth.context!, "dashboard.edit");
  return <DashboardMainSlot canEditDashboard={canEditDashboard} />;
}
