import { redirect } from "next/navigation";

import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { NewItemRequestPanel } from "@/components/organisms/new-item-request-panel";
import {
  canAdminNewItemRequests,
  NEW_ITEM_REQUESTS_ANY_PERMISSION,
} from "@/lib/new-item-requests/permissions";
import { listBrandGroups, listOwnRequests } from "@/lib/new-item-requests/store";
import { requireAnyPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function NewItemRequestsPage() {
  const auth = await requireAnyPermission([...NEW_ITEM_REQUESTS_ANY_PERMISSION]);
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return <PermissionDeniedCard />;
  }

  const context = auth.context!;
  const isAdmin = canAdminNewItemRequests(context);
  const filters = { status: "open" as const };
  const [initialRequests, initialBrands] = await Promise.all([
    isAdmin ? Promise.resolve([]) : listOwnRequests(context, filters),
    isAdmin ? listBrandGroups(context, filters) : Promise.resolve([]),
  ]);

  return (
    <NewItemRequestPanel
      isAdmin={isAdmin}
      initialRequests={initialRequests}
      initialBrands={initialBrands}
    />
  );
}
