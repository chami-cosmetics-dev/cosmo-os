import { redirect } from "next/navigation";

import { OutletReviewPanel } from "@/components/organisms/outlet-review-panel";
import { fetchOutletReviewSheetData } from "@/lib/page-data/outlet-review-sheet";
import { requireAnyPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function OutletReviewsPage() {
  const auth = await requireAnyPermission(["outlets.read.all", "outlets.read.assigned"]);
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    redirect("/dashboard");
  }

  const companyId = auth.context.user?.companyId ?? null;
  const viewerUserId = auth.context.user?.id ?? null;
  if (!companyId || !viewerUserId) redirect("/dashboard");

  const canReadAll = auth.context.permissionKeys.includes("outlets.read.all");

  const initialData = await fetchOutletReviewSheetData({
    companyId,
    viewerUserId,
    canReadAll,
  });

  return <OutletReviewPanel initialData={initialData} canReadAll={canReadAll} />;
}
