import { redirect } from "next/navigation";

import { OsfHubPanel } from "@/components/organisms/osf-hub-panel";
import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { prisma } from "@/lib/prisma";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function OsfPage() {
  const context = await getCurrentUserContext();
  if (!context?.user) redirect("/login");

  const canRead = hasPermission(context, "purchasing.osf.read");
  const canManage = hasPermission(context, "purchasing.osf.manage");
  const canToolsRead =
    hasPermission(context, "purchasing.tools.read") ||
    hasPermission(context, "purchasing.tools.manage");
  const canManageThreshold = hasPermission(context, "purchasing.tools.manage") || canManage;
  const canAssignColumns = hasPermission(context, "purchasing.osf.permission");
  if (!canRead && !canManage) return <PermissionDeniedCard />;

  const companyId = context.user.companyId;
  if (!companyId) return <PermissionDeniedCard />;

  const locations = await prisma.companyLocation.findMany({
    where: { companyId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, shortName: true },
  });

  return (
    <OsfHubPanel
      canManage={canManage}
      canManageThreshold={canManageThreshold}
      canReorderOnly={canToolsRead}
      canAssignColumns={canAssignColumns}
      initialLocations={locations}
    />
  );
}
