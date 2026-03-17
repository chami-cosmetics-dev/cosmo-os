#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");

const BATCH_SIZE = 1000;

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
      "  node scripts/backfill-contacts-from-orders.cjs --company-id <cuid> [--dry-run]",
      "",
      "Examples:",
      "  node scripts/backfill-contacts-from-orders.cjs --company-id c123...",
      "  node scripts/backfill-contacts-from-orders.cjs --company-id c123... --dry-run",
    ].join("\n")
  );
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return email.length > 0 ? email : null;
}

function normalizePhone(value) {
  const phone = String(value || "").trim();
  return phone.length > 0 ? phone : null;
}

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function pickString(obj, keys) {
  if (!obj) return "";
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function extractNameFromAddress(addressJson) {
  const address = asRecord(addressJson);
  if (!address) return "";
  const name = pickString(address, ["name"]);
  if (name) return name;
  const firstName = pickString(address, ["first_name", "firstName"]);
  const lastName = pickString(address, ["last_name", "lastName"]);
  return [firstName, lastName].filter(Boolean).join(" ").trim();
}

function pickPreferredName(order) {
  const fromShipping = extractNameFromAddress(order.shippingAddress);
  if (fromShipping) return fromShipping;
  const fromBilling = extractNameFromAddress(order.billingAddress);
  if (fromBilling) return fromBilling;
  return String(order.name || "").trim() || "Unknown";
}

function mergeLatestDate(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function keyFor(email, phone) {
  if (email) return `email:${email}`;
  if (phone) return `phone:${phone}`;
  return "";
}

async function collectContactsFromOrders(prisma, companyId) {
  const deduped = new Map();
  let cursorId = null;
  let scannedOrders = 0;

  while (true) {
    const orders = await prisma.order.findMany({
      where: {
        companyId,
        OR: [{ customerEmail: { not: null } }, { customerPhone: { not: null } }],
      },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      select: {
        id: true,
        customerEmail: true,
        customerPhone: true,
        createdAt: true,
        name: true,
        shippingAddress: true,
        billingAddress: true,
      },
    });

    if (orders.length === 0) break;
    scannedOrders += orders.length;

    for (const order of orders) {
      const email = normalizeEmail(order.customerEmail);
      const phone = normalizePhone(order.customerPhone);
      const key = keyFor(email, phone);
      if (!key) continue;

      const name = pickPreferredName(order);
      const lastPurchaseAt = toDate(order.createdAt) || new Date();

      if (!deduped.has(key)) {
        deduped.set(key, {
          name,
          email,
          phoneNumber: phone,
          lastPurchaseAt,
          recentMerchant: null,
        });
        continue;
      }

      const existing = deduped.get(key);
      deduped.set(key, {
        ...existing,
        name: existing.name && existing.name !== "Unknown" ? existing.name : name,
        lastPurchaseAt: mergeLatestDate(existing.lastPurchaseAt, lastPurchaseAt),
      });
    }

    cursorId = orders[orders.length - 1].id;
  }

  return { scannedOrders, contacts: Array.from(deduped.values()) };
}

async function main() {
  loadEnvFiles();
  const args = parseArgs(process.argv.slice(2));
  const companyId = String(args["company-id"] || "").trim();
  const dryRun = Boolean(args["dry-run"]);

  if (!companyId) {
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

    console.log(`Backfill target: ${company.name} (${company.id})`);
    if (dryRun) console.log("Dry run mode: no DB writes will be made");

    const { scannedOrders, contacts } = await collectContactsFromOrders(prisma, companyId);
    console.log(`Scanned orders: ${scannedOrders}`);
    console.log(`Deduped contacts to process: ${contacts.length}`);

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const contact of contacts) {
      if (!contact.email && !contact.phoneNumber) {
        skipped += 1;
        continue;
      }

      const found = await prisma.contactMaster.findFirst({
        where: {
          companyId,
          OR: [
            ...(contact.email ? [{ email: { equals: contact.email, mode: "insensitive" } }] : []),
            ...(contact.phoneNumber ? [{ phoneNumber: contact.phoneNumber }] : []),
          ],
        },
        select: {
          id: true,
          name: true,
          email: true,
          phoneNumber: true,
          recentMerchant: true,
          lastPurchaseAt: true,
        },
      });

      const mergedLastPurchaseAt = mergeLatestDate(found ? toDate(found.lastPurchaseAt) : null, contact.lastPurchaseAt);

      if (dryRun) {
        if (found) updated += 1;
        else created += 1;
        continue;
      }

      if (found) {
        await prisma.contactMaster.update({
          where: { id: found.id },
          data: {
            name: found.name && found.name !== "Unknown" ? found.name : contact.name,
            email: found.email || contact.email,
            phoneNumber: found.phoneNumber || contact.phoneNumber,
            recentMerchant: found.recentMerchant || contact.recentMerchant,
            lastPurchaseAt: mergedLastPurchaseAt,
          },
        });
        updated += 1;
      } else {
        await prisma.contactMaster.create({
          data: {
            companyId,
            ...contact,
          },
        });
        created += 1;
      }
    }

    console.log(`Done. created=${created}, updated=${updated}, skipped=${skipped}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
