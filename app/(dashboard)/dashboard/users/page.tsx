import { redirect } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserManagementPanel } from "@/components/organisms/user-management-panel";
import { prisma } from "@/lib/prisma";
import { hasPermission, listRbacData, requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function UserManagementPage() {
  const auth = await requirePermission("users.read");
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
          <CardContent className="space-y-2 text-sm">
            <p>User Management needs RBAC tables in your database.</p>
            <p>Run: <code>npm run db:push</code> then <code>npm run db:generate</code></p>
          </CardContent>
        </Card>
      );
    }
    redirect("/dashboard");
  }

  const [data, lookups] = await Promise.all([
    listRbacData(),
    (async () => {
      const companyId = auth.context!.user!.companyId;
      if (!companyId || !hasPermission(auth.context, "settings.company")) {
        return null;
      }
      const [locations, departments, designations] = await Promise.all([
        prisma.companyLocation.findMany({
          where: { companyId },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
        prisma.department.findMany({
          where: { companyId },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
        prisma.designation.findMany({
          where: { companyId },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
      ]);
      return { locations, departments, designations };
    })(),
  ]);

  return (
    <UserManagementPanel
      initialUsers={data.users}
      initialRoles={data.roles}
      initialPermissions={data.permissions}
      initialLocations={lookups?.locations}
      initialDepartments={lookups?.departments}
      initialDesignations={lookups?.designations}
      canManageUsers={hasPermission(auth.context, "users.manage")}
      canManageRoles={hasPermission(auth.context, "roles.manage")}
    />
  );
}
