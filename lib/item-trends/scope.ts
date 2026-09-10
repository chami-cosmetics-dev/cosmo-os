import "server-only";

import { resolveOsfColumns } from "@/lib/osf/column-config";
import { prisma } from "@/lib/prisma";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";

import { isCosmeticsLkLocationName } from "@/lib/cosmetics-lk-location";
import { isCosmeticsLkInternalShopColumn } from "@/lib/item-trends/physical-shops";
import type { ItemTrendScope } from "@/lib/item-trends/types";

type Context = Awaited<ReturnType<typeof getCurrentUserContext>>;

export async function resolveItemTrendsScope(context: Context | null): Promise<ItemTrendScope> {
  if (!context?.user) {
    return { companyWide: false, locationId: null, columnKeys: null };
  }

  const companyWide =
    hasPermission(context, "purchasing.osf.manage") ||
    context.roleNames.includes("admin") ||
    context.roleNames.includes("super_admin");

  if (companyWide) {
    return { companyWide: true, locationId: null, columnKeys: null };
  }

  const profile = await prisma.employeeProfile.findUnique({
    where: { userId: context.user.id },
    select: { locationId: true },
  });

  const locationId = profile?.locationId ?? null;
  if (!locationId || !context.user.companyId) {
    return { companyWide: true, locationId: null, columnKeys: null };
  }

  const location = await prisma.companyLocation.findUnique({
    where: { id: locationId },
    select: { name: true, shortName: true },
  });
  const atCosmeticsLk =
    isCosmeticsLkLocationName(location?.name) || isCosmeticsLkLocationName(location?.shortName);

  const columns = await resolveOsfColumns(context.user.companyId);
  const columnKeys = columns
    .filter((c) => {
      if (!c.active) return false;
      if (c.companyLocationId === locationId) return true;
      return atCosmeticsLk && isCosmeticsLkInternalShopColumn(c);
    })
    .map((c) => c.key);

  return {
    companyWide: false,
    locationId,
    columnKeys: columnKeys.length > 0 ? columnKeys : null,
  };
}
