"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { DashboardClientPerf } from "@/components/organisms/dashboard-client-perf";
import { DashboardOverviewProvider } from "@/components/organisms/dashboard-overview-context";
import type { DashboardOverviewInitialState } from "@/lib/page-data/dashboard-overview-shared";

function isDashboardOverviewPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === "/dashboard" || pathname === "/dashboard/";
}

/**
 * Renders `@filters` + `@main` only on `/dashboard` so nested routes (e.g. `/dashboard/orders`)
 * do not mount the overview provider or an empty analytics section.
 */
export function DashboardParallelShell({
  filters,
  main,
  initialOverviewState,
}: {
  filters: ReactNode;
  main: ReactNode;
  initialOverviewState: DashboardOverviewInitialState | null;
}) {
  const pathname = usePathname();
  if (!isDashboardOverviewPath(pathname)) {
    return null;
  }

  return (
    <DashboardOverviewProvider initialState={initialOverviewState}>
      <DashboardClientPerf
        initialDataSource={initialOverviewState ? "server-prefetch" : "client-fetch"}
      />
      <section className="space-y-5">
        {filters}
        {main}
      </section>
    </DashboardOverviewProvider>
  );
}
