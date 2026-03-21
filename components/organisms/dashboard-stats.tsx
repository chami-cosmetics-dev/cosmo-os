"use client";

import { DashboardFiltersSlot } from "@/components/organisms/dashboard-filters-slot";
import { DashboardMainSlot } from "@/components/organisms/dashboard-main-slot";
import { DashboardOverviewProvider } from "@/components/organisms/dashboard-overview-context";

/**
 * Standalone composition of filters + charts with a local provider.
 * The `/dashboard` page uses parallel routes (`@filters` / `@main`) instead; keep this for tests or embeds.
 */
export function DashboardStats() {
  return (
    <DashboardOverviewProvider>
      <section className="space-y-5">
        <DashboardFiltersSlot />
        <DashboardMainSlot />
      </section>
    </DashboardOverviewProvider>
  );
}
