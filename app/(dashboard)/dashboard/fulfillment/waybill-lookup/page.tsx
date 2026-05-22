import { redirect } from "next/navigation";

import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { WaybillLookupFulfillmentPage } from "@/components/organisms/fulfillment-pages/waybill-lookup";
import { hasPermission, requireAnyPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function WaybillLookupPage() {
  const auth = await requireAnyPermission([
    "fulfillment.waybill_lookup.read",
    "fulfillment.waybill_lookup.import",
  ]);
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return <PermissionDeniedCard />;
  }

  return (
    <WaybillLookupFulfillmentPage
      canImportWaybills={hasPermission(auth.context, "fulfillment.waybill_lookup.import")}
    />
  );
}
