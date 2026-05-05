import { redirect } from "next/navigation";

import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { FalconUploadFulfillmentPage } from "@/components/organisms/fulfillment-pages/falcon-upload";
import { requireAnyPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function FalconUploadPage() {
  const auth = await requireAnyPermission([
    "orders.read",
    "fulfillment.delivery_invoice.read",
  ]);
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return <PermissionDeniedCard />;
  }

  return <FalconUploadFulfillmentPage />;
}
