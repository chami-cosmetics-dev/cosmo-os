import { redirect } from "next/navigation";

import { SampleFreeIssueFulfillmentPage } from "@/components/organisms/fulfillment-pages/sample-free-issue";
import { buildFulfillmentPermissions } from "@/lib/fulfillment-permissions";
import { requireAnyPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function SampleFreeIssuePage() {
  const auth = await requireAnyPermission([
    "orders.read",
    "fulfillment.sample_free_issue.read",
  ]);
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    redirect("/dashboard");
  }

  const permissions = buildFulfillmentPermissions(auth.context);
  return <SampleFreeIssueFulfillmentPage permissions={permissions} />;
}
