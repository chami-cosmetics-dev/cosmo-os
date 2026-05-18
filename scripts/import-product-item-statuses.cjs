#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const { Prisma, PrismaClient } = require("@prisma/client");
const xlsx = require("xlsx");

const STATUS_MAP = {
  "top priority brand-priority product": "TOP_PRIORITY_BRAND_PRIORITY_PRODUCT",
  "top priority brand - priority product": "TOP_PRIORITY_BRAND_PRIORITY_PRODUCT",
  "top priority brand-non priority product": "TOP_PRIORITY_BRAND_NON_PRIORITY_PRODUCT",
  "top priority brand - non priority product": "TOP_PRIORITY_BRAND_NON_PRIORITY_PRODUCT",
  "priority brand-priority product": "PRIORITY_BRAND_PRIORITY_PRODUCT",
  "priority brand - priority product": "PRIORITY_BRAND_PRIORITY_PRODUCT",
  "priority brand-non priority product": "PRIORITY_BRAND_NON_PRIORITY_PRODUCT",
  "priority brand - non priority product": "PRIORITY_BRAND_NON_PRIORITY_PRODUCT",
  "newly added": "NEWLY_ADDED",
  "vat-top priority brand": "VAT_TOP_PRIORITY_BRAND",
  "vat - top priority brand": "VAT_TOP_PRIORITY_BRAND",
  continue: "CONTINUE",
  discontinue: "DISCONTINUE",
};

function loadEnvFromFile(filepath) {
  if (!fs.existsSync(filepath)) return;
  const content = fs.readFileSync(filepath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    if (!key || process.env[key]) continue;
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function loadEnvFiles() {
  const cwd = process.cwd();
  loadEnvFromFile(path.join(cwd, ".env"));
  loadEnvFromFile(path.join(cwd, ".env.local"));
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function usage() {
  console.log(
    [
      "Usage:",
      "  node scripts/import-product-item-statuses.cjs --file <xlsxPath> [--company-id <cuid>] [--sheet ALL] [--dry-run]",
      "",
      "Expected columns:",
      "  Variant SKU, Item Status, Description",
      "",
      "Example:",
      "  node scripts/import-product-item-statuses.cjs --file \"C:\\Users\\Bad-Boy\\Downloads\\New Status of Item -08.05.2026.xlsx\" --dry-run",
    ].join("\n")
  );
}

function normalizeStatus(value) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[–—]/g, "-")
    .toLowerCase();

  return STATUS_MAP[normalized] ?? "UNCATEGORIZED";
}

function normalizeSku(value) {
  return String(value ?? "").trim();
}

function readStatusRows(file, sheetName) {
  const workbook = xlsx.readFile(file, { cellDates: false });
  const selectedSheetName = sheetName || workbook.SheetNames[0];
  const sheet = workbook.Sheets[selectedSheetName];
  if (!sheet) {
    throw new Error(`Sheet not found: ${selectedSheetName}`);
  }

  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const headerIndex = rows.findIndex((row) =>
    row.some((value) => String(value).trim().toLowerCase() === "variant sku")
  );

  if (headerIndex < 0) {
    throw new Error('Could not find a header row containing "Variant SKU".');
  }

  const headers = rows[headerIndex].map((value) => String(value).trim().toLowerCase());
  const skuIndex = headers.indexOf("variant sku");
  const statusIndex = headers.indexOf("item status");

  if (skuIndex < 0 || statusIndex < 0) {
    throw new Error('Required columns missing. Need "Variant SKU" and "Item Status".');
  }

  const bySku = new Map();
  for (const row of rows.slice(headerIndex + 1)) {
    const sku = normalizeSku(row[skuIndex]);
    const label = String(row[statusIndex] ?? "").trim();
    if (!sku || !label) continue;
    bySku.set(sku.toLowerCase(), {
      sku,
      itemStatusLabel: label,
      itemStatusCategory: normalizeStatus(label),
    });
  }

  return [...bySku.values()];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file || args.help) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  const file = path.resolve(String(args.file));
  if (!fs.existsSync(file)) {
    throw new Error(`File not found: ${file}`);
  }

  loadEnvFiles();
  const rows = readStatusRows(file, args.sheet ? String(args.sheet) : "ALL");
  const dryRun = Boolean(args["dry-run"]);
  const companyId = args["company-id"] ? String(args["company-id"]) : null;
  const prisma = new PrismaClient();

  const summary = {
    readRows: rows.length,
    matchedItems: 0,
    updatedItems: 0,
    unmatchedSkus: 0,
    byCategory: {},
  };

  try {
    const existingItems = await prisma.productItem.findMany({
      where: {
        sku: { not: null },
        ...(companyId ? { companyId } : {}),
      },
      select: { sku: true },
    });
    const existingSkus = new Set(existingItems.map((item) => item.sku.toLowerCase()));
    const matchedRows = rows.filter((row) => existingSkus.has(row.sku.toLowerCase()));
    summary.unmatchedSkus = rows.length - matchedRows.length;

    const updateGroups = new Map();
    for (const row of rows) {
      summary.byCategory[row.itemStatusCategory] =
        (summary.byCategory[row.itemStatusCategory] ?? 0) + 1;
    }

    for (const row of matchedRows) {
      const key = `${row.itemStatusCategory}\u0000${row.itemStatusLabel}`;
      const group = updateGroups.get(key) ?? {
        itemStatusCategory: row.itemStatusCategory,
        itemStatusLabel: row.itemStatusLabel,
        skus: [],
      };
      group.skus.push(row.sku);
      updateGroups.set(key, group);
    }

    const chunkSize = 250;
    const companyFilter = companyId
      ? Prisma.sql`AND "companyId" = ${companyId}`
      : Prisma.empty;
    for (const group of updateGroups.values()) {
      for (let i = 0; i < group.skus.length; i += chunkSize) {
        const skus = group.skus.slice(i, i + chunkSize).map((sku) => sku.toLowerCase());
        const countRows = await prisma.$queryRaw`
          SELECT COUNT(*)::int AS count
          FROM "ProductItem"
          WHERE "sku" IS NOT NULL
            AND lower("sku") IN (${Prisma.join(skus)})
            ${companyFilter}
        `;
        const matchedItems = Number(countRows[0]?.count ?? 0);
        summary.matchedItems += matchedItems;

        if (!dryRun && matchedItems > 0) {
          const result = await prisma.$executeRaw`
            UPDATE "ProductItem"
            SET
              "itemStatusCategory" = ${group.itemStatusCategory},
              "itemStatusLabel" = ${group.itemStatusLabel}
            WHERE "sku" IS NOT NULL
              AND lower("sku") IN (${Prisma.join(skus)})
              ${companyFilter}
          `;
          summary.updatedItems += Number(result);
        }
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(JSON.stringify({ dryRun, companyId, file, ...summary }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
