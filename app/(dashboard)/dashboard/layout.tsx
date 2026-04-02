import type { ReactNode } from "react";

import { DashboardParallelShell } from "./dashboard-parallel-shell";
import { getDefaultDashboardOverviewInitialState } from "@/lib/page-data/dashboard-overview";
import { createPerfLogger } from "@/lib/perf";
import { getCurrentUserContext } from "@/lib/rbac";

/**
 * Parallel routes: `@filters` + `@main` for the overview analytics UI.
 * `default.tsx` in each slot renders nothing on nested routes (e.g. `/dashboard/orders`).
 */
export default async function DashboardSegmentLayout({
  children,
  filters,
  main,
}: {
  children: ReactNode;
  filters: ReactNode;
  main: ReactNode;
}) {
  const perf = createPerfLogger("app.dashboard.layout", {
    path: "/dashboard",
  });
  const context = await getCurrentUserContext();
  perf.mark("get-context");
  const companyId =
    (context?.user as { companyId?: string | null } | null)?.companyId ?? null;
  const isOverviewRoute = filters !== null || main !== null;

  let initialOverviewState = null;
  if (companyId && isOverviewRoute) {
    try {
      initialOverviewState = await getDefaultDashboardOverviewInitialState(companyId);
      perf.mark("preload-overview");
    } catch (error) {
      console.error("Failed to preload dashboard overview:", error);
    }
  }
  perf.end({
    hasCompanyId: Boolean(companyId),
    isOverviewRoute,
    initialDataSource: initialOverviewState ? "server-prefetch" : "client-fetch",
  });

  return (
    <div className="space-y-6">
      {children}
      <DashboardParallelShell
        filters={filters}
        main={main}
        initialOverviewState={initialOverviewState}
      />
    </div>
  );
}
