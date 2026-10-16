import { redirect } from "next/navigation";

import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { MaterialTransferReceiveTabs } from "@/components/organisms/material-transfer-receive-tabs";
import { MATERIAL_TRANSFER_SHOP_RETURN_PERMISSION } from "@/lib/material-transfer/auth";
import { loadShopScope } from "@/lib/material-transfer/scope";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function MaterialTransferReceivePage() {
  const context = await getCurrentUserContext();
  if (!context?.user) redirect("/login");

  const companyId = context.user.companyId;
  const scope =
    companyId && context.user.id ? await loadShopScope(context.user.id, companyId) : null;
  if (!scope?.outletName) {
    return (
      <div className="p-4 md:p-6">
        <PermissionDeniedCard
          title="Receive transfer"
          message="Assign an outlet on your staff profile to receive shop transfers."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 p-4 md:p-6">
      <MaterialTransferReceiveTabs canReturn={hasPermission(context, MATERIAL_TRANSFER_SHOP_RETURN_PERMISSION)} />
    </div>
  );
}
