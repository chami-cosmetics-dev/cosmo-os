import { redirect } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  StaffManagementPanel,
  type StaffManagementPanelInitialData,
} from "@/components/organisms/staff-management-panel";
import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { fetchStaffPageData } from "@/lib/page-data/staff";
import { hasPermission, requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
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
              Staff management needs RBAC tables. Run:{" "}
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

  const companyId = isSuperAdmin ? null : (auth.context!.user?.companyId ?? null);
  if (!isSuperAdmin && !companyId) {
    return <PermissionDeniedCard />;
  }

  const initialData = await fetchStaffPageData(companyId, {
    page: 1,
    limit: 10,
    status: "active",
  });

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-[linear-gradient(135deg,var(--dashboard-hero-start),var(--dashboard-hero-middle),var(--dashboard-hero-end))] p-5 shadow-[0_18px_40px_-28px_var(--primary)] sm:p-6">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.4),transparent_65%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent_65%)]" />
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
          Human Resources
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          Staff management
        </h1>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm sm:text-base">
          View employee records, keep profiles updated, and handle resignations from one workspace.
        </p>
      </section>
      <StaffManagementPanel
        canManageStaff={canManageStaff}
        initialData={initialData as unknown as StaffManagementPanelInitialData}
      />
    </div>
  );
}
