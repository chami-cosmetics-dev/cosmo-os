import { redirect } from "next/navigation";

import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { MaterialTransferPanel } from "@/components/organisms/material-transfer-panel";
import { MATERIAL_TRANSFER_PERMISSION } from "@/lib/material-transfer/auth";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function MaterialTransferPage() {
  const context = await getCurrentUserContext();
  if (!context?.user) redirect("/login");

  if (!hasPermission(context, MATERIAL_TRANSFER_PERMISSION)) {
    return (
      <div className="p-4 md:p-6">
        <PermissionDeniedCard
          title="Material transfer"
          message="You need the material transfer permission to use this tool. Ask an administrator to grant store.material_transfer.write."
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <MaterialTransferPanel />
    </div>
  );
}
