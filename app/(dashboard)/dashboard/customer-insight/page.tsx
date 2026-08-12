import { redirect } from "next/navigation";

import { CustomerInsightPanel } from "@/app/(dashboard)/dashboard/customer-insight/customer-insight-panel";
import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { canFilterAllInsightContacts } from "@/lib/customer-insight/ownership";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function CustomerInsightPage() {
  const auth = await requirePermission("contacts.insight.read");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return <PermissionDeniedCard />;
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    redirect("/dashboard");
  }

  const roleNames = (auth.context!.roleNames as string[]) ?? [];
  const permissionKeys = (auth.context!.permissionKeys as string[]) ?? [];
  const canFilterAllContacts = canFilterAllInsightContacts({
    roleNames,
    permissionKeys,
  });
  const canMergeContacts = permissionKeys.includes("contacts.merge");
  const canManageLoyalty =
    permissionKeys.includes("contacts.master.manage") ||
    permissionKeys.includes("contacts.master.read") ||
    permissionKeys.includes("dashboard.merchant_admin_view");

  return (
    <CustomerInsightPanel
      canFilterAllContacts={canFilterAllContacts}
      canMergeContacts={canMergeContacts}
      canManageLoyalty={canManageLoyalty}
      canAssignLoyalty={
        permissionKeys.includes("contacts.master.manage") ||
        permissionKeys.includes("dashboard.merchant_admin_view")
      }
    />
  );
}
