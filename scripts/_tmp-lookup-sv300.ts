import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

function loadEnvFile(path: string) {
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^DATABASE_URL=(.*)$/);
    if (!m) continue;
    let v = m[1].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env.DATABASE_URL = v;
    return;
  }
  throw new Error(`No DATABASE_URL in ${path}`);
}

const envFile = process.argv[2] ?? ".env.vault";
const q = process.argv[3] ?? "SV300-0177";
loadEnvFile(envFile);
const prisma = new PrismaClient();

async function main() {
  const orders = await prisma.order.findMany({
    where: {
      OR: [
        { name: { contains: q } },
        { orderNumber: { contains: q } },
        { erpnextInvoiceId: { contains: q } },
      ],
    },
    select: {
      id: true,
      name: true,
      orderNumber: true,
      erpnextInvoiceId: true,
      financialStatus: true,
      fulfillmentStage: true,
      cancelledAt: true,
      cancelledById: true,
      cancelReason: true,
      updatedAt: true,
      erpReturnSalesInvoiceIds: true,
      cancelledBy: { select: { name: true, email: true } },
      returns: {
        orderBy: { createdAt: "desc" },
        take: 3,
        select: {
          actionType: true,
          actionStatus: true,
          actionDate: true,
          cancelRemark: true,
          actionBy: { select: { name: true, email: true } },
        },
      },
    },
    take: 5,
  });
  console.log(JSON.stringify({ envFile, count: orders.length, orders }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
