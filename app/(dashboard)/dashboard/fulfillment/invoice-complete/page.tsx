import { redirect } from "next/navigation";

import { InvoiceCompleteFulfillmentPage } from "@/components/organisms/fulfillment-pages/invoice-complete";
import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { buildFulfillmentPermissions } from "@/lib/fulfillment-permissions";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function InvoiceCompletePage() {
  const auth = await requirePermission("fulfillment.invoice_complete.read");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return <PermissionDeniedCard />;
  }

  const permissions = buildFulfillmentPermissions(auth.context);
  return <InvoiceCompleteFulfillmentPage permissions={permissions} />;
}
