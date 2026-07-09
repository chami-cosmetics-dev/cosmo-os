import { redirect } from "next/navigation";

import { MerchantReviewPanel } from "@/components/organisms/merchant-review-panel";
import { fetchMerchantReviewSheetData } from "@/lib/page-data/merchant-review-sheet";
import { hasPermission, requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function MerchantReviewsPage() {
  const auth = await requirePermission("merchant_reviews.read");
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
  const canManageMerchantReviews = hasPermission(auth.context!, "merchant_reviews.manage");

  const initialData = await fetchMerchantReviewSheetData({
    companyId,
    viewerUserId: auth.context!.user!.id,
    canManage: canManageMerchantReviews,
  });

  return (
    <MerchantReviewPanel
      initialData={initialData}
      canManage={canManageMerchantReviews}
    />
  );
}
