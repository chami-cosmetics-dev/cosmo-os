import { redirect } from "next/navigation";

import { PrintFulfillmentPage } from "@/components/organisms/fulfillment-pages/print";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function OrderPrintPage() {
  const auth = await requirePermission("orders.read");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    redirect("/dashboard");
  }

  return <PrintFulfillmentPage />;
}
