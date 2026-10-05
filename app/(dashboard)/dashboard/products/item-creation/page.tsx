import { redirect } from "next/navigation";

import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { ItemCreationPanel } from "@/components/organisms/item-creation-panel";
import {
  canUseItemCreation,
  ITEM_CREATION_PERMISSIONS,
  listItemRequests,
} from "@/lib/item-creation/workflow";
import { requireAnyPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const ANY_ITEM_CREATION_PERMISSION = Object.values(ITEM_CREATION_PERMISSIONS);

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCurrentMonthFilters() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    createdFrom: formatDateInput(start),
    createdTo: formatDateInput(end),
  };
}

export default async function ItemCreationPage() {
  const auth = await requireAnyPermission(ANY_ITEM_CREATION_PERMISSION);
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return <PermissionDeniedCard />;
  }

  const context = auth.context!;
  const permissions = {
    admin: canUseItemCreation(context, ITEM_CREATION_PERMISSIONS.admin),
    seo: canUseItemCreation(context, ITEM_CREATION_PERMISSIONS.seo),
    digitalMarketing: canUseItemCreation(
      context,
      ITEM_CREATION_PERMISSIONS.digitalMarketing
    ),
    purchasing: canUseItemCreation(context, ITEM_CREATION_PERMISSIONS.purchasing),
    stores: canUseItemCreation(context, ITEM_CREATION_PERMISSIONS.stores),
  };

  const initialFilters = getCurrentMonthFilters();
  const initialItems = await listItemRequests(context, initialFilters);

  return (
    <ItemCreationPanel
      initialItems={JSON.parse(JSON.stringify(initialItems))}
      initialFilters={initialFilters}
      permissions={permissions}
    />
  );
}
