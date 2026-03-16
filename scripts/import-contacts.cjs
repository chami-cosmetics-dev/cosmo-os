#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");

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
      "  node scripts/import-contacts.cjs --company-id <cuid> [--shopify <csvPath>] [--woocommerce <csvPath>] [--dry-run]",
      "",
      "Examples:",
      "  node scripts/import-contacts.cjs --company-id c123... --shopify ./data/shopify-customers.csv",
      "  node scripts/import-contacts.cjs --company-id c123... --woocommerce ./data/woo-customers.csv",
      "  node scripts/import-contacts.cjs --company-id c123... --shopify ./shopify.csv --woocommerce ./woo.csv",
    ].join("\n")
  );
}

function normalizeHeader(header) {
  return String(header)
    .trim()
    .toLowerCase()
    .replace(/^\ufeff/, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const next = content[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(value.trim());
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(value.trim());
      value = "";
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      continue;
    }

    value += char;
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value.trim());
    if (row.some((cell) => cell.length > 0)) rows.push(row);
  }

  if (rows.length === 0) return [];
  const headers = rows[0].map(normalizeHeader);
  return rows.slice(1).map((cells) => {
    const mapped = {};
    headers.forEach((header, idx) => {
      mapped[header] = (cells[idx] || "").trim();
    });
    return mapped;
  });
}

function pick(row, keys) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function normalizeNullable(value) {
  const trimmed = String(value || "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseDateOrNull(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function mapShopifyRow(row) {
  const firstName = pick(row, ["first_name", "default_address_first_name"]);
  const lastName = pick(row, ["last_name", "default_address_last_name"]);
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const email = normalizeNullable(pick(row, ["email", "customer_email"]));
  const phone = normalizeNullable(pick(row, ["phone", "default_address_phone"]));
  const lastPurchaseAt = parseDateOrNull(
    pick(row, ["last_order_date", "last_order", "last_purchase_at", "updated_at"])
  );
  const name = fullName || normalizeNullable(pick(row, ["name"])) || email || phone || "Unknown";

  return {
    name,
    email: email ? email.toLowerCase() : null,
    phoneNumber: phone,
    lastPurchaseAt,
    recentMerchant: null,
  };
}

function mapWooRow(row) {
  const firstName = pick(row, ["first_name", "billing_first_name"]);
  const lastName = pick(row, ["last_name", "billing_last_name"]);
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const email = normalizeNullable(pick(row, ["email", "billing_email", "user_email"]));
  const phone = normalizeNullable(pick(row, ["billing_phone", "phone", "mobile"]));
  const lastPurchaseAt = parseDateOrNull(
    pick(row, ["date_last_order", "last_order_date", "last_purchase_at", "last_order"])
  );
  const name = fullName || normalizeNullable(pick(row, ["name"])) || email || phone || "Unknown";

  return {
    name,
    email: email ? email.toLowerCase() : null,
    phoneNumber: phone,
    lastPurchaseAt,
    recentMerchant: null,
  };
}

async function importRows(prisma, companyId, rows, mapper, opts) {
  const result = { total: rows.length, created: 0, updated: 0, skipped: 0 };

  for (const row of rows) {
    const contact = mapper(row);
    if (!contact.email && !contact.phoneNumber) {
      result.skipped += 1;
      continue;
    }

    const existing = await prisma.contactMaster.findFirst({
      where: {
        companyId,
        OR: [
          ...(contact.email ? [{ email: { equals: contact.email, mode: "insensitive" } }] : []),
          ...(contact.phoneNumber ? [{ phoneNumber: contact.phoneNumber }] : []),
        ],
      },
      select: { id: true },
    });

    if (opts.dryRun) {
      if (existing) result.updated += 1;
      else result.created += 1;
      continue;
    }

    if (existing) {
      await prisma.contactMaster.update({
        where: { id: existing.id },
        data: contact,
      });
      result.updated += 1;
    } else {
      await prisma.contactMaster.create({
        data: { companyId, ...contact },
      });
      result.created += 1;
    }
  }

  return result;
}

async function main() {
  loadEnvFiles();
  const args = parseArgs(process.argv.slice(2));
  const companyId = String(args["company-id"] || "").trim();
  const shopifyPath = args.shopify ? path.resolve(String(args.shopify)) : null;
  const wooPath = args.woocommerce ? path.resolve(String(args.woocommerce)) : null;
  const dryRun = Boolean(args["dry-run"]);

  if (!companyId || (!shopifyPath && !wooPath)) {
    usage();
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    });
    if (!company) {
      console.error(`Company not found for ID: ${companyId}`);
      process.exit(1);
    }

    console.log(`Import target: ${company.name} (${company.id})`);
    if (dryRun) console.log("Dry run mode: no DB writes will be made");

    let totalCreated = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;

    if (shopifyPath) {
      const content = fs.readFileSync(shopifyPath, "utf8");
      const rows = parseCsv(content);
      const summary = await importRows(prisma, companyId, rows, mapShopifyRow, { dryRun });
      totalCreated += summary.created;
      totalUpdated += summary.updated;
      totalSkipped += summary.skipped;
      console.log(
        `[Shopify] total=${summary.total}, created=${summary.created}, updated=${summary.updated}, skipped=${summary.skipped}`
      );
    }

    if (wooPath) {
      const content = fs.readFileSync(wooPath, "utf8");
      const rows = parseCsv(content);
      const summary = await importRows(prisma, companyId, rows, mapWooRow, { dryRun });
      totalCreated += summary.created;
      totalUpdated += summary.updated;
      totalSkipped += summary.skipped;
      console.log(
        `[WooCommerce] total=${summary.total}, created=${summary.created}, updated=${summary.updated}, skipped=${summary.skipped}`
      );
    }

    console.log(
      `Done. created=${totalCreated}, updated=${totalUpdated}, skipped=${totalSkipped}`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Import failed:", error);
  process.exit(1);
});
