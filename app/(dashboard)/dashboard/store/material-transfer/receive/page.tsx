import { redirect } from "next/navigation";

import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { MaterialTransferReceivePanel } from "@/components/organisms/material-transfer-receive-panel";
import { loadShopScope } from "@/lib/material-transfer/scope";
import { getCurrentUserContext } from "@/lib/rbac";

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
    <div className="p-4 md:p-6">
      <MaterialTransferReceivePanel />
    </div>
  );
}
