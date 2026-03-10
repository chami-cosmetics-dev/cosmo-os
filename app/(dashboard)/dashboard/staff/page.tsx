import { redirect } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  StaffManagementPanel,
  type StaffManagementPanelInitialData,
} from "@/components/organisms/staff-management-panel";
import { fetchStaffPageData } from "@/lib/page-data/staff";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

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
  const roleNames = auth.context!.roleNames as string[];
  const isSuperAdmin = roleNames.includes("super_admin");

  let companyId: string | null = null;
  if (!isSuperAdmin) {
    const user = await prisma.user.findUnique({
      where: { id: auth.context!.user!.id },
      select: { companyId: true },
    });
    companyId = user?.companyId ?? null;
    if (!companyId) {
      redirect("/dashboard");
    }
  }

  const initialData = await fetchStaffPageData(companyId, {
    page: 1,
    limit: 10,
    status: "active",
  });

  return (
    <StaffManagementPanel
      canManageStaff={canManageStaff}
      initialData={initialData as unknown as StaffManagementPanelInitialData}
    />
  );
}
