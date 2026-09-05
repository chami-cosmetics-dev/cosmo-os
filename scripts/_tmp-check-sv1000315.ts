import { PrismaClient } from "@prisma/client";

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const prisma = new PrismaClient({
  datasources: url ? { db: { url } } : undefined,
});

function json(value: unknown) {
  return JSON.stringify(
    value,
    (_, v) =>
      v != null && typeof v === "object" && "toFixed" in v ? String(v) : v,
    2,
  );
}

async function main() {
  const order = await prisma.order.findFirst({
    where: {
      OR: [
        { name: "SV1008079" },
        { erpnextInvoiceId: "SV100-0315" },
        { orderNumber: "SV1008079" },
      ],
    },
    select: {
      id: true,
      name: true,
      orderNumber: true,
      shopifyOrderId: true,
      sourceName: true,
      financialStatus: true,
      fulfillmentStatus: true,
      fulfillmentStage: true,
      paymentGatewayPrimary: true,
      paymentGatewayNames: true,
      totalPrice: true,
      erpnextInvoiceId: true,
      erpPeSyncError: true,
      erpPeSyncFailedAt: true,
      erpPeSyncMop: true,
      invoiceCompleteAt: true,
      invoiceCompleteById: true,
      deliveryCompleteAt: true,
      createdAt: true,
      updatedAt: true,
      revertedFromInvoiceCompleteAt: true,
      rawPayload: true,
    },
  });

  console.log("ORDER_FOUND", Boolean(order));
  if (!order) return;

  const { rawPayload, ...rest } = order;
  const payload = rawPayload as Record<string, unknown> | null;
  console.log("ORDER", json(rest));
  console.log(
    "SHOPIFY_FINANCIAL",
    json({
      financial_status: payload?.financial_status ?? null,
      fulfillment_status: payload?.fulfillment_status ?? null,
      gateway: payload?.gateway ?? null,
      payment_gateway_names: payload?.payment_gateway_names ?? null,
      updated_at: payload?.updated_at ?? null,
    }),
  );

  const [payments, audits, approvals] = await Promise.all([
    prisma.orderPaymentEntry.findMany({ where: { orderId: order.id } }),
    prisma.auditLog.findMany({
      where: { entityId: order.id },
      orderBy: { createdAt: "asc" },
      select: {
        createdAt: true,
        action: true,
        summary: true,
        metadata: true,
        beforeData: true,
        afterData: true,
        actorUserId: true,
      },
    }),
    prisma.approvalRequest.findMany({
      where: { orderId: order.id },
      select: {
        type: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        reviewNote: true,
      },
    }),
  ]);

  console.log("PAYMENTS", json(payments));
  console.log("APPROVALS", json(approvals));
  console.log("AUDITS", json(audits));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
