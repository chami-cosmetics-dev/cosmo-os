import { redirect } from "next/navigation";

import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { WaybillLookupFulfillmentPage } from "@/components/organisms/fulfillment-pages/waybill-lookup";
import { requireAnyPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function WaybillLookupPage() {
  const auth = await requireAnyPermission([
    "fulfillment.delivery_invoice.read",
    "fulfillment.falcon_upload.read",
  ]);
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return <PermissionDeniedCard />;
  }

  return <WaybillLookupFulfillmentPage />;
}
