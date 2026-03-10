import { redirect } from "next/navigation";

import { ProductItemsPanel } from "@/components/organisms/product-items-panel";
import { fetchProductItemsPageData } from "@/lib/page-data/product-items";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function ProductItemsPage() {
  const auth = await requirePermission("products.read");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    redirect("/dashboard");
  }

  const companyId = auth.context!.user!.companyId;
  if (!companyId) {
    redirect("/dashboard");
  }

  const initialData = await fetchProductItemsPageData(companyId, {
    page: 1,
    limit: 10,
  });

  return <ProductItemsPanel initialData={initialData} />;
}
