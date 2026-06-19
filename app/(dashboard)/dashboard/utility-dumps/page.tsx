import { redirect } from "next/navigation";

import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { UtilityDumpsPanel } from "@/components/organisms/utility-dumps-panel";
import { UTILITY_REPORT_DUMP_PERMISSIONS } from "@/lib/report-permissions";
import { requireAnyPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function UtilityDumpsPage() {
  const auth = await requireAnyPermission([...UTILITY_REPORT_DUMP_PERMISSIONS]);
  if (!auth.ok) {
    if (auth.status === 401) {
      redirect("/login");
    }
    return <PermissionDeniedCard />;
  }

  return (
    <UtilityDumpsPanel
      permissionKeys={auth.context.permissionKeys}
      roleNames={auth.context.roleNames}
    />
  );
}
