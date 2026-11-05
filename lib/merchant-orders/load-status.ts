import { Prisma } from "@prisma/client";

import { openMerchantOrderStatusToken } from "@/lib/merchant-orders/status-token";
import { prisma } from "@/lib/prisma";

const statusOrderSelect = {
  id: true,
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
  lineItems: {
    select: {
      quantity: true,
      price: true,
      productItem: {
        select: {
          productTitle: true,
          variantTitle: true,
          sku: true,
          imageUrl: true,
        },
      },
    },
  },
} satisfies Prisma.OrderSelect;

export type MerchantOrderStatusView = Prisma.OrderGetPayload<{ select: typeof statusOrderSelect }>;

export async function loadMerchantOrderStatusByToken(
  token: string,
): Promise<MerchantOrderStatusView | null> {
  const orderId = openMerchantOrderStatusToken(token);
  if (!orderId) return null;

  return prisma.order.findUnique({
    where: { id: orderId },
    select: statusOrderSelect,
  });
}
