import { Decimal } from "@prisma/client/runtime/library";
import type { ShopifyOrderWebhookPayload } from "@/lib/validation/shopify-order";
import type { CompanyLocation, Order } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getShadowSourceLocationId } from "@/lib/shadow-location-products";
import { findBarcodeForSku } from "@/lib/product-item-barcode.server";
import { LIMITS } from "@/lib/validation";

const UNCATEGORIZED_NAME = "Uncategorized";

type LineItem = ShopifyOrderWebhookPayload["line_items"][number];

/** Shopify sends null variant_id for custom line items; use a stable synthetic key per line. */
function shopifyVariantKey(lineItem: LineItem): string {
  const v = lineItem.variant_id;
  if (v != null && v !== "") return String(v);
  return `lineitem-${lineItem.id}`;
}




export async function ensureProductItemAndCreateLineItem(
  order: Order,
  lineItem: LineItem,
  location: CompanyLocation
): Promise<void> {
  const companyId = location.companyId;
  const sourceLocationId = getShadowSourceLocationId(location);
  const sourceShopifyLocationId =
    sourceLocationId === location.id
      ? location.shopifyLocationId
      : (
          await prisma.companyLocation.findUnique({
            where: { id: sourceLocationId },
            select: { shopifyLocationId: true },
          })
        )?.shopifyLocationId;
  const shopifyVariantId = shopifyVariantKey(lineItem);
  const shopifyProductId = String(lineItem.product_id ?? 0);

  let productItem = await prisma.productItem.findUnique({
    where: {
      companyLocationId_shopifyVariantId: {
        companyLocationId: sourceLocationId,
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
    const sku = lineItem.sku?.slice(0, LIMITS.sku.max) ?? null;
    const catalogBarcode = await findBarcodeForSku(companyId, sku);

    productItem = await prisma.productItem.create({
      data: {
        companyId,
        companyLocationId: sourceLocationId,
        shopifyLocationId: sourceShopifyLocationId ?? String(sourceLocationId),
        shopifyProductId,
        shopifyVariantId,
        productTitle,
        variantTitle: null,
        sku,
        price,
        compareAtPrice: null,
        vendorId,
        categoryId: category.id,
        status: null,
        productType: null,
        handle: null,
        imageUrl: null,
        tags: null,
        barcode: catalogBarcode?.slice(0, 100) ?? null,
        itemStatusCategory: "NEWLY_ADDED",
        itemStatusLabel: "Newly Added",
        inventoryQuantity: 0,
      },
    });
  } else if (!productItem.barcode) {
    const catalogBarcode = await findBarcodeForSku(companyId, productItem.sku);
    if (catalogBarcode) {
      productItem = await prisma.productItem.update({
        where: { id: productItem.id },
        data: { barcode: catalogBarcode.slice(0, 100) },
      });
    }
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
