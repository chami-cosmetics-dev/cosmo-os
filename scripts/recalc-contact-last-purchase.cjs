/**
 * Recalculate ContactMaster.lastPurchaseAt / recentMerchant from:
 *   max(latest Cosmo Order by primary phone/email, latest AdaptPurchaseHistory by contactId)
 *
 * So Adapt-only customers show Adapt last purchase; Cosmo-only show Cosmo; both → newer wins.
 *
 * Usage:
 *   node scripts/with-env.mjs cosmo-prod node scripts/recalc-contact-last-purchase.cjs --company-id <id> --dry-run
 *   node scripts/with-env.mjs cosmo-prod node scripts/recalc-contact-last-purchase.cjs --company-id <id>
 */

const { PrismaClient } = require("@prisma/client");

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

function phoneDigitsOnly(raw) {
  let d = String(raw).replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  return d;
}

function buildPhoneLookupVariants(raw) {
  const t = String(raw).trim();
  let d = phoneDigitsOnly(raw);
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
    }
    if (d.length === 11 && d.startsWith("94")) {
      out.add(`0${d.slice(2)}`);
      out.add(d.slice(2));
    }
  }
  return [...out];
}

function sameInstant(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.getTime() === b.getTime();
}

// Mirror of lib/adapt-import/shared-emails.ts — keep the two in step.
// Company/staff addresses sit on thousands of unrelated customer orders.
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

/** Same rule as lib/orders-last-purchase.ts: phone whenever there is one, never a company email. */
function buildOrderMatch(phoneVariants, email) {
  if (phoneVariants.length > 0) {
    return [
      { customerPhone: { in: phoneVariants } },
      { erpnextCustomerId: { in: phoneVariants } },
    ];
  }
  if (!email || isSharedMerchantEmail(email)) return [];
  return [{ customerEmail: { equals: email, mode: "insensitive" } }];
}

/**
 * Mirror of isOrderReversed in lib/customer-insight/lifetime-total.ts.
 * A placed order counts from the day it is placed; only cancelled, voided and
 * returned orders are excluded. Checked in JS so a NULL status is never dropped
 * by SQL three-valued logic.
 */
function isOrderReversed(order) {
  if (order.cancelledAt) return true;
  const financial = String(order.financialStatus ?? "").trim().toLowerCase();
  if (financial === "voided") return true;
  const stage = String(order.fulfillmentStage ?? "").trim().toLowerCase();
  return stage === "returned" || stage === "returned_to_store";
}

/** Contacts checked in parallel. Independent read pairs, so this is round-trip bound. */
const CONCURRENCY = 20;

/** Newest orders are re-checked in JS, so a run of reversals cannot hide a real sale. */
const REVERSAL_SCAN_DEPTH = 50;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const companyId = typeof args["company-id"] === "string" ? args["company-id"] : null;
  const dryRun = Boolean(args["dry-run"]);
  const limit =
    typeof args.limit === "string" && args.limit ? Number(args.limit) : null;
  // Check one customer without scanning the whole company.
  const onlyPhone = typeof args.phone === "string" ? args.phone : null;
  const onlyContactId = typeof args["contact-id"] === "string" ? args["contact-id"] : null;

  if (!companyId) {
    console.error(
      "Usage: node scripts/recalc-contact-last-purchase.cjs --company-id <cuid> [--dry-run] [--limit N] [--phone 07xxxxxxxx] [--contact-id <cuid>]"
    );
    process.exit(1);
  }

  const rawUrl = process.env.DATABASE_URL ?? "";
  const prisma = new PrismaClient({
    datasources: {
      db: { url: rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || rawUrl },
    },
  });

  try {
    const phoneFilter = onlyPhone ? buildPhoneLookupVariants(onlyPhone) : [];
    const contactWhere = {
      companyId,
      ...(onlyContactId ? { id: onlyContactId } : {}),
      ...(phoneFilter.length > 0
        ? {
            OR: [
              { phoneNumber: { in: phoneFilter } },
              { phones: { some: { phoneNumber: { in: phoneFilter } } } },
            ],
          }
        : {}),
    };

    const contacts = await prisma.contactMaster.findMany({
      where: contactWhere,
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        lastPurchaseAt: true,
        recentMerchant: true,
        phones: { select: { phoneNumber: true } },
      },
      orderBy: { updatedAt: "desc" },
      ...(limit ? { take: limit } : {}),
    });

    let wouldUpdate = 0;
    let updated = 0;
    let cleared = 0;
    const samples = [];

    const targeted = Boolean(onlyPhone || onlyContactId);
    console.error(`[recalc-last-purchase] scanning ${contacts.length} contacts...`);

    let scanned = 0;
    const processContact = async (contact) => {
      scanned += 1;
      if (!targeted && scanned % 500 === 0) {
        console.error(
          `[recalc-last-purchase] ${scanned}/${contacts.length} scanned, ${wouldUpdate} to change`
        );
      }
      const contactPhones = [
        contact.phoneNumber,
        ...contact.phones.map((p) => p.phoneNumber),
      ].filter(Boolean);
      const phoneVariants = [
        ...new Set(contactPhones.flatMap((p) => buildPhoneLookupVariants(p))),
      ];
      const email = contact.email?.trim().toLowerCase() || null;
      const orderMatch = buildOrderMatch(phoneVariants, email);

      const [cosmoOrders, adaptPurchase] = await Promise.all([
        orderMatch.length > 0
          ? prisma.order.findMany({
              where: { companyId, cancelledAt: null, OR: orderMatch },
              orderBy: { createdAt: "desc" },
              take: REVERSAL_SCAN_DEPTH,
              select: {
                createdAt: true,
                cancelledAt: true,
                financialStatus: true,
                fulfillmentStage: true,
                assignedMerchant: { select: { name: true, email: true } },
              },
            })
          : Promise.resolve([]),
        prisma.adaptPurchaseHistory.findFirst({
          where: { companyId, contactId: contact.id },
          orderBy: { invoiceDate: "desc" },
          select: { invoiceDate: true, merchantKnownName: true },
        }),
      ]);

      const cosmoOrder = cosmoOrders.find((order) => !isOrderReversed(order)) ?? null;
      const cosmoAt = cosmoOrder?.createdAt ?? null;
      const adaptAt = adaptPurchase?.invoiceDate ?? null;

      let nextAt = null;
      let nextMerchant = null;
      let source = null;

      if (cosmoAt && adaptAt) {
        if (adaptAt > cosmoAt) {
          nextAt = adaptAt;
          nextMerchant = adaptPurchase.merchantKnownName;
          source = "adapt";
        } else {
          nextAt = cosmoAt;
          nextMerchant =
            cosmoOrder.assignedMerchant?.name ||
            cosmoOrder.assignedMerchant?.email ||
            null;
          source = "cosmo";
        }
      } else if (adaptAt) {
        nextAt = adaptAt;
        nextMerchant = adaptPurchase.merchantKnownName;
        source = "adapt";
      } else if (cosmoAt) {
        nextAt = cosmoAt;
        nextMerchant =
          cosmoOrder.assignedMerchant?.name ||
          cosmoOrder.assignedMerchant?.email ||
          null;
        source = "cosmo";
      }

      const atChanged = !sameInstant(contact.lastPurchaseAt, nextAt);
      const merchantChanged =
        (contact.recentMerchant || null) !== (nextMerchant || null);

      if (targeted) {
        // Show every document the contact could be dated from, completed or not,
        // so an excluded order is visible rather than silently dropped.
        const allOrders =
          orderMatch.length > 0
            ? await prisma.order.findMany({
                where: { companyId, OR: orderMatch },
                orderBy: { createdAt: "desc" },
                take: 5,
                select: {
                  name: true,
                  createdAt: true,
                  cancelledAt: true,
                  financialStatus: true,
                  fulfillmentStage: true,
                  sourceName: true,
                },
              })
            : [];
        const allAdapt = await prisma.adaptPurchaseHistory.findMany({
          where: { companyId, contactId: contact.id },
          orderBy: { invoiceDate: "desc" },
          take: 5,
          select: { salesInvoiceNo: true, invoiceDate: true, ttlAmount: true },
        });
        console.error("newest orders (any status):", JSON.stringify(allOrders, null, 2));
        console.error("newest adapt invoices:", JSON.stringify(allAdapt, null, 2));
        console.error(
          JSON.stringify({
            id: contact.id,
            name: contact.name,
            phone: contact.phoneNumber,
            email: contact.email,
            storedLastPurchaseAt: contact.lastPurchaseAt,
            recalculated: nextAt,
            source,
            changed: atChanged || merchantChanged,
          })
        );
      }

      if (!atChanged && !merchantChanged) return;

      wouldUpdate += 1;
      if (samples.length < 12 || targeted) {
        samples.push({
          id: contact.id,
          name: contact.name,
          phone: contact.phoneNumber,
          from: contact.lastPurchaseAt,
          to: nextAt,
          merchantFrom: contact.recentMerchant,
          merchantTo: nextMerchant,
          source,
        });
      }

      if (dryRun) return;

      await prisma.contactMaster.update({
        where: { id: contact.id },
        data: {
          lastPurchaseAt: nextAt,
          recentMerchant: nextMerchant,
        },
      });
      updated += 1;
      if (!nextAt) cleared += 1;
    };

    // One contact at a time against a remote database turns a large company into an
    // hours-long run; the queries are independent, so walk them a chunk at a time.
    for (let i = 0; i < contacts.length; i += CONCURRENCY) {
      await Promise.all(contacts.slice(i, i + CONCURRENCY).map(processContact));
    }

    console.log(
      JSON.stringify(
        {
          companyId,
          dryRun,
          contactsScanned: contacts.length,
          wouldUpdate,
          updated,
          cleared,
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
  console.error("[recalc-last-purchase] fatal", error);
  process.exit(1);
});
