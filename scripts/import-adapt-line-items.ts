/**
 * Fill AdaptPurchaseHistory.lineItems from yearly Adapt line-item CSVs.
 *
 * Joins on sales_invoice_master_id → adaptInvoiceKey `mid:{id}`.
 *
 * Usage:
 *   node scripts/with-env.mjs cosmo-prod npx --yes tsx scripts/import-adapt-line-items.ts \
 *     --company-id cmn2xcas1002crl5xtgoq28f5 \
 *     --dir "c:\Users\Bad-Boy\Downloads\ADAPT DB\ADAPT DB" \
 *     --report ./data/adapt-line-items-prod-report.json
 */

import { createReadStream, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";

import { Prisma, PrismaClient } from "@prisma/client";

import {
  mapAdaptLineItemHeaders,
  normalizeAdaptLineItem,
  rowFromAdaptLineItemValues,
  type AdaptLineItemJson,
} from "../lib/adapt-import/line-items";

function parseArgs(argv: string[]) {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      values.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  values.push(current);
  return values;
}

function usage() {
  console.log(`Usage:
  node scripts/with-env.mjs cosmo-prod npx --yes tsx scripts/import-adapt-line-items.ts --company-id <cuid> --dir <ADAPT DB folder> [--dry-run] [--concurrency 40] [--report out.json]

Expects year subfolders (2019…2026) each containing Untitled.csv (or pass --files with semicolon-separated paths).
`);
}

function discoverYearCsvFiles(dir: string): string[] {
  const years = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{4}$/.test(d.name))
    .map((d) => d.name)
    .sort();
  const files: string[] = [];
  for (const year of years) {
    const candidate = join(dir, year, "Untitled.csv");
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      files.push(candidate);
    }
  }
  return files;
}

async function loadGroupedLineItems(filePath: string): Promise<{
  byMasterId: Map<string, AdaptLineItemJson[]>;
  rowsRead: number;
  rowsSkipped: number;
}> {
  const byMasterId = new Map<string, AdaptLineItemJson[]>();
  const perInvoiceIndex = new Map<string, number>();
  let rowsRead = 0;
  let rowsSkipped = 0;
  let headerMap: ReturnType<typeof mapAdaptLineItemHeaders> | null = null;

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    if (!headerMap) {
      headerMap = mapAdaptLineItemHeaders(parseCsvLine(line));
      if (headerMap.salesInvoiceMasterId < 0 || headerMap.quantity < 0) {
        throw new Error(`Missing required columns in ${filePath}`);
      }
      continue;
    }
    rowsRead += 1;
    const row = rowFromAdaptLineItemValues(parseCsvLine(line), headerMap);
    const masterId = row.salesInvoiceMasterId?.trim();
    if (!masterId) {
      rowsSkipped += 1;
      continue;
    }
    const idx = perInvoiceIndex.get(masterId) ?? 0;
    const item = normalizeAdaptLineItem(row, idx);
    perInvoiceIndex.set(masterId, idx + 1);
    if (!item) {
      rowsSkipped += 1;
      continue;
    }
    const list = byMasterId.get(masterId);
    if (list) list.push(item);
    else byMasterId.set(masterId, [item]);
  }

  return { byMasterId, rowsRead, rowsSkipped };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const companyId = typeof args["company-id"] === "string" ? args["company-id"] : null;
  const dir = typeof args.dir === "string" ? args.dir : null;
  const filesArg = typeof args.files === "string" ? args.files : null;
  const dryRun = Boolean(args["dry-run"]);
  const reportPath = typeof args.report === "string" ? args.report : null;
  const concurrency =
    typeof args.concurrency === "string" && args.concurrency
      ? Math.max(1, Number(args.concurrency) || 40)
      : 40;

  if (!companyId || (!dir && !filesArg)) {
    usage();
    process.exit(1);
  }

  const files = filesArg
    ? filesArg.split(";").map((s) => s.trim()).filter(Boolean)
    : discoverYearCsvFiles(dir!);

  if (!files.length) {
    console.error("[adapt-line-items] no CSV files found");
    process.exit(1);
  }

  const rawUrl = process.env.DATABASE_URL ?? "";
  const prisma = new PrismaClient({
    datasources: {
      db: { url: rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || rawUrl },
    },
  });

  const report = {
    companyId,
    dryRun,
    files: [] as Array<{
      file: string;
      rowsRead: number;
      rowsSkipped: number;
      invoicesGrouped: number;
      purchasesUpdated: number;
      purchasesMissing: number;
    }>,
    totals: {
      rowsRead: 0,
      rowsSkipped: 0,
      invoicesGrouped: 0,
      purchasesUpdated: 0,
      purchasesMissing: 0,
    },
  };

  console.log(
    `[adapt-line-items] company=${companyId} files=${files.length} dryRun=${dryRun} concurrency=${concurrency}`
  );

  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (!company) {
      throw new Error(`Company not found: ${companyId}`);
    }

    for (const filePath of files) {
      console.log(`[adapt-line-items] reading ${filePath}`);
      const { byMasterId, rowsRead, rowsSkipped } = await loadGroupedLineItems(filePath);
      const masterIds = [...byMasterId.keys()];
      let purchasesUpdated = 0;
      let purchasesMissing = 0;

      for (let i = 0; i < masterIds.length; i += concurrency) {
        const chunk = masterIds.slice(i, i + concurrency);
        const results = await Promise.all(
          chunk.map(async (masterId) => {
            const items = byMasterId.get(masterId) ?? [];
            const adaptInvoiceKey = `mid:${masterId}`;
            if (dryRun) {
              const existing = await prisma.adaptPurchaseHistory.findUnique({
                where: {
                  companyId_adaptInvoiceKey: { companyId, adaptInvoiceKey },
                },
                select: { id: true },
              });
              return existing ? "updated" : "missing";
            }
            const result = await prisma.adaptPurchaseHistory.updateMany({
              where: { companyId, adaptInvoiceKey },
              data: { lineItems: items as unknown as Prisma.InputJsonValue },
            });
            return result.count > 0 ? "updated" : "missing";
          })
        );
        for (const r of results) {
          if (r === "updated") purchasesUpdated += 1;
          else purchasesMissing += 1;
        }
        if ((i + concurrency) % (concurrency * 20) < concurrency || i + concurrency >= masterIds.length) {
          console.log(
            `[adapt-line-items] ${filePath} progress ${Math.min(i + concurrency, masterIds.length)}/${masterIds.length} updated=${purchasesUpdated} missing=${purchasesMissing}`
          );
        }
      }

      const fileReport = {
        file: filePath,
        rowsRead,
        rowsSkipped,
        invoicesGrouped: masterIds.length,
        purchasesUpdated,
        purchasesMissing,
      };
      report.files.push(fileReport);
      report.totals.rowsRead += rowsRead;
      report.totals.rowsSkipped += rowsSkipped;
      report.totals.invoicesGrouped += masterIds.length;
      report.totals.purchasesUpdated += purchasesUpdated;
      report.totals.purchasesMissing += purchasesMissing;
      console.log(`[adapt-line-items] done file`, JSON.stringify(fileReport));
    }

    console.log(JSON.stringify(report, null, 2));
    if (reportPath) {
      mkdirSync(dirname(reportPath), { recursive: true });
      writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
      console.log(`[adapt-line-items] wrote report ${reportPath}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
