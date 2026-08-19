/**
 * For ERP customers whose phone already exists on exactly one Cosmo contact:
 * fill blank Order.customerPhone so Insight sale history shows.
 * Does not create contacts, merge email, or replay duplicate SIs.
 *
 *   node scripts/with-env.mjs cosmo-prod node tmp/link-erp-sales-to-existing-phones.cjs --dry-run
 *   node scripts/with-env.mjs cosmo-prod node tmp/link-erp-sales-to-existing-phones.cjs --apply
 */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";
const apply = process.argv.includes("--apply");
const SKIP_SI = new Set(["600-001483", "600-002133"]);
const SKIP_PO = new Set(["60017254", "60017589"]);

const raw = process.env.DATABASE_URL || "";
const prisma = new PrismaClient({
  datasources: { db: { url: raw.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || raw } },
});

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeCsv(file, header, rows) {
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(header.map((h) => csvEscape(row[h] ?? "")).join(","));
  }
  fs.writeFileSync(file, lines.join("\n"), "utf8");
}

function phoneDigitsOnly(value) {
  let d = String(value || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  return d;
}

function buildPhoneLookupVariants(rawPhone) {
  const t = String(rawPhone || "").trim();
  let d = phoneDigitsOnly(rawPhone);
  const out = new Set();
  if (t) out.add(t);
  if (d) {
    out.add(d);
    if (d.length === 9) {
      out.add(`0${d}`);
      out.add(`94${d}`);
    }
    if (d.length === 10 && d.startsWith("0")) {
      out.add(d.slice(1));
      out.add(`94${d.slice(1)}`);
      out.add(`940${d.slice(1)}`);
    }
    if (d.length === 11 && d.startsWith("94")) {
      out.add(`0${d.slice(2)}`);
      out.add(d.slice(2));
    }
  }
  for (const v of [...out]) {
    const digits = phoneDigitsOnly(v);
    if (digits) out.add(`+${digits}`);
  }
  return [...out].filter(Boolean);
}

function resolveSlots(instances) {
  const erp1 = instances.find((i) => /erp[_\s-]*1\b/i.test(i.label ?? ""));
  const erp2 = instances.find((i) => /erp[_\s-]*2\b/i.test(i.label ?? ""));
  return [
    ...(erp1 ? [{ ...erp1, slot: "erp1" }] : []),
    ...(erp2 ? [{ ...erp2, slot: "erp2" }] : []),
  ];
}

async function fetchErpCustomers(inst) {
  const base = inst.baseUrl.replace(/\/$/, "");
  const auth = `token ${inst.apiKey}:${inst.apiSecret}`;
  const all = [];
  for (let page = 0; page < 200; page++) {
    const fields = JSON.stringify(["name", "customer_name", "mobile_no"]);
    const res = await fetch(
      `${base}/api/resource/Customer?fields=${encodeURIComponent(fields)}&limit_page_length=500&limit_start=${page * 500}&order_by=name asc`,
      { headers: { Authorization: auth, Accept: "application/json" } }
    );
    if (!res.ok) throw new Error(`${inst.slot} Customer HTTP ${res.status}`);
    const json = await res.json();
    const batch = json.data ?? [];
    all.push(...batch);
    if (batch.length < 500) break;
  }
  return all;
}

async function main() {
  fs.mkdirSync("tmp", { recursive: true });

  const contacts = await prisma.contactMaster.findMany({
    where: { companyId: COMPANY_ID },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      lastPurchaseAt: true,
      phones: { select: { phoneNumber: true } },
    },
  });

  const phoneToIds = new Map();
  const addPhone = (phone, id) => {
    if (!phone) return;
    for (const v of buildPhoneLookupVariants(phone)) {
      const set = phoneToIds.get(v) ?? new Set();
      set.add(id);
      phoneToIds.set(v, set);
    }
  };
  const byId = new Map(contacts.map((c) => [c.id, c]));
  for (const c of contacts) {
    addPhone(c.phoneNumber, c.id);
    for (const p of c.phones) addPhone(p.phoneNumber, c.id);
  }

  function uniqueContactForPhone(phone) {
    const ids = new Set();
    for (const v of buildPhoneLookupVariants(phone)) {
      const set = phoneToIds.get(v);
      if (!set) continue;
      for (const id of set) ids.add(id);
    }
    if (ids.size !== 1) return null;
    return byId.get([...ids][0]) ?? null;
  }

  const instances = await prisma.erpnextInstance.findMany({
    where: { companyId: COMPANY_ID },
    orderBy: { createdAt: "asc" },
    select: { label: true, baseUrl: true, apiKey: true, apiSecret: true },
  });

  const matched = [];
  for (const inst of resolveSlots(instances)) {
    const customers = await fetchErpCustomers(inst);
    for (const cust of customers) {
      const phone = String(cust.mobile_no ?? "").trim();
      const erpId = String(cust.name ?? "").trim();
      if (!phone || !erpId) continue;
      if (SKIP_PO.has(erpId) || SKIP_SI.has(erpId)) continue;
      const contact = uniqueContactForPhone(phone);
      if (!contact) continue;
      matched.push({
        slot: inst.slot,
        erpCustomerId: erpId,
        erpName: String(cust.customer_name ?? "").trim(),
        phone,
        contactId: contact.id,
        contactName: contact.name,
        contactPhone: contact.phoneNumber,
        lastPurchaseAt: contact.lastPurchaseAt,
      });
    }
  }

  const fillRows = [];
  const lastPurchaseUpdates = new Map();
  const BATCH = 200;

  for (let i = 0; i < matched.length; i += BATCH) {
    const chunk = matched.slice(i, i + BATCH);
    const erpIds = chunk.map((m) => m.erpCustomerId);
    const orders = await prisma.order.findMany({
      where: {
        companyId: COMPANY_ID,
        erpnextCustomerId: { in: erpIds },
      },
      select: {
        id: true,
        name: true,
        erpnextInvoiceId: true,
        erpnextCustomerId: true,
        customerPhone: true,
        createdAt: true,
      },
    });
    const byErp = new Map();
    for (const o of orders) {
      const key = o.erpnextCustomerId;
      const list = byErp.get(key) ?? [];
      list.push(o);
      byErp.set(key, list);
    }
    for (const m of chunk) {
      const list = byErp.get(m.erpCustomerId) ?? [];
      for (const o of list) {
        if (SKIP_SI.has(o.erpnextInvoiceId || "") || SKIP_SI.has(o.name || "")) continue;
        if (SKIP_PO.has(o.name || "")) continue;
        const existing = String(o.customerPhone ?? "").trim();
        if (existing) continue;
        fillRows.push({
          slot: m.slot,
          order_id: o.id,
          order_name: o.name ?? "",
          erp_invoice: o.erpnextInvoiceId ?? "",
          erp_customer_id: m.erpCustomerId,
          contact_id: m.contactId,
          contact_name: m.contactName,
          fill_phone: m.contactPhone || m.phone,
          order_date: o.createdAt.toISOString().slice(0, 10),
        });
        const prev = lastPurchaseUpdates.get(m.contactId);
        if (!prev || o.createdAt > prev.at) {
          lastPurchaseUpdates.set(m.contactId, { at: o.createdAt, contact: m });
        }
      }
    }
  }

  writeCsv(
    path.resolve("tmp/erp-existing-phone-sale-history-fills.csv"),
    [
      "slot",
      "order_id",
      "order_name",
      "erp_invoice",
      "erp_customer_id",
      "contact_id",
      "contact_name",
      "fill_phone",
      "order_date",
    ],
    fillRows
  );

  let ordersPatched = 0;
  let lastPurchasePatched = 0;
  if (apply) {
    for (const row of fillRows) {
      await prisma.order.update({
        where: { id: row.order_id },
        data: { customerPhone: row.fill_phone },
      });
      ordersPatched += 1;
    }
    for (const [contactId, { at }] of lastPurchaseUpdates.entries()) {
      const contact = byId.get(contactId);
      if (contact?.lastPurchaseAt && contact.lastPurchaseAt >= at) continue;
      await prisma.contactMaster.update({
        where: { id: contactId },
        data: { lastPurchaseAt: at },
      });
      lastPurchasePatched += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        erpCustomersMatchedToOneCosmoPhone: matched.length,
        ordersWithBlankPhoneToFill: fillRows.length,
        contactsLastPurchaseWouldUpdate: lastPurchaseUpdates.size,
        ordersPatched,
        lastPurchasePatched,
        skippedDuplicateSis: [...SKIP_SI],
        csv: path.resolve("tmp/erp-existing-phone-sale-history-fills.csv"),
      },
      null,
      2
    )
  );
}

main()
  .finally(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
