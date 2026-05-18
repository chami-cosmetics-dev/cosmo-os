import { DashboardMainSlot } from "@/components/organisms/dashboard-main-slot";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";

export default async function DashboardMainParallelPage() {
  const context = await getCurrentUserContext();
  const canEditDashboard = hasPermission(context, "dashboard.edit");
  return <DashboardMainSlot canEditDashboard={canEditDashboard} />;
}
