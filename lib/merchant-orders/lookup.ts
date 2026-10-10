import { Prisma } from "@prisma/client";

import { buildPhoneLookupVariants } from "@/lib/phone-lookup";
import { prisma } from "@/lib/prisma";
import type { MerchantOrderRecord } from "@/lib/merchant-orders/present";

const orderSelect = {
  shopifyOrderId: true,
  name: true,
  orderNumber: true,
  customerEmail: true,
  customerPhone: true,
  createdAt: true,
  financialStatus: true,
  fulfillmentStatus: true,
  currency: true,
  subtotalPrice: true,
  totalShipping: true,
  totalTax: true,
  totalPrice: true,
  shippingAddress: true,
  billingAddress: true,
  rawPayload: true,
  lineItems: {
    select: {
      shopifyLineItemId: true,
      quantity: true,
      price: true,
      discountPercent: true,
      productItem: {
        select: {
          productTitle: true,
          variantTitle: true,
          sku: true,
          imageUrl: true,
          shopifyVariantId: true,
        },
      },
    },
  },
} satisfies Prisma.OrderSelect;

type SelectedOrder = Prisma.OrderGetPayload<{ select: typeof orderSelect }>;

export function buildMerchantOrderWhere(input: {
  companyId: string;
  email?: string;
  phone?: string;
}): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = { companyId: input.companyId };
  if (input.email) {
    where.customerEmail = { equals: input.email, mode: "insensitive" };
  }
  if (input.phone) {
    where.customerPhone = { in: buildPhoneLookupVariants(input.phone) };
  }
  return where;
}

export async function resolveMerchantOrdersCompanyId(): Promise<string | null> {
  const configured = process.env.MERCHANT_ORDERS_COMPANY_ID?.trim();
  if (configured) {
    const company = await prisma.company.findUnique({
      where: { id: configured },
      select: { id: true },
    });
    return company?.id ?? null;
  }

  const companies = await prisma.company.findMany({
    select: { id: true },
    take: 2,
  });
  return companies.length === 1 ? companies[0].id : null;
}

function toRecord(order: SelectedOrder): MerchantOrderRecord {
  return {
    shopifyOrderId: order.shopifyOrderId,
    name: order.name,
    orderNumber: order.orderNumber,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    createdAt: order.createdAt,
    financialStatus: order.financialStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    currency: order.currency,
    subtotalPrice: order.subtotalPrice,
    totalShipping: order.totalShipping,
    totalTax: order.totalTax,
    totalPrice: order.totalPrice,
    shippingAddress: order.shippingAddress,
    billingAddress: order.billingAddress,
    rawPayload: order.rawPayload,
    lineItems: order.lineItems.map((line) => ({
      shopifyLineItemId: line.shopifyLineItemId,
      quantity: line.quantity,
      price: line.price,
      discountPercent: line.discountPercent,
      title: line.productItem.productTitle,
      variantTitle: line.productItem.variantTitle,
      sku: line.productItem.sku,
      imageUrl: line.productItem.imageUrl,
      shopifyVariantId: line.productItem.shopifyVariantId,
    })),
  };
}

export async function listMerchantOrders(input: {
  companyId: string;
  email?: string;
  phone?: string;
  page: number;
  limit: number;
}): Promise<{ total: number; orders: MerchantOrderRecord[] }> {
  const where = buildMerchantOrderWhere(input);
  const [total, orders] = await prisma.$transaction([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      select: orderSelect,
    }),
  ]);

  return { total, orders: orders.map(toRecord) };
}
