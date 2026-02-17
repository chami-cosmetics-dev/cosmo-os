import { redirect } from "next/navigation";

import { SampleFreeIssueFulfillmentPage } from "@/components/organisms/fulfillment-pages/sample-free-issue";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function SampleFreeIssuePage() {
  const auth = await requirePermission("orders.read");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    redirect("/dashboard");
  }

  return <SampleFreeIssueFulfillmentPage />;
}
