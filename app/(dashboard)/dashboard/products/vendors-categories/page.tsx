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

  return (
    <div className="space-y-6">
      <section className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Vendors & Categories</h1>
        <p className="text-sm text-muted-foreground">
          Organize catalog metadata so filtering, reporting, and assignment stay clean.
        </p>
      </section>
      <VendorsCategoriesPanel canManage={canManage} />
    </div>
  );
}
