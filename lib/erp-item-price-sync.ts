import "server-only";

import { Prisma } from "@prisma/client";

import { decideErpItemPriceProductSync } from "@/lib/erp-item-price-decision";
import { prisma } from "@/lib/prisma";

export { decideErpItemPriceProductSync } from "@/lib/erp-item-price-decision";

/**
 * Write ERP Standard Selling rate onto ProductItem.price for all matching SKUs in the company.
 * Does not touch OrderLineItem (order history stays as charged).
 */
export async function applyErpStandardSellingToProductItems(input: {
  companyId: string;
  sku: string;
  rate: string;
}): Promise<number> {
  const result = await prisma.productItem.updateMany({
    where: {
      companyId: input.companyId,
      sku: { equals: input.sku, mode: "insensitive" },
    },
    data: { price: new Prisma.Decimal(input.rate) },
  });
  return result.count;
}

/**
 * Resolve Cosmo company IDs that trust this incoming webhook secret.
 * Item Price has no `company` field, so auth is secret → ErpnextInstance.companyId.
 */
export async function resolveCompanyIdsForErpWebhookSecret(
  incomingSecret: string,
): Promise<string[]> {
  if (!incomingSecret) return [];

  const byInstanceSecret = await prisma.erpnextInstance.findMany({
    where: { incomingWebhookSecret: incomingSecret },
    select: { companyId: true },
  });
  if (byInstanceSecret.length > 0) {
    return [...new Set(byInstanceSecret.map((r) => r.companyId))];
  }

  const envSecret = process.env.ERPNEXT_INCOMING_WEBHOOK_SECRET ?? "";
  if (!envSecret || incomingSecret !== envSecret) return [];

  const fallback = await prisma.erpnextInstance.findMany({
    where: {
      OR: [{ incomingWebhookSecret: null }, { incomingWebhookSecret: "" }],
    },
    select: { companyId: true },
  });
  return [...new Set(fallback.map((r) => r.companyId))];
}
