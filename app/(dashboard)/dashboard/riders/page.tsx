import { redirect } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RiderOperationsPanel } from "@/components/organisms/rider-operations-panel";
import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { fetchStaffPageData } from "@/lib/page-data/staff";
import { fetchRiderOrdersData, fetchRiderRoster } from "@/lib/page-data/riders";
import { hasPermission, requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function RidersPage() {
  const auth = await requirePermission("staff.read");
  if (!auth.ok) {
    if (auth.status === 401) {
      redirect("/login");
    }
    if (auth.status === 503) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>RBAC Setup Required</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              Rider management needs RBAC tables. Run:{" "}
              <code>npm run db:push</code> then <code>npm run db:generate</code>
            </p>
          </CardContent>
        </Card>
      );
    }
    return <PermissionDeniedCard />;
  }

  const canManageStaff = hasPermission(auth.context, "staff.manage");
  const roleNames = auth.context!.roleNames as string[];
  const isSuperAdmin = roleNames.includes("super_admin");
  const lookupCompanyId = auth.context!.user?.companyId ?? null;

  const companyId = isSuperAdmin ? null : (auth.context!.user?.companyId ?? null);
  if (!isSuperAdmin && !companyId) {
    return <PermissionDeniedCard />;
  }

  const initialData = await fetchStaffPageData(companyId, {
    page: 1,
    limit: 10,
    status: "active",
    riderOnly: true,
    lookupCompanyId,
  });
  const riderRoster = await fetchRiderRoster(companyId);
  const initialOrdersData = riderRoster[0]
    ? await fetchRiderOrdersData(companyId, riderRoster[0].id)
    : null;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-[linear-gradient(135deg,var(--dashboard-hero-start),var(--dashboard-hero-middle),var(--dashboard-hero-end))] p-5 shadow-[0_18px_40px_-28px_var(--primary)] sm:p-6">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.4),transparent_65%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent_65%)]" />
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
          Delivery Operations
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          Rider management
        </h1>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm sm:text-base">
          See who can use the rider mobile app, verify rider-ready staff records, and keep dispatch teams current.
        </p>
      </section>
      <RiderOperationsPanel
        canManageStaff={canManageStaff}
        initialDirectoryData={initialData}
        riderRoster={riderRoster}
        initialOrdersData={initialOrdersData}
      />
    </div>
  );
}
