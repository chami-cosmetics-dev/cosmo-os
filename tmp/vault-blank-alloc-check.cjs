const { PrismaClient } = require("@prisma/client");
const url = process.env.DATABASE_URL || "";
const p = new PrismaClient({
  datasources: { db: { url: url.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || url } },
});
const COMPANY = "cmp5k145c006irlhemjfidlb5";
(async () => {
  const total = await p.contactMaster.count({ where: { companyId: COMPANY } });
  const blankAlloc = await p.contactMaster.count({
    where: {
      companyId: COMPANY,
      OR: [{ assignedMerchant: null }, { assignedMerchant: "" }],
    },
  });
  const withPhoneBlank = await p.contactMaster.count({
    where: {
      companyId: COMPANY,
      OR: [{ assignedMerchant: null }, { assignedMerchant: "" }],
      phoneNumber: { not: null },
      NOT: { phoneNumber: "" },
    },
  });
  const noPhoneBlank = blankAlloc - withPhoneBlank;

  const erpSources = ["erp1", "erp2"];
  const erpBlank = await p.contactMaster.count({
    where: {
      companyId: COMPANY,
      source: { in: erpSources },
      OR: [{ assignedMerchant: null }, { assignedMerchant: "" }],
    },
  });
  const erpTotal = await p.contactMaster.count({
    where: { companyId: COMPANY, source: { in: erpSources } },
  });
  const erpWithPhoneBlank = await p.contactMaster.count({
    where: {
      companyId: COMPANY,
      source: { in: erpSources },
      OR: [{ assignedMerchant: null }, { assignedMerchant: "" }],
      phoneNumber: { not: null },
      NOT: { phoneNumber: "" },
    },
  });

  const vaultListBlank = await p.contactMaster.count({
    where: {
      companyId: COMPANY,
      source: { startsWith: "vault-contact-list:" },
      OR: [{ assignedMerchant: null }, { assignedMerchant: "" }],
    },
  });
  const vaultListTotal = await p.contactMaster.count({
    where: { companyId: COMPANY, source: { startsWith: "vault-contact-list:" } },
  });

  const otherBlank = blankAlloc - erpBlank - vaultListBlank;

  const sourceBreakdown = await p.$queryRaw`
    SELECT
      COALESCE(NULLIF(TRIM(c."source"), ''), '(null)') AS source,
      COUNT(*)::int AS total,
      SUM(CASE WHEN c."assignedMerchant" IS NULL OR TRIM(c."assignedMerchant") = '' THEN 1 ELSE 0 END)::int AS blank_alloc
    FROM "ContactMaster" c
    WHERE c."companyId" = ${COMPANY}
    GROUP BY 1
    ORDER BY blank_alloc DESC, total DESC
    LIMIT 20
  `;

  console.log(JSON.stringify({
    total,
    blankAlloc,
    withPhoneBlankAlloc: withPhoneBlank,
    noPhoneBlankAlloc: noPhoneBlank,
    erp: { total: erpTotal, blankAlloc: erpBlank, withPhoneBlank: erpWithPhoneBlank },
    vaultContactList: { total: vaultListTotal, blankAlloc: vaultListBlank },
    otherBlankApprox: otherBlank,
    sourceBreakdown,
  }, null, 2));
  await p.$disconnect();
})().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
