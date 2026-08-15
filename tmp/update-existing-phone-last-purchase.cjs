/**
 * For ERP customers whose phone already exists on exactly one Cosmo contact:
 * bump ContactMaster.lastPurchaseAt from latest Cosmo order under that phone.
 * Does not create contacts, rewrite order phones, or replay SIs.
 *
 *   node scripts/with-env.mjs cosmo-prod node tmp/update-existing-phone-last-purchase.cjs --dry-run
 *   node scripts/with-env.mjs cosmo-prod node tmp/update-existing-phone-last-purchase.cjs --apply
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

function dayKey(d) {
  return d ? d.toISOString().slice(0, 10) : "";
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

  const matchedContactIds = new Set();
  for (const inst of resolveSlots(instances)) {
    const customers = await fetchErpCustomers(inst);
    for (const cust of customers) {
      const phone = String(cust.mobile_no ?? "").trim();
      const erpId = String(cust.name ?? "").trim();
      if (!phone || !erpId) continue;
      if (SKIP_PO.has(erpId) || SKIP_SI.has(erpId)) continue;
      const contact = uniqueContactForPhone(phone);
      if (!contact) continue;
      matchedContactIds.add(contact.id);
    }
  }

  const updates = [];
  const BATCH = 200;
  const matchedList = [...matchedContactIds];

  for (let i = 0; i < matchedList.length; i += BATCH) {
    const chunk = matchedList.slice(i, i + BATCH).map((id) => byId.get(id));
    const phoneSet = new Set();
    const phoneToContact = new Map();
    for (const c of chunk) {
      const phones = [c.phoneNumber, ...c.phones.map((p) => p.phoneNumber)].filter(Boolean);
      for (const phone of phones) {
        for (const v of buildPhoneLookupVariants(phone)) {
          phoneSet.add(v);
          const ids = phoneToContact.get(v) ?? new Set();
          ids.add(c.id);
          phoneToContact.set(v, ids);
        }
      }
    }
    if (phoneSet.size === 0) continue;

    const orders = await prisma.order.findMany({
      where: {
        companyId: COMPANY_ID,
        customerPhone: { in: [...phoneSet] },
        cancelledAt: null,
      },
      select: { customerPhone: true, createdAt: true },
    });

    const latestByContact = new Map();
    for (const o of orders) {
      const phone = String(o.customerPhone ?? "").trim();
      const ids = phoneToContact.get(phone);
      if (!ids || ids.size !== 1) continue;
      const contactId = [...ids][0];
      const prev = latestByContact.get(contactId);
      if (!prev || o.createdAt > prev) latestByContact.set(contactId, o.createdAt);
    }

    for (const c of chunk) {
      const latest = latestByContact.get(c.id);
      if (!latest) continue;
      if (c.lastPurchaseAt && c.lastPurchaseAt >= latest) continue;
      updates.push({
        contact_id: c.id,
        contact_name: c.name,
        contact_phone: c.phoneNumber,
        old_last_purchase: c.lastPurchaseAt ? c.lastPurchaseAt.toISOString() : "",
        new_last_purchase: latest.toISOString(),
        same_calendar_day:
          c.lastPurchaseAt && dayKey(c.lastPurchaseAt) === dayKey(latest) ? "yes" : "no",
      });
    }
  }

  writeCsv(
    path.resolve("tmp/erp-existing-phone-last-purchase-updates.csv"),
    [
      "contact_id",
      "contact_name",
      "contact_phone",
      "old_last_purchase",
      "new_last_purchase",
      "same_calendar_day",
    ],
    updates
  );

  let patched = 0;
  if (apply) {
    for (const row of updates) {
      await prisma.contactMaster.update({
        where: { id: row.contact_id },
        data: { lastPurchaseAt: new Date(row.new_last_purchase) },
      });
      patched += 1;
    }
  }

  const calendarDayMoves = updates.filter((r) => r.same_calendar_day === "no").length;
  const sameDayOnly = updates.filter((r) => r.same_calendar_day === "yes").length;
  const wasNull = updates.filter((r) => !r.old_last_purchase).length;

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        matchedUniqueContacts: matchedContactIds.size,
        wouldUpdate: updates.length,
        calendarDayMoves,
        sameDayTimestampOnly: sameDayOnly,
        wasNull,
        patched,
        csv: path.resolve("tmp/erp-existing-phone-last-purchase-updates.csv"),
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
