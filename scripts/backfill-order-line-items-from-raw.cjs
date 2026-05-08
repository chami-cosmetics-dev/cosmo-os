/* eslint-disable no-console, @typescript-eslint/no-require-imports */
const { PrismaClient, Prisma } = require("@prisma/client");

const prisma = new PrismaClient();
const UNCATEGORIZED_NAME = "Uncategorized";

function variantKey(lineItem) {
  if (lineItem.variant_id != null && lineItem.variant_id !== "") {
    return String(lineItem.variant_id);
  }
  return `lineitem-${lineItem.id}`;
}

function text(value, fallback = "") {
  return String(value ?? fallback).trim();
}

async function ensureProductItem(tx, order, lineItem) {
  const shopifyVariantId = variantKey(lineItem);
  const shopifyProductId = String(lineItem.product_id ?? 0);

  const existing = await tx.productItem.findUnique({
    where: {
      companyLocationId_shopifyVariantId: {
        companyLocationId: order.companyLocationId,
        shopifyVariantId,
      },
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  let vendorId = null;
  const vendorName = text(lineItem.vendor).slice(0, 100);
  if (vendorName) {
    const vendor = await tx.vendor.upsert({
      where: { companyId_name: { companyId: order.companyId, name: vendorName } },
      create: { companyId: order.companyId, name: vendorName },
      update: {},
      select: { id: true },
    });
    vendorId = vendor.id;
  }

  const category = await tx.category.upsert({
    where: { companyId_name: { companyId: order.companyId, name: UNCATEGORIZED_NAME } },
    create: { companyId: order.companyId, name: UNCATEGORIZED_NAME },
    update: {},
    select: { id: true },
  });

  const productItem = await tx.productItem.create({
    data: {
      companyId: order.companyId,
      companyLocationId: order.companyLocationId,
      shopifyLocationId: order.companyLocation.shopifyLocationId ?? order.companyLocationId,
      shopifyProductId,
      shopifyVariantId,
      productTitle: text(lineItem.title, "Unknown").slice(0, 500),
      variantTitle: text(lineItem.variant_title) || null,
      sku: text(lineItem.sku).slice(0, 100) || null,
      price: new Prisma.Decimal(lineItem.price ?? "0"),
      vendorId,
      categoryId: category.id,
    },
    select: { id: true },
  });

  return productItem.id;
}

async function main() {
  const orders = await prisma.order.findMany({
    where: {},
    select: {
      id: true,
      companyId: true,
      companyLocationId: true,
      rawPayload: true,
      name: true,
      orderNumber: true,
      companyLocation: { select: { shopifyLocationId: true } },
      _count: { select: { lineItems: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  let scanned = 0;
  let repaired = 0;
  let upserted = 0;

  for (const order of orders) {
    const lineItems = Array.isArray(order.rawPayload?.line_items)
      ? order.rawPayload.line_items
      : [];
    if (lineItems.length === 0) continue;
    scanned += 1;
    if (order._count.lineItems >= lineItems.length) continue;

    await prisma.$transaction(async (tx) => {
      for (const lineItem of lineItems) {
        const productItemId = await ensureProductItem(tx, order, lineItem);
        await tx.orderLineItem.upsert({
          where: {
            orderId_shopifyLineItemId: {
              orderId: order.id,
              shopifyLineItemId: String(lineItem.id),
            },
          },
          create: {
            orderId: order.id,
            productItemId,
            shopifyLineItemId: String(lineItem.id),
            quantity: Number(lineItem.quantity ?? 1),
            price: new Prisma.Decimal(lineItem.price ?? "0"),
          },
          update: {
            productItemId,
            quantity: Number(lineItem.quantity ?? 1),
            price: new Prisma.Decimal(lineItem.price ?? "0"),
          },
        });
        upserted += 1;
      }
    });

    repaired += 1;
    console.log(`repaired ${order.name ?? order.orderNumber ?? order.id}`);
  }

  console.log(`Scanned ${scanned} orders with raw line items.`);
  console.log(`Repaired ${repaired} orders; upserted ${upserted} line item rows.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
