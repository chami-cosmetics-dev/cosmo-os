import { Decimal } from "@prisma/client/runtime/library";
import type { ShopifyOrderWebhookPayload } from "@/lib/validation/shopify-order";
import type { CompanyLocation, Order } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { LIMITS } from "@/lib/validation";

const UNCATEGORIZED_NAME = "Uncategorized";

type LineItem = ShopifyOrderWebhookPayload["line_items"][number];

export async function ensureProductItemAndCreateLineItem(
  order: Order,
  lineItem: LineItem,
  location: CompanyLocation
): Promise<void> {
  const companyId = location.companyId;
  const shopifyVariantId = String(lineItem.variant_id);
  const shopifyProductId = String(lineItem.product_id);

  let productItem = await prisma.productItem.findUnique({
    where: {
      companyLocationId_shopifyVariantId: {
        companyLocationId: location.id,
        shopifyVariantId,
      },
    },
  });

  if (!productItem) {
    const vendorName = (lineItem.vendor ?? "").trim().slice(0, LIMITS.vendorName.max);
    let vendorId: string | null = null;
    if (vendorName) {
      const vendor = await prisma.vendor.upsert({
        where: { companyId_name: { companyId, name: vendorName } },
        create: { companyId, name: vendorName },
        update: {},
      });
      vendorId = vendor.id;
    }

    const category = await prisma.category.upsert({
      where: { companyId_name: { companyId, name: UNCATEGORIZED_NAME } },
      create: { companyId, name: UNCATEGORIZED_NAME },
      update: {},
    });

    const productTitle = (lineItem.title ?? "Unknown").slice(0, LIMITS.productTitle.max);
    const price = new Decimal(lineItem.price);

    productItem = await prisma.productItem.create({
      data: {
        companyId,
        companyLocationId: location.id,
        shopifyLocationId: location.shopifyLocationId ?? String(location.id),
        shopifyProductId,
        shopifyVariantId,
        productTitle,
        variantTitle: null,
        sku: lineItem.sku?.slice(0, LIMITS.sku.max) ?? null,
        price,
        compareAtPrice: null,
        vendorId,
        categoryId: category.id,
        status: null,
        productType: null,
        handle: null,
        imageUrl: null,
        tags: null,
        barcode: null,
        inventoryQuantity: 0,
      },
    });
  }

  const shopifyLineItemId = String(lineItem.id);
  const quantity = lineItem.quantity;
  const price = new Decimal(lineItem.price);

  await prisma.orderLineItem.upsert({
    where: {
      orderId_shopifyLineItemId: {
        orderId: order.id,
        shopifyLineItemId,
      },
    },
    create: {
      orderId: order.id,
      productItemId: productItem.id,
      shopifyLineItemId,
      quantity,
      price,
    },
    update: {
      productItemId: productItem.id,
      quantity,
      price,
    },
  });
}
