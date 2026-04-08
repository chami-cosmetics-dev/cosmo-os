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
  const lookupCompanyId = auth.context!.user?.companyId ?? null;

  const companyId = isSuperAdmin ? null : (auth.context!.user?.companyId ?? null);
  if (!isSuperAdmin && !companyId) {
    return <PermissionDeniedCard />;
  }

  const initialData = await fetchStaffPageData(companyId, {
    page: 1,
    limit: 10,
    status: "active",
    lookupCompanyId,
  });

  return (
    <div className="space-y-6">
      <section className="from-primary/10 to-background rounded-2xl border bg-gradient-to-r p-5 sm:p-6">
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
