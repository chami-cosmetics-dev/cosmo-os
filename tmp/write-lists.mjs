import fs from "fs";

const drafts = JSON.parse(fs.readFileSync("tmp/shopify-draft-erp-newly.json", "utf8"));
const flips = JSON.parse(fs.readFileSync("tmp/disc-to-newly.json", "utf8"));
const csvEscape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;

const draftCsv = ["sku,title,shopify_status,erp1,erp2"]
  .concat(
    drafts.map((row) =>
      [row.sku, row.productTitle, row.status, row.erp1ProductPriority, row.erp2ProductPriority]
        .map(csvEscape)
        .join(","),
    ),
  )
  .join("\n");
fs.writeFileSync("tmp/shopify-draft-erp-newly.csv", draftCsv);

const flipCsv = ["erp,sku,from,to,when,by"]
  .concat(
    flips.map((row) =>
      [row.erp, row.sku, row.from, row.to, row.when, row.by].map(csvEscape).join(","),
    ),
  )
  .join("\n");
fs.writeFileSync("tmp/discontinue-to-newly-added.csv", flipCsv);
console.log("wrote csvs", drafts.length, flips.length);
