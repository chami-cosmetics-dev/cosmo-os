import { redirect } from "next/navigation";

import { VendorsCategoriesPanel } from "@/components/organisms/vendors-categories-panel";
import { getCurrentUserContext, hasPermission, requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function VendorsCategoriesPage() {
  const auth = await requirePermission("products.read");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    redirect("/dashboard");
  }

  const canManage = auth.context ? hasPermission(auth.context, "products.manage") : false;

  return <VendorsCategoriesPanel canManage={canManage} />;
}
