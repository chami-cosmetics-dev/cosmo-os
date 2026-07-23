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

loadEnvFile(".env.vault");
const prisma = new PrismaClient();

async function main() {
  const id = "cmrbr9th10007lb04flyanair";
  const before = await prisma.order.findUnique({
    where: { id },
    select: {
      name: true,
      financialStatus: true,
      cancelledAt: true,
      cancelledById: true,
      cancelReason: true,
      updatedAt: true,
    },
  });
  if (!before) {
    console.log("order not found");
    return;
  }
  if (before.cancelledAt) {
    console.log("already has cancelledAt", before);
    return;
  }
  const updated = await prisma.order.update({
    where: { id },
    data: {
      cancelledAt: before.updatedAt,
      cancelReason: before.cancelReason?.trim() || "ERP credit note",
    },
    select: {
      name: true,
      cancelledAt: true,
      cancelledById: true,
      cancelReason: true,
      financialStatus: true,
    },
  });
  console.log(JSON.stringify({ before, updated }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
