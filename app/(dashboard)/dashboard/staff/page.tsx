import { redirect } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StaffManagementPanel } from "@/components/organisms/staff-management-panel";
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
    redirect("/dashboard");
  }

  const canManageStaff = hasPermission(auth.context, "staff.manage");

  return (
    <div className="space-y-6">
      <Card className="border-border/70 bg-card/95 shadow-sm">
        <CardHeader>
          <CardTitle>Staff Workspace</CardTitle>
          <p className="text-sm text-muted-foreground">
            Manage staff records, employment assignments, and resignation workflows.
          </p>
        </CardHeader>
        <CardContent>
          <StaffManagementPanel canManageStaff={canManageStaff} />
        </CardContent>
      </Card>
    </div>
  );
}
