import { redirect } from "next/navigation";

import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { ItemDraftingPanel } from "@/components/organisms/item-drafting-panel";
import { resolveItemDraftingAccess } from "@/lib/discontinued-items/config";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function ItemDraftingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const context = await getCurrentUserContext();
  if (!context?.user) redirect("/login");

  const access = resolveItemDraftingAccess((key) => hasPermission(context, key));
  if (!access.canPurchasingApproval && !access.canShopifyDraft) return <PermissionDeniedCard />;

  return <ItemDraftingPanel {...access} initialTab={tab ?? null} />;
}
