import { DashboardFiltersSlot } from "@/components/organisms/dashboard-filters-slot";
import { requirePermission } from "@/lib/rbac";

export default async function DashboardFiltersParallelPage() {
  const auth = await requirePermission("dashboard.view");
  if (!auth.ok) {
    return null;
  }

  return <DashboardFiltersSlot />;
}
