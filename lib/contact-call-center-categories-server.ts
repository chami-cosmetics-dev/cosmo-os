import "server-only";

import {
  CALL_CENTER_CATEGORY_VALUES,
  sortCallCenterCategories,
} from "@/lib/contact-call-center-categories";
import { prisma } from "@/lib/prisma";

/**
 * Ensure company has the standard category templates in ContactAllocationOption.
 * Idempotent upserts by (companyId, type, value).
 */
export async function ensureDefaultCallCenterCategories(
  companyId: string,
): Promise<string[]> {
  await prisma.contactAllocationOption.createMany({
    data: CALL_CENTER_CATEGORY_VALUES.map((value) => ({
      companyId,
      type: "category",
      value,
    })),
    skipDuplicates: true,
  });

  const rows = await prisma.contactAllocationOption.findMany({
    where: { companyId, type: "category" },
    orderBy: { value: "asc" },
    select: { value: true },
  });
  return sortCallCenterCategories(rows.map((r) => r.value));
}
