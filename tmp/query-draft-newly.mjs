import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const draftNewly = await p.$queryRaw`
    SELECT DISTINCT ON (LOWER(COALESCE(sku, '')))
      sku,
      "productTitle",
      status,
      "itemStatusCategory",
      "itemStatusLabel",
      "erp1ProductPriority",
      "erp2ProductPriority",
      "updatedAt"
    FROM "ProductItem"
    WHERE LOWER(COALESCE(status, '')) = 'draft'
      AND (
        "itemStatusCategory" = 'NEWLY_ADDED'
        OR LOWER(COALESCE("erp1ProductPriority", '')) LIKE '%newly%'
        OR LOWER(COALESCE("erp2ProductPriority", '')) LIKE '%newly%'
      )
    ORDER BY LOWER(COALESCE(sku, '')), "updatedAt" DESC
  `;
  console.log("draft_newly_count", Array.isArray(draftNewly) ? draftNewly.length : 0);
  console.log(JSON.stringify(draftNewly, null, 2));

    const draftOnErp = await p.$queryRaw`
    SELECT DISTINCT ON (LOWER(COALESCE(sku, '')))
      sku,
      "productTitle",
      status,
      "itemStatusCategory",
      "erp1ProductPriority",
      "erp2ProductPriority",
      "updatedAt"
    FROM "ProductItem"
    WHERE LOWER(COALESCE(status, '')) = 'draft'
      AND sku IS NOT NULL AND sku <> ''
      AND (
        LOWER(COALESCE("erp1ProductPriority", '')) LIKE '%newly%'
        OR LOWER(COALESCE("erp2ProductPriority", '')) LIKE '%newly%'
      )
    ORDER BY LOWER(COALESCE(sku, '')), "updatedAt" DESC
  `;
  const fs = await import("fs");
  fs.writeFileSync("tmp/shopify-draft-erp-newly.json", JSON.stringify(draftOnErp, null, 2));
  console.log("draft_on_erp_newly_count", Array.isArray(draftOnErp) ? draftOnErp.length : 0);

  const mixed = await p.$queryRaw`
    SELECT sku, "productTitle", status, "itemStatusCategory",
           "erp1ProductPriority", "erp2ProductPriority"
    FROM "ProductItem"
    WHERE (
        "itemStatusCategory" = 'DISCONTINUE'
        OR LOWER(COALESCE("erp1ProductPriority", '')) LIKE '%discontinu%'
        OR LOWER(COALESCE("erp2ProductPriority", '')) LIKE '%discontinu%'
      )
      AND (
        LOWER(COALESCE("erp1ProductPriority", '')) LIKE '%newly%'
        OR LOWER(COALESCE("erp2ProductPriority", '')) LIKE '%newly%'
        OR "itemStatusCategory" = 'NEWLY_ADDED'
      )
    LIMIT 200
  `;
  console.log("mixed_priority_count", Array.isArray(mixed) ? mixed.length : 0);
  console.log(JSON.stringify(mixed, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
