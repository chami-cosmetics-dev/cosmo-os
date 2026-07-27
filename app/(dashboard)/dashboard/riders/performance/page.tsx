import Link from "next/link";
import { redirect } from "next/navigation";

import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { RiderPerformancePanel } from "@/components/organisms/rider-performance-panel";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function RiderPerformancePage() {
  const auth = await requirePermission("staff.read");
  if (!auth.ok) {
    if (auth.status === 401) {
      redirect("/login");
    }
    return <PermissionDeniedCard />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Rider performance</h1>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/riders">Back to riders</Link>
        </Button>
      </div>
      <RiderPerformancePanel />
    </div>
  );
}
