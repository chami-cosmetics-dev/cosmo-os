import "server-only";

import { prisma } from "@/lib/prisma";
import type { ShopScope } from "@/lib/material-transfer/receive";

export async function loadShopScope(userId: string, companyId: string): Promise<ShopScope> {
  const profile = await prisma.employeeProfile.findFirst({
    where: { userId, companyId },
    select: {
      outlet: { select: { name: true } },
      location: {
        select: {
          erpnextWarehouse: true,
          erpWarehouses: { select: { warehouse: true } },
        },
      },
    },
  });
  const explicit = [
    profile?.location?.erpnextWarehouse,
    ...(profile?.location?.erpWarehouses.map((row) => row.warehouse) ?? []),
  ]
    .map((name) => (name ?? "").trim())
    .filter(Boolean);
  return {
    explicitWarehouses: [...new Set(explicit)],
    outletName: profile?.outlet?.name?.trim() || null,
  };
}
