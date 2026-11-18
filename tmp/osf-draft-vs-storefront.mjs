import fs from "fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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

function parseHandles(xml) {
  const handles = new Set();
  const re = /https:\/\/cosmetics\.lk\/products\/([^<?\s]+)/g;
  let match;
  while ((match = re.exec(xml))) {
    handles.add(decodeURIComponent(match[1].replace(/\/$/, "")).toLowerCase());
  }
  return handles;
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { Accept: "application/xml,text/xml,*/*" } });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.text();
}

async function main() {
  loadEnv();
  const indexXml = await fetchText("https://cosmetics.lk/sitemap.xml");
  const locRe = /<loc>(https:\/\/cosmetics\.lk\/sitemap_products_[^<]+)<\/loc>/g;
  const productSitemaps = [];
  let locMatch;
  while ((locMatch = locRe.exec(indexXml))) {
    productSitemaps.push(locMatch[1].replaceAll("&amp;", "&"));
  }
  if (productSitemaps.length === 0) throw new Error("No product sitemaps");

  const liveHandles = new Set();
  for (const url of productSitemaps) {
    const xml = await fetchText(url);
    for (const handle of parseHandles(xml)) liveHandles.add(handle);
  }
  console.log("live_storefront_handles", liveHandles.size);

  const drafts = await prisma.$queryRaw`
    SELECT DISTINCT ON (LOWER(COALESCE(sku, '')))
      sku,
      "productTitle",
      handle,
      status,
      "erp1ProductPriority",
      "erp2ProductPriority",
      "shopifyProductId",
      "updatedAt"
    FROM "ProductItem"
    WHERE LOWER(COALESCE(status, '')) = 'draft'
      AND sku IS NOT NULL AND sku <> ''
    ORDER BY LOWER(COALESCE(sku, '')), "updatedAt" DESC
  `;

  const mismatches = [];
  let noHandle = 0;
  for (const row of drafts) {
    const handle = String(row.handle ?? "")
      .trim()
      .toLowerCase();
    if (!handle) {
      noHandle += 1;
      continue;
    }
    if (!liveHandles.has(handle)) continue;
    mismatches.push({
      sku: row.sku,
      title: row.productTitle,
      osfSiteStatus: row.status,
      shopifyHandle: handle,
      shopifyUrl: `https://cosmetics.lk/products/${handle}`,
      erp1: row.erp1ProductPriority,
      erp2: row.erp2ProductPriority,
    });
  }

  mismatches.sort((a, b) => a.sku.localeCompare(b.sku));
  const csvEscape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = ["sku,title,osf_site_status,shopify_handle,shopify_url,erp1,erp2"]
    .concat(
      mismatches.map((row) =>
        [
          row.sku,
          row.title,
          row.osfSiteStatus,
          row.shopifyHandle,
          row.shopifyUrl,
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
  console.log("cosmo_osf_draft_skus", drafts.length, "no_handle", noHandle);
  console.log("mismatch_osf_draft_live_on_site", mismatches.length);
  console.log(mismatches.map((r) => r.sku).join(", "));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
