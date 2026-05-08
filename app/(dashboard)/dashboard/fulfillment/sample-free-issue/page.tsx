import { redirect } from "next/navigation";

import { SampleFreeIssueFulfillmentPage } from "@/components/organisms/fulfillment-pages/sample-free-issue";
import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { buildFulfillmentPermissions } from "@/lib/fulfillment-permissions";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function SampleFreeIssuePage() {
  const auth = await requirePermission("fulfillment.sample_free_issue.read");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return <PermissionDeniedCard />;
  }

  const permissions = buildFulfillmentPermissions(auth.context);
  return <SampleFreeIssueFulfillmentPage permissions={permissions} />;
}
