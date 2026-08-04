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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const companyId = typeof args["company-id"] === "string" ? args["company-id"] : null;
  const dryRun = Boolean(args["dry-run"]);
  const limit =
    typeof args.limit === "string" && args.limit ? Number(args.limit) : null;

  if (!companyId) {
    console.error(
      "Usage: node scripts/recalc-contact-last-purchase.cjs --company-id <cuid> [--dry-run] [--limit N]"
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
    const contacts = await prisma.contactMaster.findMany({
      where: { companyId },
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        lastPurchaseAt: true,
        recentMerchant: true,
      },
      orderBy: { updatedAt: "desc" },
      ...(limit ? { take: limit } : {}),
    });

    let wouldUpdate = 0;
    let updated = 0;
    let cleared = 0;
    const samples = [];

    for (const contact of contacts) {
      const phoneVariants = contact.phoneNumber
        ? buildPhoneLookupVariants(contact.phoneNumber)
        : [];
      const email = contact.email?.trim().toLowerCase() || null;

      const [cosmoOrder, adaptPurchase] = await Promise.all([
        phoneVariants.length > 0 || email
          ? prisma.order.findFirst({
              where: {
                companyId,
                OR: [
                  ...(email
                    ? [{ customerEmail: { equals: email, mode: "insensitive" } }]
                    : []),
                  ...(phoneVariants.length > 0
                    ? [{ customerPhone: { in: phoneVariants } }]
                    : []),
                ],
              },
              orderBy: { createdAt: "desc" },
              select: {
                createdAt: true,
                assignedMerchant: { select: { name: true, email: true } },
              },
            })
          : Promise.resolve(null),
        prisma.adaptPurchaseHistory.findFirst({
          where: { companyId, contactId: contact.id },
          orderBy: { invoiceDate: "desc" },
          select: { invoiceDate: true, merchantKnownName: true },
        }),
      ]);

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

      if (!atChanged && !merchantChanged) continue;

      wouldUpdate += 1;
      if (samples.length < 12) {
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

      if (dryRun) continue;

      await prisma.contactMaster.update({
        where: { id: contact.id },
        data: {
          lastPurchaseAt: nextAt,
          recentMerchant: nextMerchant,
        },
      });
      updated += 1;
      if (!nextAt) cleared += 1;
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
