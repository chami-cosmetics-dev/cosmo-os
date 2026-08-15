/**
 * Diagnose why existing Cosmo phones that match ERP customers still miss sale history.
 * Read-only.
 *
 *   node scripts/with-env.mjs cosmo-prod node tmp/diagnose-erp-existing-phone-history.cjs
 */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";
const SKIP_SI = new Set(["600-001483", "600-002133"]);
const SKIP_PO = new Set(["60017254", "60017589"]);

const raw = process.env.DATABASE_URL || "";
const prisma = new PrismaClient({
  datasources: { db: { url: raw.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || raw } },
});

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

function samePhone(a, b) {
  const da = phoneDigitsOnly(a);
  const db = phoneDigitsOnly(b);
  if (!da || !db) return false;
  const variantsA = new Set(buildPhoneLookupVariants(a));
  if (variantsA.has(String(b || "").trim()) || variantsA.has(db)) return true;
  const local = (d) => {
    if (d.length === 11 && d.startsWith("94")) return d.slice(2);
    if (d.length === 10 && d.startsWith("0")) return d.slice(1);
    return d;
  };
  return local(da) === local(db);
}

function resolveSlots(instances) {
  const erp1 = instances.find((i) => /erp[_\s-]*1\b/i.test(i.label ?? ""));
  const erp2 = instances.find((i) => /erp[_\s-]*2\b/i.test(i.label ?? ""));
  return [
    ...(erp1 ? [{ ...erp1, slot: "erp1" }] : []),
    ...(erp2 ? [{ ...erp2, slot: "erp2" }] : []),
  ];
}

async function fetchPaged(inst, doctype, fields, extraFilters = []) {
  const base = inst.baseUrl.replace(/\/$/, "");
  const auth = `token ${inst.apiKey}:${inst.apiSecret}`;
  const all = [];
  for (let page = 0; page < 400; page++) {
    const filters = encodeURIComponent(JSON.stringify(extraFilters));
    const f = JSON.stringify(fields);
    const url =
      `${base}/api/resource/${encodeURIComponent(doctype)}?fields=${encodeURIComponent(f)}` +
      `&limit_page_length=500&limit_start=${page * 500}&order_by=name asc` +
      (extraFilters.length ? `&filters=${filters}` : "");
    const res = await fetch(url, { headers: { Authorization: auth, Accept: "application/json" } });
    if (!res.ok) throw new Error(`${inst.slot} ${doctype} HTTP ${res.status}`);
    const json = await res.json();
    const batch = json.data ?? [];
    all.push(...batch);
    if (batch.length < 500) break;
  }
  return all;
}

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
    select: {
      id: true,
      label: true,
      baseUrl: true,
      apiKey: true,
      apiSecret: true,
    },
  });

  const matched = [];
  const sisByCustomer = new Map();
  for (const inst of resolveSlots(instances)) {
    const customers = await fetchPaged(inst, "Customer", ["name", "customer_name", "mobile_no"]);
    const location = await prisma.companyLocation.findFirst({
      where: { erpnextInstanceId: inst.id, erpnextCompany: { not: null } },
      select: { erpnextCompany: true },
    });
    const erpCompany =
      location?.erpnextCompany ?? (inst.slot === "erp1" ? "Cosmetics.lk" : "AJS Trading Lanka (Pvt) Ltd");
    const sis = await fetchPaged(inst, "Sales Invoice", ["name", "customer", "posting_date", "po_no", "grand_total"], [
      ["docstatus", "=", 1],
      ["is_return", "!=", 1],
      ["company", "=", erpCompany],
    ]);
    for (const si of sis) {
      const key = `${inst.slot}|${si.customer}`;
      const list = sisByCustomer.get(key) ?? [];
      list.push(si);
      sisByCustomer.set(key, list);
    }
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

  const stats = {
    matchedErpCustomers: matched.length,
    uniqueContacts: new Set(matched.map((m) => m.contactId)).size,
    ordersByErpCustomer: 0,
    ordersBlankPhone: 0,
    ordersPhoneMismatch: 0,
    ordersPhoneMatch: 0,
    contactsLastPurchaseStale: 0,
    contactsLastPurchaseNullWithOrders: 0,
    erpSisForMatched: 0,
    erpSisMissingCosmoOrder: 0,
    erpSisPresentAsErpRow: 0,
    erpSisPresentAsWebLink: 0,
  };

  const mismatchRows = [];
  const staleLastPurchaseRows = [];
  const missingSiRows = [];

  const BATCH = 150;
  const allSiNames = [];
  for (const m of matched) {
    const sis = sisByCustomer.get(`${m.slot}|${m.erpCustomerId}`) ?? [];
    for (const si of sis) allSiNames.push(si.name);
  }
  const uniqueSiNames = [...new Set(allSiNames)];
  const existingSi = new Set();
  const webLinkedSi = new Set();
  const erpRowSi = new Set();
  for (let i = 0; i < uniqueSiNames.length; i += 500) {
    const batch = uniqueSiNames.slice(i, i + 500);
    const erpIds = batch.map((n) => `erp-${n}`);
    const rows = await prisma.order.findMany({
      where: {
        companyId: COMPANY_ID,
        OR: [{ shopifyOrderId: { in: erpIds } }, { erpnextInvoiceId: { in: batch } }],
      },
      select: { shopifyOrderId: true, erpnextInvoiceId: true },
    });
    for (const row of rows) {
      if (row.erpnextInvoiceId) {
        existingSi.add(row.erpnextInvoiceId);
        if (row.shopifyOrderId?.startsWith("erp-")) erpRowSi.add(row.erpnextInvoiceId);
        else webLinkedSi.add(row.erpnextInvoiceId);
      }
      if (row.shopifyOrderId?.startsWith("erp-")) {
        const name = row.shopifyOrderId.slice(4);
        existingSi.add(name);
        erpRowSi.add(name);
      }
    }
  }

  const contactLatestOrder = new Map();

  for (let i = 0; i < matched.length; i += BATCH) {
    const chunk = matched.slice(i, i + BATCH);
    const erpIds = chunk.map((m) => m.erpCustomerId);
    const phoneSet = new Set();
    for (const m of chunk) {
      for (const v of buildPhoneLookupVariants(m.contactPhone || m.phone)) phoneSet.add(v);
    }
    const orders = await prisma.order.findMany({
      where: {
        companyId: COMPANY_ID,
        OR: [
          { erpnextCustomerId: { in: erpIds } },
          { customerPhone: { in: [...phoneSet] } },
        ],
      },
      select: {
        id: true,
        name: true,
        erpnextInvoiceId: true,
        erpnextCustomerId: true,
        customerPhone: true,
        createdAt: true,
        shopifyOrderId: true,
      },
    });
    const byErp = new Map();
    for (const o of orders) {
      if (!o.erpnextCustomerId) continue;
      const list = byErp.get(o.erpnextCustomerId) ?? [];
      list.push(o);
      byErp.set(o.erpnextCustomerId, list);
    }

    for (const m of chunk) {
      const list = byErp.get(m.erpCustomerId) ?? [];
      stats.ordersByErpCustomer += list.length;
      const variants = new Set(buildPhoneLookupVariants(m.contactPhone || m.phone));
      for (const o of list) {
        const existing = String(o.customerPhone ?? "").trim();
        if (!existing) {
          stats.ordersBlankPhone += 1;
          continue;
        }
        if (samePhone(existing, m.contactPhone || m.phone) || variants.has(existing)) {
          stats.ordersPhoneMatch += 1;
        } else {
          stats.ordersPhoneMismatch += 1;
          if (mismatchRows.length < 200) {
            mismatchRows.push({
              slot: m.slot,
              contact_id: m.contactId,
              contact_phone: m.contactPhone,
              erp_customer_id: m.erpCustomerId,
              order_id: o.id,
              order_name: o.name ?? "",
              order_phone: existing,
              erp_invoice: o.erpnextInvoiceId ?? "",
            });
          }
        }
      }

      const sis = sisByCustomer.get(`${m.slot}|${m.erpCustomerId}`) ?? [];
      stats.erpSisForMatched += sis.length;
      for (const si of sis) {
        if (SKIP_SI.has(si.name) || SKIP_PO.has(String(si.po_no ?? ""))) continue;
        if (existingSi.has(si.name)) {
          if (erpRowSi.has(si.name)) stats.erpSisPresentAsErpRow += 1;
          else stats.erpSisPresentAsWebLink += 1;
        } else {
          stats.erpSisMissingCosmoOrder += 1;
          if (missingSiRows.length < 300) {
            missingSiRows.push({
              slot: m.slot,
              si: si.name,
              posting_date: si.posting_date ?? "",
              erp_customer_id: m.erpCustomerId,
              contact_id: m.contactId,
              contact_phone: m.contactPhone,
              grand_total: si.grand_total ?? "",
            });
          }
        }
      }
    }

    for (const o of orders) {
      const phone = String(o.customerPhone ?? "").trim();
      if (!phone) continue;
      const ids = new Set();
      for (const v of buildPhoneLookupVariants(phone)) {
        const set = phoneToIds.get(v);
        if (!set) continue;
        for (const id of set) ids.add(id);
      }
      if (ids.size !== 1) continue;
      const contactId = [...ids][0];
      const prev = contactLatestOrder.get(contactId);
      if (!prev || o.createdAt > prev) contactLatestOrder.set(contactId, o.createdAt);
    }
  }

  const uniqueMatchedContacts = [...new Set(matched.map((m) => m.contactId))];
  for (const contactId of uniqueMatchedContacts) {
    const contact = byId.get(contactId);
    const latest = contactLatestOrder.get(contactId);
    if (!latest) continue;
    if (!contact.lastPurchaseAt) {
      stats.contactsLastPurchaseNullWithOrders += 1;
      staleLastPurchaseRows.push({
        contact_id: contactId,
        contact_name: contact.name,
        contact_phone: contact.phoneNumber,
        last_purchase_at: "",
        latest_order_at: latest.toISOString(),
      });
    } else if (contact.lastPurchaseAt < latest) {
      stats.contactsLastPurchaseStale += 1;
      if (staleLastPurchaseRows.length < 300) {
        staleLastPurchaseRows.push({
          contact_id: contactId,
          contact_name: contact.name,
          contact_phone: contact.phoneNumber,
          last_purchase_at: contact.lastPurchaseAt.toISOString(),
          latest_order_at: latest.toISOString(),
        });
      }
    }
  }

  writeCsv(
    path.resolve("tmp/erp-phone-history-mismatches.csv"),
    ["slot", "contact_id", "contact_phone", "erp_customer_id", "order_id", "order_name", "order_phone", "erp_invoice"],
    mismatchRows
  );
  writeCsv(
    path.resolve("tmp/erp-phone-history-stale-last-purchase.csv"),
    ["contact_id", "contact_name", "contact_phone", "last_purchase_at", "latest_order_at"],
    staleLastPurchaseRows
  );
  writeCsv(
    path.resolve("tmp/erp-phone-history-missing-sis.csv"),
    ["slot", "si", "posting_date", "erp_customer_id", "contact_id", "contact_phone", "grand_total"],
    missingSiRows
  );

  console.log(JSON.stringify(stats, null, 2));
}

main()
  .finally(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
