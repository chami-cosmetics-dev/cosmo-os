// Read-only diagnostic: verify where Vault OSF MRP / Discounted Price come from in ERP.
// Usage: node --env-file=.env.vault scripts/verify-vault-osf-pricing.mjs SKU1 SKU2 ...
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const SKUS = process.argv.slice(2);

async function get(cfg, path) {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    headers: { Authorization: `token ${cfg.apiKey}:${cfg.apiSecret}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`GET ${path} [${res.status}] ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const instances = (await prisma.erpnextInstance.findMany({ orderBy: { createdAt: "asc" } }))
  .filter((i) => i.baseUrl && i.apiKey && i.apiSecret)
  .map((i) => ({ id: i.id, label: i.label, companyId: i.companyId,
    cfg: { baseUrl: i.baseUrl.replace(/\/$/, ""), apiKey: i.apiKey, apiSecret: i.apiSecret } }));

console.log(`ERP instances: ${instances.map((i) => `${i.label} (${i.cfg.baseUrl})`).join(", ")}\n`);

for (const inst of instances) {
  console.log(`\n================ ${inst.label} ================`);
  // 1. What selling price lists exist?
  const pls = await get(inst.cfg, `/api/resource/Price List?fields=${encodeURIComponent(JSON.stringify(["name","enabled","selling","currency"]))}&limit_page_length=100`);
  console.log("Selling price lists:", pls.data.filter((p) => p.selling).map((p) => `${p.name}[${p.currency}${p.enabled ? "" : ",DISABLED"}]`).join(", "));

  // 2. For each SKU, every Item Price row (all lists, all companies, all currencies)
  const fields = JSON.stringify(["item_code","price_list","price_list_rate","currency","valid_from","valid_upto","selling","buying","batch_no","customer","uom"]);
  for (const sku of SKUS) {
    const filters = JSON.stringify([["item_code","=",sku]]);
    const r = await get(inst.cfg, `/api/resource/Item Price?fields=${encodeURIComponent(fields)}&filters=${encodeURIComponent(filters)}&limit_page_length=200`);
    const rows = r.data ?? [];
    console.log(`\n  ${sku}: ${rows.length} Item Price row(s)`);
    for (const p of rows) {
      console.log(`     ${p.price_list} | rate=${p.price_list_rate} ${p.currency} | selling=${p.selling} buying=${p.buying} | valid ${p.valid_from ?? "-"}..${p.valid_upto ?? "-"} | uom=${p.uom ?? "-"} cust=${p.customer ?? "-"}`);
    }
    // 3. Pricing rules touching this SKU
    const rf = JSON.stringify(["name","rate_or_discount","discount_percentage","rate","discount_amount","valid_from","valid_upto","disable","selling","apply_on","priority","coupon_code_based"]);
    const rfl = JSON.stringify([["apply_on","=","Item Code"],["`tabPricing Rule Item Code`.item_code","=",sku]]);
    const rr = await get(inst.cfg, `/api/resource/Pricing Rule?fields=${encodeURIComponent(rf)}&filters=${encodeURIComponent(rfl)}&limit_page_length=100`).catch((e) => ({ data: [], err: e.message }));
    for (const g of rr.data ?? []) {
      console.log(`     RULE ${g.name} | ${g.rate_or_discount} pct=${g.discount_percentage} rate=${g.rate} amt=${g.discount_amount} | valid ${g.valid_from ?? "-"}..${g.valid_upto ?? "-"} | disable=${g.disable} selling=${g.selling} prio=${g.priority} coupon=${g.coupon_code_based}`);
    }
  }
}
await prisma.$disconnect();
