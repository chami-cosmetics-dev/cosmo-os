import { redirect } from "next/navigation";

import { CustomerInsightPanel } from "@/app/(dashboard)/dashboard/customer-insight/customer-insight-panel";
import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
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

  return <CustomerInsightPanel />;
}
