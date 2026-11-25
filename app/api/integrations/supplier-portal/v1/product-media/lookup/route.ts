import { prisma } from "@/lib/prisma";
import { createProductMediaHandler } from "@/lib/product-media/lookup";
import { normalizeShopifyStoreHandle } from "@/lib/shopify-admin";

export const POST = createProductMediaHandler({
  config: () => process.env.SUPPLIER_PORTAL_PRODUCT_MEDIA_BINDING_JSON,
  load: (binding, skus) => prisma.$transaction(async (tx) => {
    const location = await tx.companyLocation.findFirst({
      where: { id: binding.locationId, companyId: binding.companyId },
      select: { shopifyLocationId: true, shopifyAdminStoreHandle: true },
    });
    if (!location?.shopifyLocationId || !location.shopifyAdminStoreHandle ||
        normalizeShopifyStoreHandle(location.shopifyAdminStoreHandle) + ".myshopify.com" !== binding.storeHostname) return null;
    // Database-side filtering and a per-SKU cap preserve ambiguity without returning large candidate sets.
    return tx.$queryRaw<Array<{
      id: string; sku: string | null; shopifyProductId: string; shopifyVariantId: string;
      imageUrl: string | null; updatedAt: Date;
    }>>`
      SELECT media.* FROM unnest(${skus}::text[]) AS requested(sku)
      CROSS JOIN LATERAL (
        SELECT p.id, p.sku, p."shopifyProductId", p."shopifyVariantId", p."imageUrl", p."updatedAt"
        FROM "ProductItem" p WHERE p."companyId" = ${binding.companyId}
          AND p."companyLocationId" = ${binding.locationId} AND p."shopifyLocationId" = ${location.shopifyLocationId}
          AND p.sku = requested.sku AND p."shopifyProductId" ~ '^[1-9][0-9]{0,29}$'
          AND p."shopifyVariantId" ~ '^[1-9][0-9]{0,29}$'
        ORDER BY p.id LIMIT 6
      ) AS media
    `;
  }, { isolationLevel: "RepeatableRead" }),
});
