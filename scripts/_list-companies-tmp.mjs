import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
try {
  const rows = await p.company.findMany({ select: { id: true, name: true }, take: 10 });
  console.log(JSON.stringify(rows, null, 2));
} finally {
  await p.$disconnect();
}
