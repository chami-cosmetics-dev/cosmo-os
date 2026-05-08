import { redirect } from "next/navigation";

import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { FalconUploadFulfillmentPage } from "@/components/organisms/fulfillment-pages/falcon-upload";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function FalconUploadPage() {
  const auth = await requirePermission("fulfillment.falcon_upload.read");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return <PermissionDeniedCard />;
  }

  return <FalconUploadFulfillmentPage />;
}
