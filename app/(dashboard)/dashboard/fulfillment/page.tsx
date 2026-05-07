import { redirect } from "next/navigation";

import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { buildFulfillmentNavPermissions } from "@/lib/fulfillment-permissions";
import { getCurrentUserContext } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function FulfillmentIndexPage() {
  const context = await getCurrentUserContext();
  if (!context?.sessionUser) {
    redirect("/login");
  }

  const permissions = buildFulfillmentNavPermissions(context);
  if (permissions.canViewSampleFreeIssue) redirect("/dashboard/fulfillment/sample-free-issue");
  if (permissions.canViewOrderPrint) redirect("/dashboard/fulfillment/print");
  if (permissions.canViewReadyDispatch) redirect("/dashboard/fulfillment/dispatch");
  if (permissions.canViewDeliveryInvoice) redirect("/dashboard/fulfillment/delivery-invoice");
  if (permissions.canViewFalconUpload) redirect("/dashboard/fulfillment/falcon-upload");

  return <PermissionDeniedCard />;
}
