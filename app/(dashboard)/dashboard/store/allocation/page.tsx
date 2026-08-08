import { redirect } from "next/navigation";

import { StoreLocationAllocationPanel } from "@/components/organisms/store-location-allocation-panel";
import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";
import { STORE_ALLOCATION_PERMISSION } from "@/lib/store-allocation/auth";

export const dynamic = "force-dynamic";

export default async function StoreAllocationPage() {
  const context = await getCurrentUserContext();
  if (!context?.user) redirect("/login");

  if (!hasPermission(context, STORE_ALLOCATION_PERMISSION)) {
    return (
      <div className="p-4 md:p-6">
        <PermissionDeniedCard
          title="Store allocation"
          message="You need the store allocation permission to use this tool. Ask an administrator to grant store.allocation.read."
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <StoreLocationAllocationPanel />
    </div>
  );
}
