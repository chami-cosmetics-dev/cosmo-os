import fs from "fs";
import { PrismaClient } from "@prisma/client";

function parseStorefrontProductHandles(xml, origin) {
  const originHost = origin.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  const handles = new Set();
  const re = /https?:\/\/[^/]+\/products\/([^<?\s]+)/gi;
  let match;
  while ((match = re.exec(xml))) {
    const locHost = match[0].replace(/^https?:\/\//i, "").split("/")[0] ?? "";
    if (locHost && originHost && locHost.toLowerCase() !== originHost.toLowerCase()) continue;
    handles.add(decodeURIComponent(match[1].replace(/\/$/, "")).toLowerCase());
  }
  return handles;
}

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

async function fetchText(url) {
  const res = await fetch(url, { headers: { Accept: "application/xml,text/xml,*/*" } });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.text();
}

async function main() {
  loadEnv();
  const origin = "https://cosmetics.lk";
  const indexXml = await fetchText(`${origin}/sitemap.xml`);
  const locRe = /<loc>([^<]*sitemap_products_[^<]+)<\/loc>/gi;
  const productSitemaps = [];
  let locMatch;
  while ((locMatch = locRe.exec(indexXml))) {
    productSitemaps.push(locMatch[1].replaceAll("&amp;", "&"));
  }
  const liveHandles = new Set();
  for (const url of productSitemaps) {
    const xml = await fetchText(url);
    for (const handle of parseStorefrontProductHandles(xml, origin)) liveHandles.add(handle);
  }

  const drafts = await prisma.productItem.findMany({
    where: { status: { equals: "draft", mode: "insensitive" }, handle: { not: null } },
    select: { id: true, sku: true, handle: true, productTitle: true },
  });
  const ids = [];
  const skus = [];
  for (const row of drafts) {
    const handle = (row.handle ?? "").trim().toLowerCase();
    if (!liveHandles.has(handle)) continue;
    ids.push(row.id);
    if (row.sku) skus.push(row.sku);
  }
  const uniqueSkus = [...new Set(skus)].sort();
  const result = ids.length
    ? await prisma.productItem.updateMany({ where: { id: { in: ids } }, data: { status: "active" } })
    : { count: 0 };
  console.log("live_handles", liveHandles.size);
  console.log("updated_rows", result.count);
  console.log("skus", uniqueSkus.join(", "));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
