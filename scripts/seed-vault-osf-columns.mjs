/**
 * Seed Vault OSF columns: SV / ORI / AE with ERP company + main warehouses.
 *
 * Usage:
 *   node --env-file=.env scripts/seed-vault-osf-columns.mjs <companyId>
 */

import { PrismaClient } from "@prisma/client";

const UNITS = [
  {
    key: "sv",
    label: "SV",
    erpCompany: "SupplementVault.lk",
    warehouse: "Main Warehouse - SV-1",
    sortOrder: 10,
    instanceHint: /erp[_\s-]*1\b/i,
  },
  {
    key: "ori",
    label: "ORI",
    erpCompany: "Origins (PVT) LTD",
    warehouse: "Main Warehouse - Origins",
    sortOrder: 20,
    instanceHint: /erp[_\s-]*2\b/i,
  },
  {
    key: "ae",
    label: "AE",
    erpCompany: "AE (PVT) LTD",
    warehouse: "Main Warehouse - AE",
    sortOrder: 30,
    instanceHint: /erp[_\s-]*2\b/i,
  },
];

const companyId = process.argv[2];
if (!companyId) {
  console.error("Usage: node scripts/seed-vault-osf-columns.mjs <companyId>");
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    console.error("Company not found:", companyId);
    process.exit(1);
  }

  const instances = await prisma.erpnextInstance.findMany({
    where: { companyId },
    orderBy: { createdAt: "asc" },
    select: { id: true, label: true },
  });
  if (instances.length === 0) {
    console.error("No ErpnextInstance rows for this company");
    process.exit(1);
  }

  const erp1 = instances.find((i) => /erp[_\s-]*1\b/i.test(i.label)) ?? instances[0];
  const erp2 = instances.find((i) => /erp[_\s-]*2\b/i.test(i.label)) ?? instances[1] ?? instances[0];

  for (const def of UNITS) {
    const instanceId = def.key === "sv" ? erp1.id : erp2.id;
    const inst = def.key === "sv" ? erp1 : erp2;
    await prisma.osfColumnConfig.upsert({
      where: { companyId_key: { companyId, key: def.key } },
      create: {
        companyId,
        key: def.key,
        label: def.label,
        erpCompany: def.erpCompany,
        erpnextInstanceId: instanceId,
        directWarehouses: [def.warehouse],
        includeInStock: true,
        includeInRop: true,
        sortOrder: def.sortOrder,
        active: true,
      },
      update: {
        label: def.label,
        erpCompany: def.erpCompany,
        erpnextInstanceId: instanceId,
        directWarehouses: [def.warehouse],
        includeInStock: true,
        includeInRop: true,
        sortOrder: def.sortOrder,
        active: true,
      },
    });
    console.log(`${def.label} → ${def.erpCompany} @ ${def.warehouse} (${inst.label})`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
