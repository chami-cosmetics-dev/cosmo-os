/**
 * One-time Adapt sales-invoice → Contact Master + AdaptPurchaseHistory import.
 *
 * Standalone Prisma client (no Next.js `server-only` / lib/prisma).
 *
 * Usage (one line — PowerShell needs ` to continue, or put all args on one line):
 *   node scripts/with-env.mjs cosmo-dev npx --yes tsx scripts/import-adapt-sales-invoices.ts --company-id <id> --file <csv> --dry-run --limit 1000
 */

import { writeFileSync, readFileSync, existsSync, statSync } from "node:fs";

import { PrismaClient } from "@prisma/client";

import { runAdaptImport } from "../lib/adapt-import/import-run";

function parseArgs(argv: string[]) {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (!token.startsWith("--")) continue;
    const eq = token.indexOf("=");
    if (eq > 2) {
      const key = token.slice(2, eq);
      out[key] = token.slice(eq + 1);
      continue;
    }
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

function usage() {
  console.log(`Usage:
  node scripts/with-env.mjs cosmo-dev npx --yes tsx scripts/import-adapt-sales-invoices.ts --company-id <cuid> --file <csv> [--map <json>] [--dry-run] [--resume <checkpoint.json>] [--report <out.json>] [--limit <n>]

Primary file: invoice_data_headers.csv (enriched 86-column Adapt export).
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const companyId = typeof args["company-id"] === "string" ? args["company-id"] : null;
  const filePath = typeof args.file === "string" ? args.file : null;
  if (!companyId || !filePath) {
    usage();
    process.exit(1);
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    console.error(`[adapt-import] --file must be an existing CSV file, got: ${filePath}`);
    process.exit(1);
  }

  const dryRun = Boolean(args["dry-run"]);
  const mapPath = typeof args.map === "string" ? args.map : null;
  const reportPath = typeof args.report === "string" ? args.report : null;
  const resumePath = typeof args.resume === "string" ? args.resume : null;
  const limit =
    typeof args.limit === "string" && args.limit ? Number(args.limit) : null;

  const resumeKeys = new Set<string>();
  if (resumePath && existsSync(resumePath)) {
    const parsed = JSON.parse(readFileSync(resumePath, "utf8")) as {
      completedKeys?: string[];
    };
    for (const key of parsed.completedKeys ?? []) resumeKeys.add(key);
  }

  const checkpointKeys = new Set<string>(resumeKeys);

  const rawUrl = process.env.DATABASE_URL ?? "";
  const prisma = new PrismaClient({
    datasources: {
      db: { url: rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || rawUrl },
    },
  });

  console.log(
    `[adapt-import] company=${companyId} file=${filePath} dryRun=${dryRun} map=${mapPath ?? "(none)"}`
  );

  try {
    const report = await runAdaptImport({
      companyId,
      filePath,
      db: prisma,
      dryRun,
      mapPath,
      resumeKeys,
      checkpointKeys,
      limit,
      importBatchId: `batch-${Date.now()}`,
    });

    console.log(JSON.stringify(report, null, 2));

    if (reportPath) {
      writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
      console.log(`[adapt-import] wrote report ${reportPath}`);
    }

    if (!dryRun && resumePath) {
      writeFileSync(
        resumePath,
        JSON.stringify({ completedKeys: [...checkpointKeys] }, null, 2),
        "utf8"
      );
      console.log(`[adapt-import] wrote checkpoint ${resumePath}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[adapt-import] fatal", error);
  process.exit(1);
});
