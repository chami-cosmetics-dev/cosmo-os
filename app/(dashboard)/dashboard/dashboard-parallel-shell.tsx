"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { DashboardOverviewProvider } from "@/components/organisms/dashboard-overview-context";

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
}: {
  filters: ReactNode;
  main: ReactNode;
}) {
  const pathname = usePathname();
  if (!isDashboardOverviewPath(pathname)) {
    return null;
  }

  return (
    <DashboardOverviewProvider>
      <section className="space-y-5">
        {filters}
        {main}
      </section>
    </DashboardOverviewProvider>
  );
}
