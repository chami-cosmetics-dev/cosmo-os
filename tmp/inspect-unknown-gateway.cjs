const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

(async () => {
  const company = await p.company.findFirst({ select: { id: true } });
  const rows = await p.$queryRaw`
    SELECT "paymentGatewayPrimary" AS gw, COUNT(*)::int AS n, SUM("totalPrice")::float AS total
    FROM "Order"
    WHERE "companyId" = ${company.id}
      AND "createdAt" >= ${new Date("2026-01-01T00:00:00.000+05:30")}
      AND "createdAt" <= ${new Date("2026-08-21T23:59:59.999+05:30")}
      AND (
        "paymentGatewayPrimary" ILIKE '%unknown%'
        OR "paymentGatewayPrimary" ILIKE '%none%'
        OR "paymentGatewayPrimary" IS NULL
        OR TRIM("paymentGatewayPrimary") = ''
      )
    GROUP BY 1
    ORDER BY total DESC NULLS LAST
    LIMIT 30
  `;
  console.log("gateway buckets", rows);

  const nameUnknown = await p.$queryRaw`
    SELECT COUNT(*)::int AS n, SUM(o."totalPrice")::float AS total
    FROM "Order" o
    LEFT JOIN "User" u ON u.id = o."assignedMerchantId"
    WHERE o."companyId" = ${company.id}
      AND o."createdAt" >= ${new Date("2026-01-01T00:00:00.000+05:30")}
      AND o."createdAt" <= ${new Date("2026-08-21T23:59:59.999+05:30")}
      AND o."assignedMerchantId" IS NOT NULL
      AND (u.id IS NULL OR (
        (u."knownName" IS NULL OR TRIM(u."knownName") = '')
        AND (u.name IS NULL OR TRIM(u.name) = '')
        AND (u.email IS NULL OR TRIM(u.email) = '')
      ))
  `;
  console.log("assigned merchant blank/missing", nameUnknown);

  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
