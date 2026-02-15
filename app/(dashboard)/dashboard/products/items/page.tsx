import { redirect } from "next/navigation";

import { ProductItemsPanel } from "@/components/organisms/product-items-panel";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function ProductItemsPage() {
  const auth = await requirePermission("products.read");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    redirect("/dashboard");
  }

  return <ProductItemsPanel />;
}
