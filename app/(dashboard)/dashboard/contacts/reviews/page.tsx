import { redirect } from "next/navigation";

import { MerchantReviewPanel } from "@/components/organisms/merchant-review-panel";
import { fetchMerchantReviewSheetData } from "@/lib/page-data/merchant-review-sheet";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function MerchantReviewsPage() {
  const auth = await requirePermission("orders.read");
  if (!auth.ok) {
    if (auth.status === 401) {
      redirect("/login");
    }
    redirect("/dashboard");
  }

  const companyId = auth.context!.user!.companyId;
  if (!companyId) {
    redirect("/dashboard");
  }

  const initialData = await fetchMerchantReviewSheetData({
    companyId,
    viewerUserId: auth.context!.user!.id,
    canManage: auth.context!.permissionKeys.includes("orders.manage"),
  });

  return (
    <MerchantReviewPanel
      initialData={initialData}
      canManage={auth.context!.permissionKeys.includes("orders.manage")}
    />
  );
}
