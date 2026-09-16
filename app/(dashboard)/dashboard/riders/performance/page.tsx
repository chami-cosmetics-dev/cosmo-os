import Link from "next/link";
import { redirect } from "next/navigation";

import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { RiderPerformancePanel } from "@/components/organisms/rider-performance-panel";
import { Button } from "@/components/ui/button";
import { hasPermission, requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function RiderPerformancePage() {
  const auth = await requirePermission("riders.performance.read");
  if (!auth.ok) {
    if (auth.status === 401) {
      redirect("/login");
    }
    return <PermissionDeniedCard />;
  }

  const canManagePerformance = hasPermission(auth.context, "riders.performance.manage");
  const canViewRiders = hasPermission(auth.context, "riders.read");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Rider performance</h1>
        {canViewRiders ? (
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/riders">Back to riders</Link>
          </Button>
        ) : null}
      </div>
      <RiderPerformancePanel canManagePerformance={canManagePerformance} />
    </div>
  );
}
