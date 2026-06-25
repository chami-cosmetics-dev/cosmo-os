import { Prisma } from "@prisma/client";

import { formatFailedErpSyncErrorMessage } from "@/lib/failed-erp-sync-classification";
import { createDeliveryPaymentEntry } from "@/lib/erpnext-sync";
import { prisma } from "@/lib/prisma";

function clampErrorMessage(message: string) {
  return formatFailedErpSyncErrorMessage(message).slice(0, 10_000);
}

export function buildFailedErpPeSyncWhere(companyId?: string, search?: string): Prisma.OrderWhereInput {
  const base: Prisma.OrderWhereInput = {
    ...(companyId ? { companyId } : {}),
    financialStatus: { not: "voided" },
    erpPeSyncError: { not: null },
    fulfillmentStage: "invoice_complete",
  };

  const term = search?.trim();
  if (!term) {
    return base;
  }

  return {
    AND: [
      base,
      {
        OR: [
          { orderNumber: { endsWith: term, mode: "insensitive" } },
          { name: { endsWith: term, mode: "insensitive" } },
          { erpnextInvoiceId: { endsWith: term, mode: "insensitive" } },
          { shopifyOrderId: { contains: term, mode: "insensitive" } },
          { customerEmail: { contains: term, mode: "insensitive" } },
          { customerPhone: { contains: term, mode: "insensitive" } },
          { erpPeSyncError: { contains: term, mode: "insensitive" } },
          { erpPeSyncMop: { contains: term, mode: "insensitive" } },
        ],
      },
    ],
  };
}

export async function markOrderErpPeSyncFailed(
  orderId: string,
  errorMessage: string,
  mopName: string,
  attemptedAt: Date = new Date(),
) {
  await prisma.order.update({
    where: { id: orderId },
    data: {
      erpPeSyncError: clampErrorMessage(errorMessage),
      erpPeSyncFailedAt: attemptedAt,
      erpPeSyncMop: mopName.trim().slice(0, 200),
    },
  });
}

export async function clearOrderErpPeSyncFailure(orderId: string) {
  await prisma.order.update({
    where: { id: orderId },
    data: {
      erpPeSyncError: null,
      erpPeSyncFailedAt: null,
      erpPeSyncMop: null,
    },
  });
}

export async function retryOrderErpPeSync(input: {
  orderId: string;
  companyId: string;
  mopName: string;
}) {
  const order = await prisma.order.findFirst({
    where: { id: input.orderId, companyId: input.companyId },
    include: { companyLocation: { include: { erpnextInstance: true } } },
  });
  if (!order?.companyLocation) {
    throw new Error("Order or company location not found");
  }
  if (!order.erpPeSyncError) {
    throw new Error("No failed ERP payment entry on this order");
  }

  await createDeliveryPaymentEntry(
    {
      name: order.name,
      shopifyOrderId: order.shopifyOrderId,
      sourceName: order.sourceName,
      paymentGatewayPrimary: order.paymentGatewayPrimary,
      paymentGatewayNames: order.paymentGatewayNames,
    },
    order.companyLocation,
    new Date(),
    { mopNameOverride: input.mopName },
  );

  await clearOrderErpPeSyncFailure(order.id);
}
