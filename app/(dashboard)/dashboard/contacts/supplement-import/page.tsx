import { redirect } from "next/navigation";

import { SupplementContactImportPanel } from "@/components/organisms/supplement-contact-import-panel";
import { isVaultOsDeployment } from "@/lib/falcon-waybill-brand";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function SupplementContactImportPage() {
  const auth = await requirePermission("contacts.master.manage");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    redirect("/dashboard");
  }
  if (!isVaultOsDeployment()) redirect("/dashboard");

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <SupplementContactImportPanel />
    </div>
  );
}
