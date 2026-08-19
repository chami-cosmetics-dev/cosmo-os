import { redirect } from "next/navigation";

import { CustomerInsightPanel } from "@/app/(dashboard)/dashboard/customer-insight/customer-insight-panel";
import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import {
  canFilterAllInsightContacts,
  hasInsightAdminView,
} from "@/lib/customer-insight/ownership";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function CustomerInsightPage({
  searchParams,
}: {
  searchParams: Promise<{ contactId?: string; edit?: string }>;
}) {
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
  const canExportFilteredCsv = hasInsightAdminView({
    roleNames,
    permissionKeys,
  });
  const canAddContactPhone = permissionKeys.includes("contacts.merge");
  const canManageLoyalty =
    permissionKeys.includes("contacts.master.manage") ||
    permissionKeys.includes("contacts.master.read") ||
    permissionKeys.includes("dashboard.merchant_admin_view");

  const query = await searchParams;

  return (
    <CustomerInsightPanel
      canFilterAllContacts={canFilterAllContacts}
      canExportFilteredCsv={canExportFilteredCsv}
      canAddContactPhone={canAddContactPhone}
      canManageLoyalty={canManageLoyalty}
      canAssignLoyalty={
        permissionKeys.includes("contacts.master.manage") ||
        permissionKeys.includes("dashboard.merchant_admin_view")
      }
      initialContactId={query.contactId?.trim() || null}
      initialEdit={query.edit === "1"}
    />
  );
}
