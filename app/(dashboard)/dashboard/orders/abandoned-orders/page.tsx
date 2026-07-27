import { redirect } from "next/navigation";

import { AbandonedOrdersPanel } from "@/components/organisms/abandoned-orders-panel";
import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { prisma } from "@/lib/prisma";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { syncAbandonedCheckoutsForCompany } from "@/lib/abandoned-checkouts-sync";
import { fetchAbandonedOrdersPageData } from "@/lib/page-data/abandoned-orders";

export const dynamic = "force-dynamic";

export default async function AbandonedOrdersPage() {
  const auth = await requirePermission("abandoned_orders.read");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return <PermissionDeniedCard />;
  }

  const companyId = auth.context!.user!.companyId;
  if (!companyId) return <PermissionDeniedCard />;

  const canManage = hasPermission(auth.context!, "abandoned_orders.manage");

  // Always pull latest abandoned checkouts from Shopify when this page is opened.
  const syncTimeoutMs = 20_000;
  const syncPromise = syncAbandonedCheckoutsForCompany(companyId);
  try {
    await Promise.race([
      syncPromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Sync timeout")), syncTimeoutMs)
      ),
    ]);
  } catch {
    // Return cached DB rows even if sync fails or times out.
  } finally {
    void syncPromise.catch(() => {});
  }

  const syncRowAfter = await prisma.companyAbandonedCheckoutSync.findUnique({
    where: { companyId },
  });

  const initialData = await fetchAbandonedOrdersPageData({
    companyId,
    filters: {
      page: 1,
      limit: 10,
      from: undefined,
      to: undefined,
      followUpStatus: undefined,
      customerResponse: undefined,
      search: undefined,
    },
  });

  return (
    <AbandonedOrdersPanel
      initialData={initialData}
      sync={{
        lastSyncedAt: syncRowAfter?.lastSyncedAt?.toISOString() ?? null,
        lastSyncError: syncRowAfter?.lastSyncError ?? null,
      }}
      canManage={canManage}
    />
  );
}

