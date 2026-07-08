/**
 * Replay ERP Sales Invoice submit webhooks for orders missing from Vault OS.
 *
 * Usage:
 *   node scripts/with-env.mjs vault node scripts/backfill-erp-si-webhook.mjs SV300-0116 SV200-0045
 *   node scripts/with-env.mjs vault node scripts/backfill-erp-si-webhook.mjs --since=2026-06-23 --series=SV300
 *   node scripts/with-env.mjs vault node scripts/backfill-erp-si-webhook.mjs --dry-run SV300-0116
 *
 * Requires APP_BASE_URL and ERP instance credentials in the target env file.
 */

import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

const envFile = process.argv.find((a) => a.endsWith(".env") || a.startsWith(".env.")) ?? ".env.vault";
config({ path: envFile });

const args = process.argv.slice(2).filter((a) => !a.endsWith(".env") && !a.startsWith(".env."));
const dryRun = args.includes("--dry-run");
const sinceArg = args.find((a) => a.startsWith("--since="));
const seriesArg = args.find((a) => a.startsWith("--series="));
const since = sinceArg?.split("=")[1] ?? null;
const series = seriesArg?.split("=")[1] ?? null;
const names = args.filter((a) => !a.startsWith("--"));

const baseUrlArg = args.find((a) => a.startsWith("--base-url="));
const appBaseUrl = (baseUrlArg?.split("=").slice(1).join("=") ?? process.env.APP_BASE_URL ?? "").replace(
  /\/$/,
  "",
);
if (!appBaseUrl) {
  console.error("Set APP_BASE_URL in env (e.g. https://vault-os-sandy.vercel.app)");
  process.exit(1);
}

const rawUrl = process.env.DATABASE_URL ?? "";
const prisma = new PrismaClient({
  datasources: { db: { url: rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || rawUrl } },
});

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

async function fetchSi(instance, name) {
  const baseUrl = instance.baseUrl.replace(/\/$/, "");
  const res = await fetch(`${baseUrl}/api/resource/Sales%20Invoice/${encodeURIComponent(name)}`, {
    headers: { Authorization: `token ${instance.apiKey}:${instance.apiSecret}` },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? null;
}

async function listMissingFromErp(instance, namingSeries) {
  const baseUrl = instance.baseUrl.replace(/\/$/, "");
  const filters = [
    ["naming_series", "=", namingSeries],
    ["docstatus", "=", 1],
    ...(since ? [["creation", ">=", since]] : []),
  ];
  const f = encodeURIComponent(JSON.stringify(filters));
  const fields = encodeURIComponent(JSON.stringify(["name"]));
  const res = await fetch(
    `${baseUrl}/api/resource/Sales%20Invoice?filters=${f}&fields=${fields}&limit_page_length=200&order_by=creation asc`,
    { headers: { Authorization: `token ${instance.apiKey}:${instance.apiSecret}` } },
  );
  const json = await res.json();
  const erpNames = (json.data ?? []).map((r) => r.name);
  if (erpNames.length === 0) return [];

  const existing = await prisma.order.findMany({
    where: { name: { in: erpNames } },
    select: { name: true },
  });
  const have = new Set(existing.map((o) => o.name));
  return erpNames.filter((n) => !have.has(n));
}

async function replayWebhook(secret, payload) {
  const res = await fetch(`${appBaseUrl}/api/webhooks/erpnext/sales-invoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-erpnext-secret": secret,
    },
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

const instances = await prisma.erpnextInstance.findMany({
  select: {
    label: true,
    baseUrl: true,
    apiKey: true,
    apiSecret: true,
    incomingWebhookSecret: true,
  },
});

let targets = names;
if (targets.length === 0 && series) {
  const erp2 = instances.find((i) => i.label.replace(/\s/g, "").toLowerCase() === "erp_2-main");
  if (!erp2) {
    console.error("ERP_2-Main instance not found");
    process.exit(1);
  }
  targets = await listMissingFromErp(erp2, series.endsWith("-") ? series : `${series}-.####`);
  console.log(`Found ${targets.length} missing ${series} invoice(s) in ERP2`);
}

if (targets.length === 0) {
  console.error("No invoice names to process. Pass names or --series=SV300 --since=2026-06-23");
  process.exit(1);
}

console.log(`Target: ${appBaseUrl}`);
console.log(`Invoices: ${targets.join(", ")}`);
if (dryRun) console.log("(dry run — no webhook POST)\n");

for (const name of targets) {
  let si = null;
  let secret = process.env.ERPNEXT_INCOMING_WEBHOOK_SECRET ?? "";

  for (const instance of instances) {
    si = await fetchSi(instance, name);
    if (si) {
      secret = instance.incomingWebhookSecret ?? secret;
      break;
    }
  }

  if (!si) {
    console.log(`✗ ${name}: not found in any ERP instance`);
    continue;
  }
  if (!secret) {
    console.log(`✗ ${name}: no incoming webhook secret configured`);
    continue;
  }

  const payload = mapSiToWebhookPayload(si);
  if (dryRun) {
    console.log(`○ ${name}: would POST (${si.company}, docstatus=${si.docstatus})`);
    continue;
  }

  const result = await replayWebhook(secret, payload);
  const ok = result.status >= 200 && result.status < 300;
  console.log(`${ok ? "✓" : "✗"} ${name}: HTTP ${result.status}`, JSON.stringify(result.body));
}

await prisma.$disconnect();
