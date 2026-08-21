const { PrismaClient } = require("@prisma/client");
const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: (process.env.DATABASE_URL || "").replace(
        /(ep-[^.]+)-pooler(\.[^/]+)/,
        "$1$2"
      ),
    },
  },
});

async function main() {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const logs = await prisma.auditLog.findMany({
    where: {
      companyId: COMPANY_ID,
      module: "reports",
      action: "download",
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: {
      createdAt: true,
      summary: true,
      entityId: true,
      metadata: true,
      actorUser: { select: { email: true, name: true, knownName: true } },
    },
  });
  console.log(
    JSON.stringify(
      logs.map((l) => ({
        at: l.createdAt,
        summary: l.summary,
        key: l.entityId,
        file: l.metadata?.fileName,
        filters: l.metadata?.filters,
        user: l.actorUser?.knownName || l.actorUser?.name || l.actorUser?.email,
      })),
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
