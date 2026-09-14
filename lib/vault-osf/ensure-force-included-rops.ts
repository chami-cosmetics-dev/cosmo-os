import "server-only";

import { prisma } from "@/lib/prisma";
import { VAULT_OSF_MANUAL_ROP } from "@/lib/vault-osf/sku-policy";

/**
 * Seed ROP from the checked workbook (yellow manual fills + blue NTC03-1)
 * when no ProductOsfRop row exists yet. Does not overwrite existing ROP
 * (later ROP template uploads win).
 */
export async function ensureVaultForceIncludedRops(companyId: string): Promise<void> {
  for (const [sku, rops] of Object.entries(VAULT_OSF_MANUAL_ROP)) {
    for (const [columnKey, qty] of Object.entries(rops)) {
      if (qty == null || !Number.isFinite(qty)) continue;
      const existing = await prisma.productOsfRop.findUnique({
        where: {
          companyId_sku_columnKey: { companyId, sku, columnKey },
        },
        select: { id: true },
      });
      if (existing) continue;
      await prisma.productOsfRop.create({
        data: { companyId, sku, columnKey, ropQty: qty },
      });
    }
  }
}
