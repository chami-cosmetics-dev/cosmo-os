/**
 * Compare ERP Item-Wise Stock Balance xlsx files to Cosmo ErpStockSnapshot.
 *
 * Usage:
 *   node scripts/with-env.mjs cosmo-dev npx tsx scripts/compare-erp-xlsx-snapshot.ts
 */

import { PrismaClient } from "@prisma/client";
import XLSX from "xlsx";

const ERP1 =
  process.argv[2] ??
  "C:/Users/Bad-Boy/Downloads/Stock Balance Summary - Item Wise ERP 1.xlsx";
const ERP2 =
  process.argv[3] ??
  "C:/Users/Bad-Boy/Downloads/Stock Balance Summary - Item Wise ERP 2.xlsx";

function isRollupWarehouse(name: string) {
  const n = name.trim().toLowerCase();
  return n.startsWith("all warehouses");
}

function loadExcel(path: string) {
  const wb = XLSX.readFile(path);
  const sh = wb.Sheets[wb.SheetNames[0]!];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sh, { defval: null });
  const out: Array<{ sku: string; warehouse: string; qty: number; company: string }> = [];
  for (const row of rows) {
    const sku = String(row.Item ?? "").trim();
    const warehouse = String(row.Warehouse ?? "").trim();
    const company = String(row.Company ?? "").trim();
    const qty = Number(row["Balance Qty"]);
    if (!sku || !warehouse || !Number.isFinite(qty)) continue;
    if (isRollupWarehouse(warehouse)) continue;
    out.push({ sku, warehouse, qty, company });
  }
  return out;
}

function key(sku: string, warehouse: string) {
  return `${warehouse}::${sku}`;
}

async function main() {
  const rawUrl = process.env.DATABASE_URL ?? "";
  if (!rawUrl) throw new Error("DATABASE_URL missing");
  const prisma = new PrismaClient({ datasources: { db: { url: rawUrl } } });

  try {
    const erp1 = loadExcel(ERP1);
    const erp2 = loadExcel(ERP2);
    const excelAll = [...erp1, ...erp2];
    const excelPositive = excelAll.filter((r) => r.qty > 0);

    const companies = await prisma.company.findMany({ select: { id: true, name: true } });
    console.log("companies", companies.map((c) => `${c.name} ${c.id}`).join(" | "));

    for (const company of companies) {
      const columns = await prisma.osfColumnConfig.findMany({
        where: { companyId: company.id, active: true, includeInStock: true },
        select: {
          directWarehouses: true,
          erpnextInstanceId: true,
          companyLocation: {
            select: {
              erpnextWarehouse: true,
              erpWarehouses: { select: { warehouse: true } },
            },
          },
        },
      });
      const mapped = new Set<string>();
      for (const col of columns) {
        const direct = (col.directWarehouses ?? []).map((w) => w.trim()).filter(Boolean);
        if (direct.length) {
          for (const w of direct) mapped.add(w);
          continue;
        }
        const loc = col.companyLocation;
        if (loc?.erpnextWarehouse?.trim()) mapped.add(loc.erpnextWarehouse.trim());
        for (const wh of loc?.erpWarehouses ?? []) {
          const name = wh.warehouse?.trim();
          if (name) mapped.add(name);
        }
      }

      const meta = await prisma.erpStockSnapshot.findFirst({
        where: { companyId: company.id },
        orderBy: [{ snapshotDate: "desc" }, { capturedAt: "desc" }],
        select: { snapshotDate: true, capturedAt: true },
      });

      const snapRows = meta
        ? await prisma.erpStockSnapshot.findMany({
            where: { companyId: company.id, snapshotDate: meta.snapshotDate },
            select: { sku: true, warehouse: true, qty: true },
          })
        : [];

      const snapMap = new Map<string, number>();
      for (const row of snapRows) {
        const k = key(row.sku, row.warehouse);
        snapMap.set(k, (snapMap.get(k) ?? 0) + row.qty);
      }

      const excelMapped = excelPositive.filter((r) => mapped.has(r.warehouse));
      const excelMap = new Map<string, number>();
      for (const row of excelMapped) {
        const k = key(row.sku, row.warehouse);
        excelMap.set(k, (excelMap.get(k) ?? 0) + row.qty);
      }

      let match = 0;
      let qtyMismatch = 0;
      let missingInCosmo = 0;
      let extraInCosmo = 0;
      const samples: string[] = [];

      for (const [k, qty] of excelMap) {
        if (!snapMap.has(k)) {
          missingInCosmo += 1;
          if (samples.length < 8) samples.push(`excel-only ${k} qty=${qty}`);
          continue;
        }
        const ours = snapMap.get(k)!;
        if (Math.abs(ours - qty) < 0.001) match += 1;
        else {
          qtyMismatch += 1;
          if (samples.length < 8) samples.push(`qty ${k} excel=${qty} cosmo=${ours}`);
        }
      }
      for (const [k, qty] of snapMap) {
        if (!excelMap.has(k)) {
          extraInCosmo += 1;
          if (samples.length < 8) samples.push(`cosmo-only ${k} qty=${qty}`);
        }
      }

      const excelWh = new Set(excelAll.map((r) => r.warehouse));
      const unmappedExcelWh = [...excelWh].filter((w) => !mapped.has(w) && !isRollupWarehouse(w));

      console.log("\n===", company.name, "===");
      console.log("snapshot", meta ? `${meta.snapshotDate} @ ${meta.capturedAt.toISOString()}` : "NONE");
      console.log("excel rows (no All Warehouses)", excelAll.length, "positive", excelPositive.length);
      console.log("OSF mapped warehouses", mapped.size);
      console.log("excel positive on mapped WH", excelMapped.length, "keys", excelMap.size);
      console.log("cosmo snapshot keys", snapMap.size);
      console.log("match", match, "qtyMismatch", qtyMismatch, "excelMissingInCosmo", missingInCosmo, "cosmoExtra", extraInCosmo);
      console.log("excel warehouses not in OSF map (sample)", unmappedExcelWh.slice(0, 15));
      console.log("samples", samples);
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
