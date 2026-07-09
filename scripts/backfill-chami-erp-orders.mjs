/**
 * Backfill all submitted Chami Trading Lanka Sales Invoices from ERP2 into Cosmo OS.
 *
 * Usage:
 *   node scripts/with-env.mjs cosmo-prod node scripts/backfill-chami-erp-orders.mjs
 *   node scripts/with-env.mjs cosmo-prod node scripts/backfill-chami-erp-orders.mjs --dry-run
 *   node scripts/with-env.mjs cosmo-prod node scripts/backfill-chami-erp-orders.mjs --since=2026-01-01
 *   node scripts/with-env.mjs cosmo-prod node scripts/backfill-chami-erp-orders.mjs ACC-SINV-2026-00001 ACC-SINV-2026-00002
 *
 * Replays each missing SI through the existing webhook endpoint so all the same
 * field mapping, payment approval logic, and POS detection runs automatically.
 *
 * Requires APP_BASE_URL in the env file (e.g. https://cosmo-os.vercel.app).
 */

import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

const envFile = process.argv.find((a) => a.endsWith(".env") || a.startsWith(".env.")) ?? ".env.cosmo-prod";
config({ path: envFile });

const args = process.argv.slice(2).filter((a) => !a.endsWith(".env") && !a.startsWith(".env."));
const dryRun = args.includes("--dry-run");
const sinceArg = args.find((a) => a.startsWith("--since="));
const since = sinceArg?.split("=")[1] ?? null;
const specificNames = args.filter((a) => !a.startsWith("--"));

const COMPANY = "Chami Trading Lanka (Pvt) Ltd";
const ERP2_BASE_URL = "https://cosmetics-lk-02.m.frappe.cloud";
const PAGE_SIZE = 200;

const baseUrlArg = args.find((a) => a.startsWith("--base-url="));
const appBaseUrl = (baseUrlArg?.split("=").slice(1).join("=") ?? process.env.APP_BASE_URL ?? "").replace(/\/$/, "");
if (!appBaseUrl) {
  console.error("Set APP_BASE_URL in env (e.g. https://cosmo-os.vercel.app)");
  process.exit(1);
}

const rawUrl = process.env.DATABASE_URL ?? "";
const prisma = new PrismaClient({
  datasources: { db: { url: rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || rawUrl } },
});

async function findErp2Instance() {
  const instances = await prisma.erpnextInstance.findMany({
    select: { label: true, baseUrl: true, apiKey: true, apiSecret: true, incomingWebhookSecret: true },
  });
  // Match cosmetics-lk-02 or the label "ERP 2" / "ERP2"
  return (
    instances.find((i) => i.baseUrl.includes("cosmetics-lk-02")) ??
    instances.find((i) => /erp.?2/i.test(i.label)) ??
    null
  );
}

async function fetchAllSiNames(instance) {
  const baseUrl = instance.baseUrl.replace(/\/$/, "");
  const auth = `token ${instance.apiKey}:${instance.apiSecret}`;
  let page = 0;
  const allNames = [];

  while (true) {
    const filters = [
      ["company", "=", COMPANY],
      ["docstatus", "=", 1],
      ["is_return", "!=", 1],
      ...(since ? [["posting_date", ">=", since]] : []),
    ];
    const f = encodeURIComponent(JSON.stringify(filters));
    const fields = encodeURIComponent(JSON.stringify(["name"]));
    const url = `${baseUrl}/api/resource/Sales%20Invoice?filters=${f}&fields=${fields}&limit_page_length=${PAGE_SIZE}&limit_start=${page * PAGE_SIZE}&order_by=creation asc`;

    const res = await fetch(url, { headers: { Authorization: auth } });
    if (!res.ok) {
      console.error(`ERPNext list fetch failed: HTTP ${res.status}`);
      break;
    }
    const json = await res.json();
    const batch = (json.data ?? []).map((r) => r.name);
    allNames.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    page++;
  }

  return allNames;
}

async function fetchSi(instance, name) {
  const baseUrl = instance.baseUrl.replace(/\/$/, "");
  const res = await fetch(`${baseUrl}/api/resource/Sales%20Invoice/${encodeURIComponent(name)}`, {
    headers: { Authorization: `token ${instance.apiKey}:${instance.apiSecret}` },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? null;
}

function mapSiToWebhookPayload(si) {
  return {
    name: si.name,
    customer: si.customer,
    customer_name: si.customer_name,
    company: si.company,
    posting_date: si.posting_date,
    grand_total: si.grand_total,
    net_total: si.net_total,
    discount_amount: si.discount_amount,
    po_no: si.po_no,
    currency: si.currency,
    docstatus: si.docstatus,
    status: si.status,
    outstanding_amount: si.outstanding_amount,
    set_warehouse: si.set_warehouse,
    is_pos: si.is_pos,
    is_return: si.is_return,
    return_against: si.return_against,
    payment_type: si.payment_type,
    custom_payment_type: si.custom_payment_type,
    custom_merchant_coupon_code: si.custom_merchant_coupon_code,
    merchant_coupon_code: si.merchant_coupon_code,
    coupon_code: si.coupon_code,
    custom_coupon_code: si.custom_coupon_code,
    posa_pos_opening_shift: si.posa_pos_opening_shift,
    owner: si.owner,
    contact_email: si.contact_email,
    contact_mobile: si.contact_mobile,
    address_display: si.address_display,
    shipping_address: si.shipping_address,
    shipping_rule: si.shipping_rule,
    total_taxes_and_charges: si.total_taxes_and_charges,
    taxes: (si.taxes ?? []).map((t) => ({
      description: t.description,
      tax_amount: t.tax_amount,
      account_head: t.account_head,
    })),
    items: (si.items ?? []).map((item) => ({
      item_code: item.item_code,
      item_name: item.item_name,
      qty: item.qty,
      rate: item.rate,
      amount: item.amount,
      price_list_rate: item.price_list_rate,
      discount_amount: item.discount_amount,
    })),
    payments: (si.payments ?? []).map((p) => ({
      mode_of_payment: p.mode_of_payment,
      amount: p.amount,
    })),
  };
}

async function replayWebhook(secret, payload) {
  const res = await fetch(`${appBaseUrl}/api/webhooks/erpnext/sales-invoice`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-erpnext-secret": secret },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { status: res.status, body: json };
}

// --- main ---

const instance = await findErp2Instance();
if (!instance) {
  console.error("ERP2 instance not found in DB (looking for cosmetics-lk-02 in baseUrl or 'ERP 2' label)");
  process.exit(1);
}

const secret = instance.incomingWebhookSecret ?? process.env.ERPNEXT_INCOMING_WEBHOOK_SECRET ?? "";
if (!secret) {
  console.error("No incoming webhook secret on the ERP2 instance");
  process.exit(1);
}

console.log(`ERP2 instance: ${instance.label} (${instance.baseUrl})`);
console.log(`Target app:    ${appBaseUrl}`);
console.log(`Company:       ${COMPANY}`);
if (since) console.log(`Since:         ${since}`);
if (dryRun) console.log("Mode:          DRY RUN — no webhook POST\n");

let targets = specificNames;

if (targets.length === 0) {
  console.log("Fetching all submitted SI names from ERPNext...");
  const allNames = await fetchAllSiNames(instance);
  console.log(`ERPNext has ${allNames.length} submitted SI(s) for ${COMPANY}`);

  if (allNames.length === 0) {
    console.log("Nothing to backfill.");
    await prisma.$disconnect();
    process.exit(0);
  }

  // Check which ones are already in the DB (shopifyOrderId = "erp-{name}")
  const erpIds = allNames.map((n) => `erp-${n}`);
  const existing = await prisma.order.findMany({
    where: { shopifyOrderId: { in: erpIds } },
    select: { shopifyOrderId: true },
  });
  const haveIds = new Set(existing.map((o) => o.shopifyOrderId));
  targets = allNames.filter((n) => !haveIds.has(`erp-${n}`));

  console.log(`Already imported: ${existing.length}`);
  console.log(`Missing (to backfill): ${targets.length}`);
} else {
  console.log(`Processing ${targets.length} specific SI(s): ${targets.join(", ")}`);
}

if (targets.length === 0) {
  console.log("\nAll Chami orders are already in Cosmo OS. Nothing to do.");
  await prisma.$disconnect();
  process.exit(0);
}

console.log(`\nBackfilling ${targets.length} order(s)...\n`);

let ok = 0;
let skipped = 0;
let failed = 0;

for (const name of targets) {
  const si = await fetchSi(instance, name);
  if (!si) {
    console.log(`✗ ${name}: not found in ERPNext`);
    failed++;
    continue;
  }

  if (si.company !== COMPANY) {
    console.log(`○ ${name}: company is "${si.company}", skipping`);
    skipped++;
    continue;
  }

  const payload = mapSiToWebhookPayload(si);

  if (dryRun) {
    console.log(`○ ${name}: would POST (is_pos=${si.is_pos}, status=${si.status}, grand_total=${si.grand_total})`);
    skipped++;
    continue;
  }

  const result = await replayWebhook(secret, payload);
  const success = result.status >= 200 && result.status < 300;
  console.log(`${success ? "✓" : "✗"} ${name}: HTTP ${result.status}`, JSON.stringify(result.body));
  if (success) ok++;
  else failed++;
}

console.log(`\nDone — ${ok} imported, ${skipped} skipped, ${failed} failed`);

await prisma.$disconnect();
