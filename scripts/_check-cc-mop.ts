import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const ids = [
    "cmrz6viud000nl404ghlfjc25",
    "cmr1umzaw004rld04hq44ik9x",
    "cmr1eloay0003ld04hurrufmb",
    "cmr0zttot0009jp04atmm5ehd",
    "cmr10sv1z00cjjp04qcin0syr",
  ];

  const orders = await prisma.order.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      companyId: true,
      fulfillmentStage: true,
      financialStatus: true,
      invoiceCompleteAt: true,
      erpnextInvoiceId: true,
      paymentGatewayPrimary: true,
      companyLocation: {
        select: {
          id: true,
          name: true,
          erpnextCompany: true,
          erpnextInstance: {
            select: {
              id: true,
              webxpayMop: true,
              kokoMop: true,
              bankTransferMop: true,
              baseUrl: true,
            },
          },
        },
      },
    },
  });

  console.log(JSON.stringify(orders, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
