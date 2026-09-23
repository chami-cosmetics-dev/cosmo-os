/**
 * One-time Dilhan purchase-history import into Cosmo (Vault OS company).
 *
 * Usage:
 *   node --env-file=.env --import tsx scripts/import-vault-purchase-history.ts [xlsxPath] [--company-id=...]
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

import {
  isVaultOsfPurchaseHistoryMonth,
  parseDilhanPurchaseHistorySheet,
} from "../lib/vault-osf/purchase-history-parse";

const prisma = new PrismaClient();

function argValue(prefix: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

async function resolveCompanyId(explicit: string | null): Promise<string> {
  if (explicit) return explicit;

  const vaultCols = await prisma.osfColumnConfig.findMany({
    where: { key: { in: ["sv", "ori", "ae"] }, active: true },
    select: { companyId: true, key: true },
  });
  const byCompany = new Map<string, Set<string>>();
  for (const row of vaultCols) {
    const set = byCompany.get(row.companyId) ?? new Set();
    set.add(row.key);
    byCompany.set(row.companyId, set);
  }
  const full = [...byCompany.entries()].filter(([, keys]) => keys.size >= 3);
  if (full.length === 1) return full[0]![0];
  if (full.length > 1) {
    const companies = await prisma.company.findMany({
      where: { id: { in: full.map(([id]) => id) } },
      select: { id: true, name: true },
    });
    throw new Error(
      `Multiple Vault OSF companies — pass --company-id=. Candidates: ${companies
        .map((c) => `${c.name}=${c.id}`)
        .join(", ")}`,
    );
  }

  const named = await prisma.company.findFirst({
    where: {
      OR: [
        { name: { contains: "Vault", mode: "insensitive" } },
        { name: { contains: "Supplement", mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true },
  });
  if (named) return named.id;

  throw new Error("No Vault company found — pass --company-id=");
}

async function ensureTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "OsfPurchaseHistoryLine" (
      "id" TEXT NOT NULL,
      "companyId" TEXT NOT NULL,
      "sku" TEXT NOT NULL,
      "supplier" TEXT NOT NULL,
      "postingDate" TEXT NOT NULL,
      "qty" DOUBLE PRECISION NOT NULL,
      "rate" DOUBLE PRECISION NOT NULL,
      "netValue" DOUBLE PRECISION NOT NULL,
      "excelCompany" TEXT,
      "sourceRef" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "OsfPurchaseHistoryLine_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "OsfPurchaseHistoryLine_companyId_sku_idx" ON "OsfPurchaseHistoryLine"("companyId", "sku");`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "OsfPurchaseHistoryLine_companyId_postingDate_idx" ON "OsfPurchaseHistoryLine"("companyId", "postingDate");`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "OsfPurchaseHistoryLine_companyId_sku_postingDate_idx" ON "OsfPurchaseHistoryLine"("companyId", "sku", "postingDate");`,
  );
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "OsfPurchaseHistoryLine"
      ADD CONSTRAINT "OsfPurchaseHistoryLine_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    `);
  } catch {
    /* already exists */
  }
}

function cuidLike(): string {
  return `oph_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

async function main() {
  const pathArg =
    process.argv.find((a) => a.endsWith(".xlsx") || a.endsWith(".xls")) ??
    String.raw`c:\Users\Bad-Boy\Downloads\Purchasing history-Dilhan.xlsx`;
  const filePath = resolve(pathArg);
  const companyId = await resolveCompanyId(argValue("--company-id="));
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true },
  });
  if (!company) throw new Error(`Company not found: ${companyId}`);

  console.log("Ensuring OsfPurchaseHistoryLine table…");
  await ensureTable();

  console.log(`Importing → company ${company.name} (${company.id})`);
  console.log(`File: ${filePath}`);
  const buffer = readFileSync(filePath);
  const parsed = parseDilhanPurchaseHistorySheet(buffer, filePath);
  const monthsPresent = [
    ...new Set(parsed.lines.map((l) => l.postingDate.slice(0, 7))),
  ].sort();
  const osfMonths = monthsPresent.filter(isVaultOsfPurchaseHistoryMonth);

  await prisma.$transaction(async (tx) => {
    await tx.osfPurchaseHistoryLine.deleteMany({ where: { companyId: company.id } });
    const CHUNK = 500;
    const now = new Date();
    for (let i = 0; i < parsed.lines.length; i += CHUNK) {
      const chunk = parsed.lines.slice(i, i + CHUNK);
      await tx.osfPurchaseHistoryLine.createMany({
        data: chunk.map((l) => ({
          id: cuidLike(),
          companyId: company.id,
          sku: l.sku,
          supplier: l.supplier,
          postingDate: l.postingDate,
          qty: l.qty,
          rate: l.rate,
          netValue: l.netValue,
          excelCompany: l.excelCompany,
          sourceRef: l.sourceRef,
          createdAt: now,
          updatedAt: now,
        })),
      });
    }
  });

  console.log(
    JSON.stringify(
      {
        inserted: parsed.lines.length,
        skippedBlank: parsed.skippedBlank,
        errorCount: parsed.errors.length,
        errorsSample: parsed.errors.slice(0, 15),
        monthsPresent,
        osfMonths,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
