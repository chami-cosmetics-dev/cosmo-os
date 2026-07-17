import "server-only";

import { prisma } from "@/lib/prisma";

export type OsfBuyerRecord = {
  id: string;
  name: string;
  brands: string[];
  sortOrder: number;
  active: boolean;
};

/** All buyers for a company, ordered for display and sheet generation. */
export async function listOsfBuyers(companyId: string): Promise<OsfBuyerRecord[]> {
  const buyers = await prisma.osfBuyer.findMany({
    where: { companyId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, brands: true, sortOrder: true, active: true },
  });
  return buyers.map((b) => ({
    id: b.id,
    name: b.name,
    brands: b.brands ?? [],
    sortOrder: b.sortOrder,
    active: b.active,
  }));
}
