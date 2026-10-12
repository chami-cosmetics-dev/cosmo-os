import { redirect } from "next/navigation";

import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { VatStatusPanel } from "@/components/organisms/vat-status-panel";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";
import { VAT_STATUS_PERMISSION } from "@/lib/vat-status/types";

export const dynamic = "force-dynamic";

export default async function VatStatusPage() {
  const context = await getCurrentUserContext();
  if (!context?.user) redirect("/login");

  if (!hasPermission(context, VAT_STATUS_PERMISSION)) {
    return (
      <div className="p-4 md:p-6">
        <PermissionDeniedCard
          title="VAT status"
          message="You need products.vat_status.read to search SKU VAT status. Ask an administrator to grant it."
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <VatStatusPanel />
    </div>
  );
}
