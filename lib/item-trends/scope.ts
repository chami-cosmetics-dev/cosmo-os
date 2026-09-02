import "server-only";

import { resolveOsfColumns } from "@/lib/osf/column-config";
import { prisma } from "@/lib/prisma";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";

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

  const columns = await resolveOsfColumns(context.user.companyId);
  const columnKeys = columns
    .filter((c) => c.active && c.companyLocationId === locationId)
    .map((c) => c.key);

  return {
    companyWide: false,
    locationId,
    columnKeys: columnKeys.length > 0 ? columnKeys : null,
  };
}
