import { redirect } from "next/navigation";

import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { SeoContentDashboard } from "@/components/organisms/seo-content-dashboard";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { fetchSeoContentDashboardData } from "@/lib/seo-content/dashboard";
import { SEO_CONTENT_PERMISSION } from "@/lib/seo-content/types";

export const dynamic = "force-dynamic";

export default async function SeoContentPage() {
  const auth = await requirePermission(SEO_CONTENT_PERMISSION);
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return <PermissionDeniedCard />;
  }

  const companyId = auth.context!.user!.companyId;
  if (!companyId) {
    return <PermissionDeniedCard />;
  }

  const data = await fetchSeoContentDashboardData(companyId);

  return (
    <SeoContentDashboard
      data={data}
      canViewStorage={hasPermission(auth.context!, "products.storage.read")}
    />
  );
}
