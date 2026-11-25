import fs from "fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const API_VERSION = "2024-10";

function loadEnv() {
  const raw = fs.readFileSync(".env", "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = value;
  }
}

function productGid(id) {
  const raw = String(id ?? "").trim();
  if (!raw) return null;
  if (raw.startsWith("gid://")) return raw;
  if (raw.startsWith("erp-")) return null;
  return `gid://shopify/Product/${raw}`;
}

async function shopifyGraphql(handle, token, query, variables) {
  const url = `https://${handle}.myshopify.com/admin/api/${API_VERSION}/graphql.json`;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });
    const text = await res.text();
    if (res.status === 429 && attempt < 3) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    if (!res.ok) throw new Error(`Shopify GraphQL ${res.status}: ${text.slice(0, 300)}`);
    const json = JSON.parse(text);
    if (json.errors?.length) {
      throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors).slice(0, 400)}`);
    }
    return json;
  }
  throw new Error("Shopify GraphQL retries exhausted");
}

async function main() {
  loadEnv();
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN?.trim();
  if (!token) throw new Error("SHOPIFY_ADMIN_ACCESS_TOKEN missing");

  const location = await prisma.companyLocation.findFirst({
    where: { shopifyAdminStoreHandle: { not: null } },
    select: { shopifyAdminStoreHandle: true, name: true },
    orderBy: { updatedAt: "desc" },
  });
  const handle = (location?.shopifyAdminStoreHandle ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\.myshopify\.com.*$/, "")
    .replace(/\/$/, "");
  if (!handle) throw new Error("No shopifyAdminStoreHandle on CompanyLocation");
  console.log("store", handle, "location", location?.name ?? "");

  const drafts = await prisma.$queryRaw`
    SELECT DISTINCT ON (LOWER(COALESCE(sku, '')))
      sku,
      "productTitle",
      "shopifyProductId",
      status,
      "erp1ProductPriority",
      "erp2ProductPriority",
      "updatedAt"
    FROM "ProductItem"
    WHERE LOWER(COALESCE(status, '')) = 'draft'
      AND sku IS NOT NULL AND sku <> ''
      AND "shopifyProductId" IS NOT NULL
      AND "shopifyProductId" NOT LIKE 'erp-%'
    ORDER BY LOWER(COALESCE(sku, '')), "updatedAt" DESC
  `;
  console.log("cosmo_osf_draft_skus", drafts.length);

  const byGid = new Map();
  for (const row of drafts) {
    const gid = productGid(row.shopifyProductId);
    if (!gid) continue;
    if (!byGid.has(gid)) byGid.set(gid, []);
    byGid.get(gid).push(row);
  }
  const gids = [...byGid.keys()];
  console.log("unique_shopify_products", gids.length);

  const QUERY = `
    query OsfDraftLiveStatus($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on Product {
          id
          status
          title
          handle
        }
      }
    }
  `;

  const live = new Map();
  for (let i = 0; i < gids.length; i += 50) {
    const batch = gids.slice(i, i + 50);
    const json = await shopifyGraphql(handle, token, QUERY, { ids: batch });
    for (const node of json.data?.nodes ?? []) {
      if (!node?.id) continue;
      live.set(node.id, node);
    }
    if (i + 50 < gids.length) await new Promise((r) => setTimeout(r, 250));
  }

  const mismatches = [];
  const statusCounts = {};
  for (const [gid, rows] of byGid) {
    const product = live.get(gid);
    const shopifyStatus = product?.status ?? "MISSING";
    statusCounts[shopifyStatus] = (statusCounts[shopifyStatus] || 0) + rows.length;
    if (String(shopifyStatus).toUpperCase() !== "ACTIVE") continue;
    for (const row of rows) {
      mismatches.push({
        sku: row.sku,
        title: row.productTitle,
        osfSiteStatus: row.status,
        shopifyStatus,
        shopifyHandle: product?.handle ?? "",
        shopifyProductId: gid.replace("gid://shopify/Product/", ""),
        erp1: row.erp1ProductPriority,
        erp2: row.erp2ProductPriority,
      });
    }
  }

  mismatches.sort((a, b) => a.sku.localeCompare(b.sku));
  const csvEscape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = ["sku,title,osf_site_status,shopify_status,shopify_handle,shopify_product_id,erp1,erp2"]
    .concat(
      mismatches.map((row) =>
        [
          row.sku,
          row.title,
          row.osfSiteStatus,
          row.shopifyStatus,
          row.shopifyHandle,
          row.shopifyProductId,
          row.erp1,
          row.erp2,
        ]
          .map(csvEscape)
          .join(","),
      ),
    )
    .join("\n");
  fs.writeFileSync("tmp/osf-draft-shopify-active.csv", csv);
  fs.writeFileSync("tmp/osf-draft-shopify-active.json", JSON.stringify(mismatches, null, 2));
  console.log("shopify_status_for_osf_drafts", statusCounts);
  console.log("mismatch_osf_draft_shopify_active", mismatches.length);
  console.log(mismatches.map((r) => r.sku).join(", "));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
