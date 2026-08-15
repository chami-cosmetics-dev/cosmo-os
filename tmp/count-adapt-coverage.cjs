const { PrismaClient } = require("@prisma/client");
const raw = process.env.DATABASE_URL || "";
const prisma = new PrismaClient({
  datasources: { db: { url: raw.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || raw } },
});
const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";

async function main() {
  const total = await prisma.adaptPurchaseHistory.count({ where: { companyId: COMPANY_ID } });
  const withLines = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS n
    FROM "AdaptPurchaseHistory"
    WHERE "companyId" = ${COMPANY_ID}
      AND "lineItems" IS NOT NULL
      AND jsonb_typeof("lineItems"::jsonb) = 'array'
      AND jsonb_array_length("lineItems"::jsonb) > 0
  `;
  const emptyLines = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS n
    FROM "AdaptPurchaseHistory"
    WHERE "companyId" = ${COMPANY_ID}
      AND (
        "lineItems" IS NULL
        OR "lineItems"::text = 'null'
        OR "lineItems"::text = '[]'
      )
  `;
  console.log(
    JSON.stringify(
      {
        total,
        withLineItems: withLines[0]?.n ?? withLines,
        emptyOrNullLineItems: emptyLines[0]?.n ?? emptyLines,
      },
      null,
      2
    )
  );
}

main()
  .finally(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
