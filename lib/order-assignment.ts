import type { ShopifyOrderWebhookPayload } from "@/lib/validation/shopify-order";
import type { CompanyLocation, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function resolveAssignedMerchant(
  order: ShopifyOrderWebhookPayload,
  companyLocation: CompanyLocation & { defaultMerchant?: User | null }
): Promise<string | null> {
  const sourceName = (order.source_name ?? "web").toLowerCase();
  const companyId = companyLocation.companyId;

  if (sourceName === "pos" && order.user_id != null) {
    const shopifyUserId = String(order.user_id);
    const merchant = await prisma.user.findFirst({
      where: {
        companyId,
        shopifyUserIds: { has: shopifyUserId },
      },
      select: { id: true },
    });
    if (merchant) return merchant.id;
  }

  if (sourceName === "web" && order.discount_codes && order.discount_codes.length > 0) {
    const codes = order.discount_codes.map((d) => d.code?.toLowerCase().trim()).filter(Boolean);
    if (codes.length > 0) {
      const merchants = await prisma.user.findMany({
        where: { companyId },
        select: { id: true, couponCodes: true },
      });
      for (const merchant of merchants) {
        const hasMatch = merchant.couponCodes.some(
          (c) => codes.includes(c.toLowerCase().trim())
        );
        if (hasMatch) return merchant.id;
      }
    }
  }

  return companyLocation.defaultMerchantUserId ?? null;
}
