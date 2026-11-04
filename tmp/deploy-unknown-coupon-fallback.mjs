/**
 * Push patched "Validate Coupon Payment Type" Server Scripts, then dry-run
 * a draft POS-like SI on ERP02 (NG15 + PRLE-0006 item vs non-rule item).
 *
 * Usage:
 *   node scripts/with-env.mjs cosmo-prod node tmp/deploy-unknown-coupon-fallback.mjs
 *   node scripts/with-env.mjs cosmo-prod node tmp/deploy-unknown-coupon-fallback.mjs --skip-erp01
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const skipErp01 = process.argv.includes("--skip-erp01");
const skipDryRun = process.argv.includes("--skip-dry-run");

const SCRIPT_NAME = "Validate Coupon Payment Type";
const ERP2_MARKER = "cosmetics-lk-02";
const ERP1_MARKER = "cosmetics-lk-01";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: (process.env.DATABASE_URL ?? "").replace(
        /(ep-[^.]+)-pooler(\.[^/]+)/,
        "$1$2",
      ),
    },
  },
});

function authHeader(inst) {
  return { Authorization: `token ${inst.apiKey}:${inst.apiSecret}` };
}

async function erpJson(inst, method, path, body) {
  const base = inst.baseUrl.replace(/\/$/, "");
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...authHeader(inst),
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text.slice(0, 2000) };
  }
  if (!res.ok) {
    const msg =
      json?.exception ||
      json?.message ||
      json?._server_messages ||
      json?._raw ||
      text.slice(0, 500);
    throw new Error(`${method} ${path} HTTP ${res.status}: ${String(msg).slice(0, 1500)}`);
  }
  return json;
}

async function getInstance(marker, labelRe) {
  const instances = await prisma.erpnextInstance.findMany({
    select: { label: true, baseUrl: true, apiKey: true, apiSecret: true },
  });
  return (
    instances.find((i) => (i.baseUrl || "").includes(marker)) ??
    instances.find((i) => labelRe.test(i.label || "")) ??
    null
  );
}

async function pushScript(inst, label, localPath, backupPath) {
  const script = readFileSync(localPath, "utf8");
  if (!script.includes("unknown POS coupon")) {
    throw new Error(`${localPath} missing unknown-coupon fallback`);
  }

  const encoded = encodeURIComponent(SCRIPT_NAME);
  if (!existsSync(backupPath)) {
    const current = await erpJson(
      inst,
      "GET",
      `/api/resource/Server Script/${encoded}`,
    );
    const existing = current?.data?.script ?? "";
    writeFileSync(backupPath, existing, "utf8");
    console.log(`${label}: backed up current script (${existing.length} chars) -> ${backupPath}`);
  } else {
    console.log(`${label}: backup already exists, skip overwrite`);
  }

  await erpJson(inst, "PUT", `/api/resource/Server Script/${encoded}`, { script });
  const verify = await erpJson(
    inst,
    "GET",
    `/api/resource/Server Script/${encoded}?fields=["name","modified","script"]`,
  );
  const saved = verify?.data?.script ?? "";
  const ok = saved.includes("unknown POS coupon") && saved.includes("elif not best_code:");
  console.log(
    `${label}: script updated modified=${verify?.data?.modified} chars=${saved.length} fallback=${ok}`,
  );
  if (!ok) throw new Error(`${label}: saved script missing fallback markers`);
}

async function dryRunErp2(inst) {
  const payload = {
    doctype: "Sales Invoice",
    naming_series: "ACC-SINV-.YYYY.-",
    company: "DTD Trading (Pvt) Ltd",
    customer: "0772006060",
    posting_date: "2026-10-29",
    due_date: "2026-10-29",
    currency: "LKR",
    conversion_rate: 1,
    selling_price_list: "Standard Selling",
    price_list_currency: "LKR",
    plc_conversion_rate: 1,
    is_pos: 1,
    pos_profile: "DTD POS",
    ignore_pricing_rule: 1,
    update_stock: 0,
    set_warehouse: "Shop Warehouse - DTD",
    coupon_code: "NG15",
    custom_payment_type: "Credit Card",
    disable_rounded_total: 1,
    remarks: "OS dry-run NG15 max-discount — DELETE",
    debit_to: "Debtors - DTD",
    items: [
      {
        item_code: "LAR11_1",
        qty: 1,
        warehouse: "Shop Warehouse - DTD",
        income_account: "Sales - DTD",
        cost_center: "Main - DTD",
        price_list_rate: 9950,
        rate: 9950,
      },
      {
        item_code: "ORD04_1",
        qty: 1,
        warehouse: "Shop Warehouse - DTD",
        income_account: "Sales - DTD",
        cost_center: "Main - DTD",
        price_list_rate: 5900,
        rate: 5900,
      },
    ],
    posa_coupons: [
      {
        coupon_code: "NG15",
        coupon: "NG15",
        type: "Promotional",
        applied: 1,
      },
    ],
  };

  const created = await erpJson(inst, "POST", "/api/resource/Sales Invoice", payload);
  const name = created?.data?.name;
  if (!name) throw new Error("Draft SI create returned no name");

  const full = await erpJson(
    inst,
    "GET",
    `/api/resource/Sales Invoice/${encodeURIComponent(name)}`,
  );
  const doc = full.data;
  const lines = (doc.items || []).map((it) => ({
    item_code: it.item_code,
    price_list_rate: it.price_list_rate,
    discount_percentage: it.discount_percentage,
    rate: it.rate,
    pricing_rules: it.pricing_rules,
  }));
  console.log("DRY-RUN SI", name);
  console.log(
    JSON.stringify(
      {
        coupon_code: doc.coupon_code,
        ignore_pricing_rule: doc.ignore_pricing_rule,
        additional_discount_percentage: doc.additional_discount_percentage,
        discount_amount: doc.discount_amount,
        grand_total: doc.grand_total,
        docstatus: doc.docstatus,
        items: lines,
      },
      null,
      2,
    ),
  );

  const lar = lines.find((l) => l.item_code === "LAR11_1");
  const ord = lines.find((l) => l.item_code === "ORD04_1");
  const larOk = lar && Number(lar.discount_percentage) === 15 && Number(lar.rate) === 8457.5;
  const ordOk = ord && Number(ord.discount_percentage) === 15 && Number(ord.rate) === 5015;
  const grandOk = Number(doc.grand_total) === 13472.5;
  const headerWiped = Number(doc.discount_amount || 0) === 0;
  console.log(
    `CHECK lar15=${!!larOk} ord15=${!!ordOk} grand35360-subset=${!!grandOk} header0=${headerWiped}`,
  );

  await erpJson(inst, "POST", "/api/method/frappe.client.delete", {
    doctype: "Sales Invoice",
    name,
  });
  console.log(`DRY-RUN deleted ${name}`);

  if (!larOk || !ordOk || !grandOk) {
    throw new Error("Dry-run totals did not match 15% on both lines (8457.5 + 5015 = 13472.5)");
  }
}

async function main() {
  const erp2 = await getInstance(ERP2_MARKER, /erp.?2/i);
  if (!erp2?.baseUrl) throw new Error("ERP02 instance not found");
  console.log(`ERP02: ${erp2.label} ${erp2.baseUrl}`);

  await pushScript(
    erp2,
    "ERP02",
    "tmp/erp02-validate-coupon.py",
    "tmp/erp02-validate-coupon.backup.py",
  );

  if (!skipDryRun) {
    await dryRunErp2(erp2);
  }

  if (!skipErp01) {
    const erp1 = await getInstance(ERP1_MARKER, /erp.?1/i);
    if (!erp1?.baseUrl) throw new Error("ERP01 instance not found");
    console.log(`ERP01: ${erp1.label} ${erp1.baseUrl}`);
    await pushScript(
      erp1,
      "ERP01",
      "tmp/erp01-validate-coupon.py",
      "tmp/erp01-validate-coupon.backup.py",
    );
  }
}

main()
  .catch((err) => {
    console.error(err.message || err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
