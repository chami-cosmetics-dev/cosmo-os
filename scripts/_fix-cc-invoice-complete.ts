import { PrismaClient } from "@prisma/client";
import { markOrderFinanciallyInvoiceComplete } from "../lib/financial-invoice-complete";
import { markOrderInvoiceComplete } from "../lib/mark-order-invoice-complete";
import { syncFinanceApprovedPrepaidPaymentToERPNext } from "../lib/erpnext-sync";

const prisma = new PrismaClient();

const TARGETS = [
  { id: "cmrz6viud000nl404ghlfjc25", name: "60017325" },
  { id: "cmr1umzaw004rld04hq44ik9x", name: "60016370" },
  { id: "cmr1eloay0003ld04hurrufmb", name: "60016353" },
  { id: "cmr0zttot0009jp04atmm5ehd", name: "60016338" },
  { id: "cmr10sv1z00cjjp04qcin0syr", name: "60016330" },
];

async function main() {
  const actor = await prisma.user.findFirst({
    where: { email: { contains: "sasida", mode: "insensitive" } },
    select: { id: true, email: true },
  });
  if (!actor) {
    throw new Error("No actor user found for invoice-complete audit");
  }

  const results: Array<Record<string, unknown>> = [];

  for (const t of TARGETS) {
    const order = await prisma.order.findUnique({
      where: { id: t.id },
      include: {
        companyLocation: { include: { erpnextInstance: true } },
      },
    });

    if (!order || !order.companyLocation) {
      results.push({ name: t.name, ok: false, error: "order/location missing" });
      continue;
    }

    const mop = order.companyLocation.erpnextInstance?.webxpayMop ?? null;
    const row: Record<string, unknown> = {
      name: t.name,
      stageBefore: order.fulfillmentStage,
      invoiceCompleteAtBefore: order.invoiceCompleteAt,
      si: order.erpnextInvoiceId,
      webxpayMop: mop,
      actor: actor.email,
    };

    try {
      await syncFinanceApprovedPrepaidPaymentToERPNext(
        {
          name: order.name,
          shopifyOrderId: order.shopifyOrderId,
          erpnextInvoiceId: order.erpnextInvoiceId,
          paymentGatewayPrimary: order.paymentGatewayPrimary,
          paymentGatewayNames: order.paymentGatewayNames ?? [],
          financialStatus: "paid",
        },
        order.companyLocation,
        order.createdAt,
        { requirePe: true },
      );
      row.pe = "ok";
    } catch (err) {
      row.pe = "error";
      row.peError = err instanceof Error ? err.message : String(err);
      results.push({ ...row, ok: false });
      continue;
    }

    await markOrderFinanciallyInvoiceComplete({ orderId: order.id, userId: actor.id });
    row.financialInvoiceComplete = true;

    if (order.fulfillmentStage === "delivery_complete") {
      const terminal = await markOrderInvoiceComplete({
        companyId: order.companyId,
        orderId: order.id,
        userId: actor.id,
      });
      row.terminal = terminal;
    } else {
      row.terminal = "skipped_not_delivery_complete";
    }

    const after = await prisma.order.findUnique({
      where: { id: order.id },
      select: {
        fulfillmentStage: true,
        invoiceCompleteAt: true,
        financialStatus: true,
        erpPeSyncError: true,
      },
    });
    row.after = after;
    row.ok = true;
    results.push(row);
  }

  console.log(JSON.stringify({ results }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
