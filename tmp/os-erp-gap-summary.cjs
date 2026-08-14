/**
 * Gap report: Cosmo OS vs ERP1/ERP2 — contacts + submitted Sales Invoices.
 */
const { PrismaClient } = require("@prisma/client");

const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";
const raw = process.env.DATABASE_URL || "";
const url = raw.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || raw;
const prisma = new PrismaClient({ datasources: { db: { url } } });

function digits(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("94") && d.length >= 11) d = "0" + d.slice(2);
  if (d.length === 9) d = "0" + d;
  return d;
}

function resolveSlots(instances) {
  const erp1 = instances.find((i) => /erp[_\s-]*1\b/i.test(i.label ?? ""));
  const erp2 = instances.find((i) => /erp[_\s-]*2\b/i.test(i.label ?? ""));
  return [
    ...(erp1 ? [{ ...erp1, slot: "erp1" }] : []),
    ...(erp2 ? [{ ...erp2, slot: "erp2" }] : []),
  ];
}

async function erpGetAll(inst, doctype, fields, extraFilters = []) {
  const base = inst.baseUrl.replace(/\/$/, "");
  const auth = `token ${inst.apiKey}:${inst.apiSecret}`;
  const all = [];
  for (let page = 0; page < 200; page++) {
    const filters = extraFilters.length
      ? `&filters=${encodeURIComponent(JSON.stringify(extraFilters))}`
      : "";
    const url =
      `${base}/api/resource/${encodeURIComponent(doctype)}?fields=${encodeURIComponent(JSON.stringify(fields))}` +
      `${filters}&limit_page_length=500&limit_start=${page * 500}`;
    const res = await fetch(url, { headers: { Authorization: auth, Accept: "application/json" } });
    if (!res.ok) throw new Error(`${inst.slot} ${doctype} HTTP ${res.status}`);
    const json = await res.json();
    const batch = json.data ?? [];
    all.push(...batch);
    if (batch.length < 500) break;
  }
  return all;
}

async function main() {
  const instances = await prisma.erpnextInstance.findMany({
    where: { companyId: COMPANY_ID },
    orderBy: { createdAt: "asc" },
    select: { id: true, label: true, baseUrl: true, apiKey: true, apiSecret: true },
  });
  const slots = resolveSlots(instances);

  const cosmoContacts = await prisma.contactMaster.findMany({
    where: { companyId: COMPANY_ID },
    select: { phoneNumber: true, source: true },
  });
  const phoneSet = new Set();
  for (const c of cosmoContacts) {
    const d = digits(c.phoneNumber);
    if (d.length >= 9) phoneSet.add(d);
  }

  const report = {
    cosmo: {
      contacts: cosmoContacts.length,
      erp1Tagged: cosmoContacts.filter((c) => c.source === "erp1").length,
      erp2Tagged: cosmoContacts.filter((c) => c.source === "erp2").length,
    },
    si: [],
    contacts: [],
  };

  for (const inst of slots) {
    const location = await prisma.companyLocation.findFirst({
      where: { erpnextInstanceId: inst.id, erpnextCompany: { not: null } },
      select: { erpnextCompany: true },
    });
    const erpCompany = location?.erpnextCompany ?? null;

    const siFilters = [
      ["docstatus", "=", 1],
      ["is_return", "!=", 1],
    ];
    if (erpCompany) siFilters.unshift(["company", "=", erpCompany]);

    const [sis, customers] = await Promise.all([
      erpGetAll(inst, "Sales Invoice", ["name"], siFilters),
      erpGetAll(inst, "Customer", ["name", "mobile_no"]),
    ]);
    const names = sis.map((s) => s.name);

    let native = 0;
    let linked = 0;
    let missing = 0;
    for (let i = 0; i < names.length; i += 400) {
      const chunk = names.slice(i, i + 400);
      const [byShopify, byInvoice] = await Promise.all([
        prisma.order.findMany({
          where: { shopifyOrderId: { in: chunk.map((n) => `erp-${n}`) } },
          select: { shopifyOrderId: true },
        }),
        prisma.order.findMany({
          where: { erpnextInvoiceId: { in: chunk } },
          select: { erpnextInvoiceId: true },
        }),
      ]);
      const haveNative = new Set(byShopify.map((o) => o.shopifyOrderId.replace(/^erp-/, "")));
      const haveLinked = new Set(byInvoice.map((o) => o.erpnextInvoiceId));
      for (const n of chunk) {
        if (haveNative.has(n)) native += 1;
        else if (haveLinked.has(n)) linked += 1;
        else missing += 1;
      }
    }

    let customersWithPhone = 0;
    let phoneInCosmo = 0;
    let phoneNotInCosmo = 0;
    let noPhone = 0;
    for (const c of customers) {
      const d = digits(c.mobile_no);
      if (d.length < 9) {
        noPhone += 1;
        continue;
      }
      customersWithPhone += 1;
      if (phoneSet.has(d)) phoneInCosmo += 1;
      else phoneNotInCosmo += 1;
    }

    report.si.push({
      slot: inst.slot,
      erpCompany,
      erpSubmittedSi: names.length,
      inCosmoAsErpNative: native,
      inCosmoLinkedToExistingOrder: linked,
      trulyMissingSi: missing,
    });
    report.contacts.push({
      slot: inst.slot,
      erpCustomers: customers.length,
      erpCustomersWithPhone: customersWithPhone,
      erpNoPhone: noPhone,
      phoneAlreadyInCosmo: phoneInCosmo,
      erpPhoneNotInCosmo: phoneNotInCosmo,
      cosmoTaggedThisSlot: report.cosmo[inst.slot === "erp1" ? "erp1Tagged" : "erp2Tagged"],
    });
  }

  console.log(JSON.stringify(report, null, 2));
}

main()
  .finally(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
