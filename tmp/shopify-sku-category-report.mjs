/**
 * One-off: Shopify SKU + category from Cosmo ProductItem (Shopify webhook catalog).
 *
 *   node scripts/with-env.mjs cosmo-prod node tmp/shopify-sku-category-report.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const rawUrl = process.env.DATABASE_URL ?? "";
const prisma = new PrismaClient({
  datasources: {
    db: { url: rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || rawUrl },
  },
});

function csvCell(value) {
  const s = value == null ? "" : String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function stampColombo() {
  return new Date().toLocaleString("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).replace(/,/g, "").replace(/\//g, "-").slice(0, 10);
}

function scoreRow(row) {
  let n = 0;
  if (row.sku) n += 4;
  if (row.categoryName) n += 3;
  if (row.categoryFullName) n += 2;
  if (row.productType) n += 1;
  if (row.vendorName) n += 1;
  if (row.barcode) n += 1;
  return n;
}

async function main() {
  const companies = await prisma.company.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  if (companies.length === 0) throw new Error("No companies found");

  const preferred =
    companies.find((c) => /cosmetic/i.test(c.name)) ??
    companies.find((c) => /cosmo/i.test(c.name)) ??
    companies[0];

  const companyId = preferred.id;
  console.log(`Company: ${preferred.name} (${companyId})`);

  const rows = await prisma.productItem.findMany({
    where: { companyId },
    select: {
      sku: true,
      productTitle: true,
      variantTitle: true,
      productType: true,
      handle: true,
      barcode: true,
      shopifyProductId: true,
      shopifyVariantId: true,
      status: true,
      vendor: { select: { name: true } },
      category: { select: { name: true, fullName: true } },
      companyLocation: { select: { name: true, shopifyShopName: true } },
    },
  });

  const byKey = new Map();
  for (const row of rows) {
    const sku = row.sku?.trim() || "";
    const key = sku
      ? `sku:${sku.toLowerCase()}`
      : `variant:${row.shopifyVariantId}`;
    const mapped = {
      sku,
      productTitle: row.productTitle,
      variantTitle: row.variantTitle?.trim() || "",
      vendorName: row.vendor?.name?.trim() || "",
      categoryName: row.category?.name?.trim() || "",
      categoryFullName: row.category?.fullName?.trim() || "",
      productType: row.productType?.trim() || "",
      handle: row.handle?.trim() || "",
      barcode: row.barcode?.trim() || "",
      shopifyProductId: row.shopifyProductId,
      shopifyVariantId: row.shopifyVariantId,
      status: row.status?.trim() || "",
      shopName:
        row.companyLocation?.shopifyShopName?.trim() ||
        row.companyLocation?.name ||
        "",
    };
    const existing = byKey.get(key);
    if (!existing || scoreRow(mapped) > scoreRow(existing)) {
      byKey.set(key, mapped);
    }
  }

  const items = [...byKey.values()].sort((a, b) => {
    const skuCmp = a.sku.localeCompare(b.sku, undefined, { sensitivity: "base" });
    if (skuCmp !== 0) return skuCmp;
    return a.productTitle.localeCompare(b.productTitle, undefined, {
      sensitivity: "base",
    });
  });

  const headers = [
    "SKU",
    "Category",
    "Category Full Name",
    "Product Type",
    "Product",
    "Variant",
    "Vendor",
    "Barcode",
    "Handle",
    "Status",
    "Shopify Product ID",
    "Shopify Variant ID",
  ];

  const lines = [
    headers.join(","),
    ...items.map((item) =>
      [
        item.sku,
        item.categoryName,
        item.categoryFullName,
        item.productType,
        item.productTitle,
        item.variantTitle,
        item.vendorName,
        item.barcode,
        item.handle,
        item.status,
        item.shopifyProductId,
        item.shopifyVariantId,
      ]
        .map(csvCell)
        .join(",")
    ),
  ];

  const outPath = resolve(
    process.cwd(),
    "exports",
    `shopify-sku-category-${stampColombo()}.csv`
  );
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `\uFEFF${lines.join("\r\n")}`, "utf8");

  const withSku = items.filter((i) => i.sku).length;
  const withCategory = items.filter((i) => i.categoryName).length;
  const withType = items.filter((i) => i.productType).length;
  console.log(`Raw ProductItem rows: ${rows.length}`);
  console.log(`Unique items (SKU / variant): ${items.length}`);
  console.log(`With SKU: ${withSku}`);
  console.log(`With category: ${withCategory}`);
  console.log(`With product type: ${withType}`);
  console.log(`Wrote ${outPath}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
