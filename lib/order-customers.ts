import type { ShopifyOrderWebhookPayload } from "@/lib/validation/shopify-order";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { LIMITS } from "@/lib/validation";

export async function ensureCustomerAndLink(
  order: ShopifyOrderWebhookPayload,
  companyId: string,
  isNewOrder: boolean
): Promise<string | null> {
  const customerData = order.customer;
  if (!customerData || customerData.id == null) return null;

  const shopifyCustomerId = String(customerData.id);
  const email = customerData.email?.trim().slice(0, LIMITS.email.max) ?? null;
  const firstName = customerData.first_name?.trim().slice(0, LIMITS.name.max) ?? null;
  const lastName = customerData.last_name?.trim().slice(0, LIMITS.name.max) ?? null;
  const phone = customerData.phone?.trim().slice(0, LIMITS.mobile.max) ?? null;
  const defaultAddress = customerData.default_address
    ? (customerData.default_address as Prisma.InputJsonValue)
    : Prisma.JsonNull;

  const orderCreatedAt = order.created_at
    ? new Date(order.created_at)
    : new Date();

  const existing = await prisma.customer.findUnique({
    where: {
      companyId_shopifyCustomerId: { companyId, shopifyCustomerId },
    },
  });

  if (existing) {
    await prisma.customer.update({
      where: { id: existing.id },
      data: {
        email,
        firstName,
        lastName,
        phone,
        defaultAddress,
        ...(isNewOrder
          ? {
              orderCount: { increment: 1 },
              lastPurchaseAt: orderCreatedAt,
            }
          : {
              lastPurchaseAt:
                !existing.lastPurchaseAt ||
                orderCreatedAt > existing.lastPurchaseAt
                  ? orderCreatedAt
                  : undefined,
            }),
      },
    });
    return existing.id;
  }

  const created = await prisma.customer.create({
    data: {
      companyId,
      shopifyCustomerId,
      email,
      firstName,
      lastName,
      phone,
      defaultAddress,
      orderCount: isNewOrder ? 1 : 0,
      lastPurchaseAt: isNewOrder ? orderCreatedAt : null,
    },
  });
  return created.id;
}
