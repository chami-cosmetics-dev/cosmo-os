/**
 * Fold 0123456780 (Foriegner) into Foreign Customer 0123455555.
 * Rewrite Cosmo orders. Strip merchant/cashier emails. No previous-phone attach.
 *
 *   node scripts/with-env.mjs cosmo-prod node tmp/merge-foreign-junk-phones.cjs --dry-run
 *   node scripts/with-env.mjs cosmo-prod node tmp/merge-foreign-junk-phones.cjs --apply
 */
const { PrismaClient } = require("@prisma/client");

const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";
const KEEP_PHONE = "0123455555";
const LOSER_PHONE = "0123456780";
const apply = process.argv.includes("--apply");

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

function phoneDigitsOnly(value) {
  let d = String(value || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  return d;
}

function canonicalLocal(raw) {
  let d = phoneDigitsOnly(raw);
  if (d.startsWith("94") && d.length >= 11) d = d.slice(2);
  if (d.length === 9) d = `0${d}`;
  if (d.length === 10 && d.startsWith("0")) return d;
  return null;
}

function variants(raw) {
  const t = String(raw || "").trim();
  let d = phoneDigitsOnly(raw);
  const out = new Set();
  if (t) out.add(t);
  if (d) {
    out.add(d);
    if (d.length === 9) {
      out.add(`0${d}`);
      out.add(`94${d}`);
      out.add(`+94${d}`);
    }
    if (d.length === 10 && d.startsWith("0")) {
      out.add(d.slice(1));
      out.add(`94${d.slice(1)}`);
      out.add(`+94${d.slice(1)}`);
      out.add(`940${d.slice(1)}`);
      out.add(`+940${d.slice(1)}`);
    }
    if (d.length === 11 && d.startsWith("94")) {
      out.add(`0${d.slice(2)}`);
      out.add(d.slice(2));
      out.add(`+${d}`);
    }
  }
  return [...out].filter(Boolean);
}

function isMerchantEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return false;
  if (e.includes("cosmetic") || e.includes("cosmatics")) return true;
  if (e.endsWith("@cosmetics.lk") || e.endsWith("@lmj.lk")) return true;
  if (e.includes("pos1@") || e.includes("pos2@")) return true;
  const cashiers = new Set([
    "coolplanetpos2@gmail.com",
    "coolplanetpos1@gmail.com",
    "kiribathgodapos1@gmail.com",
    "sandalisemini17@gmail.com",
    "ajstradinglanka@gmail.com",
    "sewwandikaushalya293@gmail.com",
    "hpg.inoka@gmail.com",
    "hgp.inoka@gmail.com",
    "mnktrading24@gmail.com",
  ]);
  return cashiers.has(e);
}

async function main() {
  const keepVariants = variants(KEEP_PHONE);
  const loserVariants = variants(LOSER_PHONE);

  const contacts = await prisma.contactMaster.findMany({
    where: {
      companyId: COMPANY_ID,
      OR: [
        { phoneNumber: { in: [...keepVariants, ...loserVariants] } },
        { phones: { some: { phoneNumber: { in: [...keepVariants, ...loserVariants] } } } },
      ],
    },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      source: true,
      lastPurchaseAt: true,
      emails: { select: { email: true } },
      phones: { select: { phoneNumber: true } },
      _count: { select: { adaptPurchases: true } },
    },
  });

  const keepCanon = contacts.filter((c) => canonicalLocal(c.phoneNumber) === KEEP_PHONE);
  const loserCanon = contacts.filter((c) => canonicalLocal(c.phoneNumber) === LOSER_PHONE);

  keepCanon.sort((a, b) => b._count.adaptPurchases - a._count.adaptPurchases);
  const keep = keepCanon[0] || null;
  const losers = [
    ...keepCanon.slice(1),
    ...loserCanon,
  ].filter((c) => keep && c.id !== keep.id);

  const orderKeepCount = await prisma.order.count({
    where: { companyId: COMPANY_ID, customerPhone: { in: keepVariants } },
  });
  const ordersToRewrite = await prisma.order.findMany({
    where: { companyId: COMPANY_ID, customerPhone: { in: loserVariants } },
    select: { id: true, orderNumber: true, name: true, customerPhone: true, customerEmail: true },
  });

  const keepEmails = [keep?.email, ...(keep?.emails || []).map((e) => e.email)].filter(Boolean);
  const loserEmails = losers.flatMap((c) => [c.email, ...c.emails.map((e) => e.email)]).filter(Boolean);
  const allEmails = [...keepEmails, ...loserEmails];
  const customerEmails = [...new Set(allEmails.map((e) => String(e).toLowerCase()))].filter(
    (e) => !isMerchantEmail(e)
  );
  const merchantEmails = [...new Set(allEmails.map((e) => String(e).toLowerCase()))].filter(isMerchantEmail);

  const plan = {
    keep: keep && {
      id: keep.id,
      name: keep.name,
      phone: keep.phoneNumber,
      email: keep.email,
      source: keep.source,
      adapt: keep._count.adaptPurchases,
    },
    losers: losers.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phoneNumber,
      email: c.email,
      source: c.source,
      adapt: c._count.adaptPurchases,
    })),
    setKeepPhone: KEEP_PHONE,
    setKeepName: "Foreign Customer",
    ordersAlreadyOnKeepPhone: orderKeepCount,
    ordersRewriteToKeep: ordersToRewrite.length,
    rewritePhones: [...new Set(ordersToRewrite.map((o) => o.customerPhone))],
    customerEmailsKeep: customerEmails,
    merchantEmailsStrip: merchantEmails,
  };

  let adaptMoved = 0;
  let ordersUpdated = 0;
  let merged = 0;
  let emailsStripped = 0;

  if (apply) {
    if (!keep) throw new Error("No keep Foreign Customer card");

    if (String(keep.phoneNumber) !== KEEP_PHONE || keep.name !== "Foreign Customer") {
      await prisma.contactMaster.update({
        where: { id: keep.id },
        data: { phoneNumber: KEEP_PHONE, name: "Foreign Customer" },
      });
    }

    const keepEmailFinal = customerEmails[0] || null;
    await prisma.contactMaster.update({
      where: { id: keep.id },
      data: { email: keepEmailFinal },
    });
    if (keep.email && isMerchantEmail(keep.email)) emailsStripped += 1;

    const keepSecondaries = await prisma.contactEmail.findMany({
      where: { contactId: keep.id },
      select: { id: true, email: true },
    });
    for (const row of keepSecondaries) {
      if (isMerchantEmail(row.email) || (keepEmailFinal && row.email.toLowerCase() === keepEmailFinal)) {
        await prisma.contactEmail.delete({ where: { id: row.id } });
        if (isMerchantEmail(row.email)) emailsStripped += 1;
      }
    }

    let latest = keep.lastPurchaseAt;
    for (const loser of losers) {
      const moved = await prisma.adaptPurchaseHistory.updateMany({
        where: { contactId: loser.id, companyId: COMPANY_ID },
        data: { contactId: keep.id },
      });
      adaptMoved += moved.count;

      await prisma.contactAllocationUpdate.updateMany({
        where: { contactId: loser.id },
        data: { contactId: keep.id },
      });

      if (loser.lastPurchaseAt && (!latest || loser.lastPurchaseAt > latest)) {
        latest = loser.lastPurchaseAt;
      }

      await prisma.contactEmail.deleteMany({ where: { contactId: loser.id } });
      await prisma.contactPhone.deleteMany({ where: { contactId: loser.id } });
      await prisma.contactMaster.update({
        where: { id: loser.id },
        data: { phoneNumber: null, email: null, name: "Foreign Customer" },
      });
      merged += 1;
    }

    if (latest && (!keep.lastPurchaseAt || keep.lastPurchaseAt < latest)) {
      await prisma.contactMaster.update({
        where: { id: keep.id },
        data: { lastPurchaseAt: latest },
      });
    }

    const rewritten = await prisma.order.updateMany({
      where: { companyId: COMPANY_ID, customerPhone: { in: loserVariants } },
      data: { customerPhone: KEEP_PHONE },
    });
    ordersUpdated = rewritten.count;

    const leftoverPlus94 = await prisma.order.updateMany({
      where: {
        companyId: COMPANY_ID,
        customerPhone: { in: keepVariants.filter((v) => v !== KEEP_PHONE) },
      },
      data: { customerPhone: KEEP_PHONE },
    });
    ordersUpdated += leftoverPlus94.count;
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        plan,
        merged,
        adaptMoved,
        ordersUpdated,
        emailsStripped,
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
