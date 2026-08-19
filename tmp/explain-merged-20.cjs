const fs = require("fs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: (process.env.DATABASE_URL || "").replace(
        /(ep-[^.]+)-pooler(\.[^/]+)/,
        "$1$2"
      ),
    },
  },
});

const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (q && text[i + 1] === '"') {
        cur += '"';
        i++;
        continue;
      }
      q = !q;
      continue;
    }
    if (c === "," && !q) {
      row.push(cur);
      cur = "";
      continue;
    }
    if ((c === "\n" || c === "\r") && !q) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

function idx(header) {
  return Object.fromEntries(header.map((h, i) => [h, i]));
}

async function main() {
  const merged = parseCsv(fs.readFileSync("tmp/split-contacts-MERGED.csv", "utf8"));
  const mi = idx(merged[0]);
  const sample = merged.slice(1, 21);

  const dc = parseCsv(fs.readFileSync("tmp/cosmo-email-only-vs-phone-doublecheck.csv", "utf8"));
  const di = idx(dc[0]);
  const dcByEmailId = {};
  for (const r of dc.slice(1)) {
    dcByEmailId[r[di.email_only_contact_id]] = r;
  }

  const emailIds = sample.map((r) => r[mi.email_card_id]);
  const phoneIds = sample.map((r) => r[mi.phone_card_id]);
  const emails = sample.map((r) => r[mi.email_card_email]);
  const phones = sample.map((r) => r[mi.fill_phone]).filter(Boolean);

  const contacts = await prisma.contactMaster.findMany({
    where: { id: { in: [...emailIds, ...phoneIds] } },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      source: true,
      lastPurchaseAt: true,
      createdAt: true,
      emails: { select: { email: true } },
    },
  });
  const byId = Object.fromEntries(contacts.map((c) => [c.id, c]));

  const adapt = await prisma.adaptPurchaseHistory.findMany({
    where: { companyId: COMPANY_ID, contactId: { in: [...emailIds, ...phoneIds] } },
    select: {
      contactId: true,
      salesInvoiceNo: true,
      invoiceDate: true,
      ttlAmount: true,
      locationName: true,
      paymentMethod: true,
    },
    orderBy: { invoiceDate: "desc" },
  });

  const orders = await prisma.order.findMany({
    where: {
      companyId: COMPANY_ID,
      OR: emails.map((e) => ({
        customerEmail: { equals: e, mode: "insensitive" },
      })),
    },
    select: {
      name: true,
      orderNumber: true,
      sourceName: true,
      customerEmail: true,
      customerPhone: true,
      createdAt: true,
    },
    take: 80,
    orderBy: { createdAt: "desc" },
  });

  const out = sample.map((r, n) => {
    const emailId = r[mi.email_card_id];
    const phoneId = r[mi.phone_card_id];
    const d = dcByEmailId[emailId] || [];
    const emailCard = byId[emailId];
    const phoneCard = byId[phoneId];
    const email = r[mi.email_card_email];
    return {
      n: n + 1,
      email_name: r[mi.email_card_name],
      phone_name: r[mi.phone_card_name],
      email,
      phone_before: r[mi.phone_card_phone],
      fill_phone: r[mi.fill_phone],
      email_card: emailCard
        ? {
            source: emailCard.source,
            createdAt: emailCard.createdAt,
            lastPurchaseAt: emailCard.lastPurchaseAt,
            emailNow: emailCard.email,
            phoneNow: emailCard.phoneNumber,
          }
        : null,
      phone_card: phoneCard
        ? {
            source: phoneCard.source,
            createdAt: phoneCard.createdAt,
            lastPurchaseAt: phoneCard.lastPurchaseAt,
            emailNow: phoneCard.email,
            extraEmails: (phoneCard.emails || []).map((e) => e.email),
            phoneNow: phoneCard.phoneNumber,
          }
        : null,
      dc: d.length
        ? {
            email_source: d[di.email_only_source],
            email_last: d[di.email_only_last_purchase],
            email_orders: d[di.email_only_cosmo_order_count],
            email_adapt: d[di.email_only_adapt_count],
            phone_source: d[di.phone_contact_source],
            phone_last: d[di.phone_contact_last_purchase],
            phone_orders: d[di.phone_contact_cosmo_order_count],
            phone_adapt: d[di.phone_contact_adapt_count],
            phone_email_before: d[di.phone_contact_email],
            erp_name: d[di.erp_customer_name],
            erp_mobile: d[di.erp_mobile],
            erp_slot: d[di.erp_slot],
          }
        : null,
      adapt: adapt
        .filter((a) => a.contactId === phoneId || a.contactId === emailId)
        .map((a) => ({
          inv: a.salesInvoiceNo,
          date: a.invoiceDate,
          loc: a.locationName,
          amt: String(a.ttlAmount),
          pay: a.paymentMethod,
        })),
      orders: orders
        .filter((o) => (o.customerEmail || "").toLowerCase() === email.toLowerCase())
        .map((o) => ({
          no: o.orderNumber || o.name,
          src: o.sourceName,
          phone: o.customerPhone,
          at: o.createdAt,
        })),
    };
  });

  console.log(JSON.stringify(out, null, 2));
}

main()
  .finally(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
