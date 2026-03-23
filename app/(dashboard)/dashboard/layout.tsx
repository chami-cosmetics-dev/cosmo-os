import type { ReactNode } from "react";

import { DashboardParallelShell } from "./dashboard-parallel-shell";

/**
 * Parallel routes: `@filters` + `@main` for the overview analytics UI.
 * `default.tsx` in each slot renders nothing on nested routes (e.g. `/dashboard/orders`).
 */
export default function DashboardSegmentLayout({
  children,
  filters,
  main,
}: {
  children: ReactNode;
  filters: ReactNode;
  main: ReactNode;
}) {
  return (
    <div className="space-y-6">
      {children}
      <DashboardParallelShell filters={filters} main={main} />
    </div>
  );
}
