/**
 * Repair ContactMaster.lastPurchaseAt in bulk.
 *
 * Reads every purchase document once, joins in memory, writes only the rows that are
 * actually wrong. The per-contact version (recalc-contact-last-purchase.cjs) issues two
 * queries per contact, which the Neon pooler drops long before 84k contacts are done; keep
 * that one for single-customer spot checks (--phone) and use this for the whole table.
 *
 * The rule, matching lib/orders-last-purchase.ts:
 *   - a purchase is a Cosmo order that was not cancelled/voided/returned, or an Adapt invoice
 *   - orders attach to a contact by PHONE whenever the contact has one
 *   - company/staff emails never attach anything; a personal email is used only when the
 *     contact has no phone at all
 *   - lastPurchaseAt = the newest such document, or null when there is none
 *
 * recentMerchant is never touched.
 *
 * Usage:
 *   node scripts/with-env.mjs cosmo-prod node scripts/repair-contact-last-purchase.cjs --company-id <id>
 *   node scripts/with-env.mjs cosmo-prod node scripts/repair-contact-last-purchase.cjs --company-id <id> --apply
 */

const { PrismaClient } = require("@prisma/client");

const PAGE = 5000;
const WRITE_CHUNK = 1000;

// Mirror of lib/adapt-import/shared-emails.ts — keep the two in step.
const SHARED_MERCHANT_EMAILS = new Set([
  "sales@cosmetics.lk",
  "info@lmj.lk",
  "info@cosmetics.lk",
  "shammi@cosmetics.lk",
  "dharshika@cosmetics.lk",
  "ruwini@cosmetics.lk",
  "nirukshi.cosmetics@outlook.com",
  "sachini.cosmetics@outlook.com",
  "ishadi.cosmetics@outlook.com",
  "venushka.cosmetics@outlook.com",
  "sandali.cosmetics@outlook.com",
  "dulshi25.cosmetics@gmail.com",
  "maheshisoysacosmetics@outlook.com",
  "nilmini.cosmetics@gmail.com",
  "hpg.inoka@gmail.com",
]);

const SHARED_MERCHANT_EMAIL_SUFFIXES = [
  "@cosmetics.lk",
  ".cosmetics@outlook.com",
  ".cosmetics@gmail.com",
];

function isSharedMerchantEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!email) return false;
  if (SHARED_MERCHANT_EMAILS.has(email)) return true;
  return SHARED_MERCHANT_EMAIL_SUFFIXES.some((suffix) => email.endsWith(suffix));
}

/** Join key for a phone: the subscriber digits, however the number was written down. */
function phoneKey(raw) {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("94")) d = d.slice(2);
  if (d.length === 10 && d.startsWith("0")) d = d.slice(1);
  return d.length >= 9 ? d.slice(-9) : d;
}

/** Mirror of isOrderReversed in lib/customer-insight/lifetime-total.ts. */
function isOrderReversed(order) {
  if (order.cancelledAt) return true;
  if (String(order.financialStatus ?? "").trim().toLowerCase() === "voided") return true;
  const stage = String(order.fulfillmentStage ?? "").trim().toLowerCase();
  return stage === "returned" || stage === "returned_to_store";
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

function keepLatest(map, key, date) {
  if (!key || !date) return;
  const current = map.get(key);
  if (!current || date > current) map.set(key, date);
}

function sameInstant(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.getTime() === b.getTime();
}

async function pageAll(label, fetchPage) {
  const rows = [];
  let cursor = null;
  for (;;) {
    const page = await fetchPage(cursor);
    if (page.length === 0) break;
    rows.push(...page);
    if (page.length < PAGE) break;
    cursor = page[page.length - 1].id;
    console.error(`[repair-last-purchase] ${label}: ${rows.length} loaded`);
  }
  return rows;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const companyId = typeof args["company-id"] === "string" ? args["company-id"] : null;
  const apply = Boolean(args.apply);

  if (!companyId) {
    console.error(
      "Usage: node scripts/repair-contact-last-purchase.cjs --company-id <cuid> [--apply]"
    );
    process.exit(1);
  }

  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL || "" } },
  });

  try {
    const orders = await pageAll("orders", (cursor) =>
      prisma.order.findMany({
        where: { companyId },
        select: {
          id: true,
          customerPhone: true,
          erpnextCustomerId: true,
          customerEmail: true,
          createdAt: true,
          cancelledAt: true,
          financialStatus: true,
          fulfillmentStage: true,
        },
        orderBy: { id: "asc" },
        take: PAGE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      })
    );

    const orderMaxByPhone = new Map();
    const orderMaxByEmail = new Map();
    for (const order of orders) {
      if (isOrderReversed(order)) continue;
      keepLatest(orderMaxByPhone, phoneKey(order.customerPhone), order.createdAt);
      keepLatest(orderMaxByPhone, phoneKey(order.erpnextCustomerId), order.createdAt);
      const email = order.customerEmail?.trim().toLowerCase() || null;
      if (email && !isSharedMerchantEmail(email)) {
        keepLatest(orderMaxByEmail, email, order.createdAt);
      }
    }
    console.error(
      `[repair-last-purchase] ${orders.length} orders read, ${orderMaxByPhone.size} phone keys`
    );

    const adaptGroups = await prisma.adaptPurchaseHistory.groupBy({
      by: ["contactId"],
      where: { companyId },
      _max: { invoiceDate: true },
    });
    const adaptMaxByContact = new Map(
      adaptGroups.map((row) => [row.contactId, row._max.invoiceDate])
    );
    console.error(
      `[repair-last-purchase] ${adaptMaxByContact.size} contacts have Adapt invoices`
    );

    const aliasPhones = await pageAll("alias phones", (cursor) =>
      prisma.contactPhone.findMany({
        where: { contact: { is: { companyId } } },
        select: { id: true, contactId: true, phoneNumber: true },
        orderBy: { id: "asc" },
        take: PAGE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      })
    );
    const aliasByContact = new Map();
    for (const alias of aliasPhones) {
      const list = aliasByContact.get(alias.contactId) ?? [];
      list.push(alias.phoneNumber);
      aliasByContact.set(alias.contactId, list);
    }

    const contacts = await pageAll("contacts", (cursor) =>
      prisma.contactMaster.findMany({
        where: { companyId },
        select: {
          id: true,
          name: true,
          phoneNumber: true,
          email: true,
          lastPurchaseAt: true,
        },
        orderBy: { id: "asc" },
        take: PAGE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      })
    );
    console.error(`[repair-last-purchase] ${contacts.length} contacts read`);

    const byTarget = new Map();
    let unchanged = 0;
    let movedBack = 0;
    let movedForward = 0;
    let cleared = 0;
    let filled = 0;
    const samples = [];

    for (const contact of contacts) {
      const phones = [contact.phoneNumber, ...(aliasByContact.get(contact.id) ?? [])];
      const phoneKeys = [...new Set(phones.map(phoneKey).filter(Boolean))];

      let cosmoAt = null;
      if (phoneKeys.length > 0) {
        for (const key of phoneKeys) {
          const at = orderMaxByPhone.get(key);
          if (at && (!cosmoAt || at > cosmoAt)) cosmoAt = at;
        }
      } else {
        const email = contact.email?.trim().toLowerCase() || null;
        if (email && !isSharedMerchantEmail(email)) {
          cosmoAt = orderMaxByEmail.get(email) ?? null;
        }
      }

      const adaptAt = adaptMaxByContact.get(contact.id) ?? null;
      let nextAt = null;
      if (cosmoAt && adaptAt) nextAt = adaptAt > cosmoAt ? adaptAt : cosmoAt;
      else nextAt = adaptAt ?? cosmoAt ?? null;

      if (sameInstant(contact.lastPurchaseAt, nextAt)) {
        unchanged += 1;
        continue;
      }

      if (!nextAt) cleared += 1;
      else if (!contact.lastPurchaseAt) filled += 1;
      else if (nextAt < contact.lastPurchaseAt) movedBack += 1;
      else movedForward += 1;

      const key = nextAt ? nextAt.toISOString() : "null";
      const bucket = byTarget.get(key) ?? { at: nextAt, ids: [] };
      bucket.ids.push(contact.id);
      byTarget.set(key, bucket);

      if (samples.length < 15) {
        samples.push({
          id: contact.id,
          name: contact.name,
          phone: contact.phoneNumber,
          from: contact.lastPurchaseAt,
          to: nextAt,
          source:
            nextAt && adaptAt && nextAt.getTime() === adaptAt.getTime()
              ? "adapt"
              : nextAt
                ? "cosmo"
                : null,
        });
      }
    }

    const wouldUpdate = contacts.length - unchanged;
    let written = 0;

    if (apply) {
      for (const bucket of byTarget.values()) {
        for (let i = 0; i < bucket.ids.length; i += WRITE_CHUNK) {
          const ids = bucket.ids.slice(i, i + WRITE_CHUNK);
          const result = await prisma.contactMaster.updateMany({
            where: { id: { in: ids } },
            data: { lastPurchaseAt: bucket.at },
          });
          written += result.count;
        }
      }
      console.error(`[repair-last-purchase] ${written} rows written`);
    }

    console.log(
      JSON.stringify(
        {
          companyId,
          apply,
          contactsScanned: contacts.length,
          unchanged,
          wouldUpdate,
          written,
          breakdown: { movedBack, movedForward, filled, cleared },
          distinctTargetDates: byTarget.size,
          samples,
        },
        null,
        2
      )
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[repair-last-purchase] fatal", error);
  process.exit(1);
});
