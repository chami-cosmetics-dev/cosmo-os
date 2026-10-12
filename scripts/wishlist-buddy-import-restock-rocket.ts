/**
 * Import a Restock Rocket "requests" CSV export as Wishlist Buddy Stock Requests.
 *
 * Dry run by default (prints counts only, writes nothing). Add --apply to write.
 * Sends NO customer emails: imported customers only get the back-in-stock email (if they have an
 * email) when Shopify restocks. Safe to re-run: rows already imported are skipped (externalRef).
 * Output never prints customer names, emails or phones.
 *
 * Usage:
 *   node scripts/with-env.mjs cosmo-prod npx tsx --tsconfig tsconfig.scripts.json \
 *     scripts/wishlist-buddy-import-restock-rocket.ts "C:\path\to\export.csv"
 *   ... --apply                      # write
 *   ... --store=u71ajc-11            # Shopify store handle (default u71ajc-11)
 *   ... --storefront-url=https://cosmetics.lk   # for product links in the restock email
 *   ... --skip-stock-check           # don't run the ERP stock check after creating
 *   ... --limit=3                    # only the first N importable rows (testing)
 *
 * The --tsconfig flag maps Next's `server-only` guard to a no-op so lib modules load from the CLI.
 */

import { readFileSync } from "node:fs";

import { prisma } from "../lib/prisma";
import { findStoreLocation, runStockLookupForRequest } from "../lib/wishlist-buddy/requests";
import {
  parseRestockRocketCsv,
  restockRocketRemark,
  type RestockRocketRequest,
} from "../lib/wishlist-buddy/restock-rocket-import";

const OPEN_STATUSES = ["new", "contacted"];

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

async function main() {
  const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!file) throw new Error("Pass the CSV path as the first argument.");
  const apply = process.argv.includes("--apply");
  const skipStockCheck = process.argv.includes("--skip-stock-check");
  const storeHandle = (arg("store") ?? "u71ajc-11").trim().toLowerCase();
  const storefrontUrl = arg("storefront-url")?.replace(/\/$/, "") ?? null;
  const limit = arg("limit") ? Number(arg("limit")) : null;

  const { requests: parsed, skipped } = parseRestockRocketCsv(readFileSync(file, "utf8"));
  const location = await findStoreLocation(storeHandle);
  if (!location) throw new Error(`No Cosmo OS location is linked to Shopify store "${storeHandle}".`);

  const skus = [...new Set(parsed.map((r) => r.sku))];
  const products = await prisma.productItem.findMany({
    where: { companyLocationId: location.id, sku: { in: skus } },
    select: { sku: true, shopifyVariantId: true, shopifyProductId: true, productTitle: true, variantTitle: true, handle: true },
  });
  const productBySku = new Map(products.map((p) => [p.sku!, p]));

  const alreadyImported = new Set(
    (
      await prisma.stockRequest.findMany({
        where: { companyId: location.companyId, externalRef: { in: parsed.map((r) => r.externalRef) } },
        select: { externalRef: true },
      })
    ).map((r) => r.externalRef),
  );

  const toCreate: RestockRocketRequest[] = [];
  let skippedImported = 0;
  let skippedOpenDuplicate = 0;
  for (const r of parsed) {
    if (alreadyImported.has(r.externalRef)) {
      skippedImported++;
      continue;
    }
    // Same person already waiting for the same SKU (e.g. signed up again through Wishlist Buddy).
    const open = await prisma.stockRequest.findFirst({
      where: {
        companyId: location.companyId,
        sku: r.sku,
        status: { in: OPEN_STATUSES },
        restockEmailSentAt: null,
        OR: [...(r.email ? [{ customerEmail: r.email }] : []), ...(r.phone ? [{ customerPhone: r.phone }] : [])],
      },
      select: { id: true },
    });
    if (open) {
      skippedOpenDuplicate++;
      continue;
    }
    toCreate.push(r);
  }
  const batch = limit && limit > 0 ? toCreate.slice(0, limit) : toCreate;

  const unmatchedSkus = [...new Set(batch.filter((r) => !productBySku.has(r.sku)).map((r) => r.sku))];
  console.log(`Store: ${storeHandle} -> Cosmo location ${location.id}`);
  console.log(`Rows parsed: ${parsed.length} (with email: ${parsed.filter((r) => r.email).length}, phone only: ${parsed.filter((r) => r.phone).length})`);
  console.log(`Skipped while parsing: ${skipped.length}`);
  for (const s of skipped) console.log(`  line ${s.line}: ${s.reason}`);
  console.log(`Already imported: ${skippedImported} | already waiting (open request): ${skippedOpenDuplicate}`);
  console.log(`To create: ${batch.length}${limit ? ` (limited from ${toCreate.length})` : ""}`);
  console.log(`SKUs found in Cosmo product list: ${skus.length - skus.filter((s) => !productBySku.has(s)).length}/${skus.length}`);
  if (unmatchedSkus.length) {
    console.log(`SKUs not in the product list (imported without Shopify variant; matched by SKU on restock): ${unmatchedSkus.join(", ")}`);
  }

  if (!apply) {
    console.log("\nDry run: nothing written. Re-run with --apply to import.");
    return;
  }

  let created = 0;
  let stockChecked = 0;
  for (const r of batch) {
    const product = productBySku.get(r.sku);
    const row = await prisma.stockRequest.create({
      data: {
        companyId: location.companyId,
        companyLocationId: location.id,
        shopifyStoreHandle: storeHandle,
        shopifyVariantId: product?.shopifyVariantId ?? null,
        shopifyProductId: product?.shopifyProductId ?? null,
        sku: r.sku,
        productTitle: product?.productTitle ?? r.productName,
        variantTitle: product?.variantTitle && product.variantTitle !== "Default Title" ? product.variantTitle : null,
        productUrl:
          storefrontUrl && product?.handle
            ? `${storefrontUrl}/products/${product.handle}${product.shopifyVariantId ? `?variant=${product.shopifyVariantId}` : ""}`
            : null,
        customerName: r.name,
        customerEmail: r.email,
        customerPhone: r.phone,
        source: "import",
        externalRef: r.externalRef,
        remark: restockRocketRemark(r),
        stockLookupStatus: "pending",
        ...(r.requestedAt ? { createdAt: r.requestedAt } : {}),
      },
      select: { id: true },
    });
    created++;
    if (!skipStockCheck) {
      await runStockLookupForRequest(row.id, { sendAvailabilityEmail: false });
      stockChecked++;
    }
    if (created % 10 === 0) console.log(`  ...${created}/${batch.length}`);
  }
  console.log(`\nCreated ${created} stock request(s); ERP stock checked for ${stockChecked}. No emails sent.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
