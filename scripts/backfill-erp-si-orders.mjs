/**
 * Backfill submitted Sales Invoices from cosmetics ERP1 + ERP2 into Cosmo OS Orders
 * (and Contact Master, once the SI webhook contact sync is deployed).
 *
 * Usage:
 *   node scripts/with-env.mjs cosmo-prod node scripts/backfill-erp-si-orders.mjs
 *   node scripts/with-env.mjs cosmo-prod node scripts/backfill-erp-si-orders.mjs --dry-run
 *   node scripts/with-env.mjs cosmo-prod node scripts/backfill-erp-si-orders.mjs --slot=erp1
 *   node scripts/with-env.mjs cosmo-prod node scripts/backfill-erp-si-orders.mjs --since=2026-01-01
 *   node scripts/with-env.mjs cosmo-prod node scripts/backfill-erp-si-orders.mjs --company="Chami Trading Lanka (Pvt) Ltd"
 *   node scripts/with-env.mjs cosmo-prod node scripts/backfill-erp-si-orders.mjs ACC-SINV-2026-00001
 *
 * Replays each missing SI through /api/webhooks/erpnext/sales-invoice so Orders +
 * Contact Master sync use the live webhook path.
 *
 * Requires APP_BASE_URL in the env file (e.g. https://cosmo-os.vercel.app).
 */

import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

const envFile =
  process.argv.find((a) => a.endsWith(".env") || a.startsWith(".env.")) ?? ".env.cosmo-prod";
config({ path: envFile });

const args = process.argv.slice(2).filter((a) => !a.endsWith(".env") && !a.startsWith(".env."));
const dryRun = args.includes("--dry-run");
const sinceArg = args.find((a) => a.startsWith("--since="));
const since = sinceArg?.split("=")[1] ?? null;
const companyArg = args.find((a) => a.startsWith("--company="));
const companyFilter = companyArg?.slice("--company=".length) || null;
const slotArg = args.find((a) => a.startsWith("--slot="));
const slotFilter = slotArg?.split("=")[1]?.toLowerCase() ?? null;
const delayMsArg = args.find((a) => a.startsWith("--delay-ms="));
const delayMs = Number(delayMsArg?.split("=")[1] ?? "150");
const specificNames = args.filter((a) => !a.startsWith("--"));

const PAGE_SIZE = 200;

const baseUrlArg = args.find((a) => a.startsWith("--base-url="));
const appBaseUrl = (
  baseUrlArg?.split("=").slice(1).join("=") ??
  process.env.APP_BASE_URL ??
  ""
).replace(/\/$/, "");
if (!appBaseUrl) {
  console.error("Set APP_BASE_URL in env (e.g. https://cosmo-os.vercel.app)");
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const rawUrl = process.env.DATABASE_URL ?? "";
const prisma = new PrismaClient({
  datasources: {
    db: { url: rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || rawUrl },
  },
});

function resolveSlots(instances) {
  const erp1Match = instances.find((i) => /erp[_\s-]*1\b/i.test(i.label ?? ""));
  const erp2Match = instances.find((i) => /erp[_\s-]*2\b/i.test(i.label ?? ""));
  if (erp1Match || erp2Match) {
    return [
      ...(erp1Match ? [{ ...erp1Match, slot: "erp1" }] : []),
      ...(erp2Match ? [{ ...erp2Match, slot: "erp2" }] : []),
    ];
  }
  return instances.slice(0, 2).map((inst, idx) => ({
    ...inst,
    slot: idx === 0 ? "erp1" : "erp2",
  }));
}

async function loadInstances() {
  const instances = await prisma.erpnextInstance.findMany({
    select: {
      id: true,
      label: true,
      baseUrl: true,
      apiKey: true,
      apiSecret: true,
      incomingWebhookSecret: true,
      companyId: true,
    },
    orderBy: { createdAt: "asc" },
  });
  let slotted = resolveSlots(instances);
  if (slotFilter === "erp1" || slotFilter === "erp2") {
    slotted = slotted.filter((i) => i.slot === slotFilter);
  }
  return slotted;
}

async function fetchAllSiNames(instance, erpCompany) {
  const baseUrl = instance.baseUrl.replace(/\/$/, "");
  const auth = `token ${instance.apiKey}:${instance.apiSecret}`;
  let page = 0;
  const allNames = [];

  while (true) {
    const filters = [
      ["docstatus", "=", 1],
      ["is_return", "!=", 1],
      ...(erpCompany ? [["company", "=", erpCompany]] : []),
      ...(since ? [["posting_date", ">=", since]] : []),
    ];
    const f = encodeURIComponent(JSON.stringify(filters));
    const fields = encodeURIComponent(JSON.stringify(["name"]));
    const url = `${baseUrl}/api/resource/Sales%20Invoice?filters=${f}&fields=${fields}&limit_page_length=${PAGE_SIZE}&limit_start=${page * PAGE_SIZE}&order_by=creation asc`;

    const res = await fetch(url, { headers: { Authorization: auth } });
    if (!res.ok) {
      console.error(`  [${instance.slot}] SI list fetch failed: HTTP ${res.status}`);
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
  const res = await fetch(
    `${baseUrl}/api/resource/Sales%20Invoice/${encodeURIComponent(name)}`,
    { headers: { Authorization: `token ${instance.apiKey}:${instance.apiSecret}` } },
  );
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
    custom_special_remarks: si.custom_special_remarks,
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
      warehouse: item.warehouse,
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

async function resolveDefaultErpCompany(instance) {
  if (companyFilter) return companyFilter;
  const location = await prisma.companyLocation.findFirst({
    where: { erpnextInstanceId: instance.id, erpnextCompany: { not: null } },
    select: { erpnextCompany: true },
  });
  return location?.erpnextCompany ?? null;
}

async function backfillInstance(instance) {
  const secret =
    instance.incomingWebhookSecret ?? process.env.ERPNEXT_INCOMING_WEBHOOK_SECRET ?? "";
  if (!secret) {
    console.error(`  [${instance.slot}] No incoming webhook secret — skip`);
    return { ok: 0, skipped: 0, failed: 0 };
  }

  const erpCompany = await resolveDefaultErpCompany(instance);
  console.log(`\n=== ${instance.slot.toUpperCase()} (${instance.label}) ${instance.baseUrl} ===`);
  if (erpCompany) console.log(`ERP company filter: ${erpCompany}`);
  else console.log("ERP company filter: (none — all companies on this instance)");

  let targets = specificNames;

  if (targets.length === 0) {
    console.log("Fetching submitted SI names...");
    const allNames = await fetchAllSiNames(instance, erpCompany);
    console.log(`ERPNext has ${allNames.length} submitted SI(s)`);

    if (allNames.length === 0) {
      return { ok: 0, skipped: 0, failed: 0 };
    }

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
    console.log(`Processing ${targets.length} specific SI(s)`);
  }

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

    if (erpCompany && si.company !== erpCompany) {
      console.log(`○ ${name}: company is "${si.company}", skipping`);
      skipped++;
      continue;
    }

    const payload = mapSiToWebhookPayload(si);

    if (dryRun) {
      console.log(
        `○ ${name}: would POST (is_pos=${si.is_pos}, status=${si.status}, grand_total=${si.grand_total})`,
      );
      skipped++;
      continue;
    }

    const result = await replayWebhook(secret, payload);
    const success = result.status >= 200 && result.status < 300;
    console.log(
      `${success ? "✓" : "✗"} ${name}: HTTP ${result.status}`,
      JSON.stringify(result.body),
    );
    if (success) ok++;
    else failed++;

    if (delayMs > 0) await sleep(delayMs);
  }

  console.log(`[${instance.slot}] Done — ${ok} imported, ${skipped} skipped, ${failed} failed`);
  return { ok, skipped, failed };
}

const instances = await loadInstances();
if (instances.length === 0) {
  console.error("No ERP1/ERP2 instances found in DB");
  process.exit(1);
}

console.log(`Target app: ${appBaseUrl}`);
if (since) console.log(`Since: ${since}`);
if (dryRun) console.log("Mode: DRY RUN — no webhook POST");
console.log(
  `Instances: ${instances.map((i) => `${i.slot}=${i.label}`).join(", ")}`,
);

let totalOk = 0;
let totalSkipped = 0;
let totalFailed = 0;

for (const instance of instances) {
  const result = await backfillInstance(instance);
  totalOk += result.ok;
  totalSkipped += result.skipped;
  totalFailed += result.failed;
}

console.log(
  `\nAll done — ${totalOk} imported, ${totalSkipped} skipped, ${totalFailed} failed`,
);

await prisma.$disconnect();
