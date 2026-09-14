/**
 * Merge duplicate Vault contacts for 0705346476 → one card, MER99 (Dinuli).
 *
 *   node scripts/with-env.mjs vault node tmp/merge-vault-dimuth-705346476.cjs --dry-run
 *   node scripts/with-env.mjs vault node tmp/merge-vault-dimuth-705346476.cjs --apply
 */
const { PrismaClient } = require("@prisma/client");

const COMPANY_ID = "cmp5k145c006irlhemjfidlb5";
const KEEP_ID = "cms8tkvdd004ejy04nkwtd7wz";
const LOSER_ID = "cmtr4wdyi0005l2041zqbekpi";
const PRIMARY_PHONE = "0705346476";
const ASSIGNED_MER = "MER99";
const apply = process.argv.includes("--apply");

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: (process.env.DATABASE_URL || "").replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2"),
    },
  },
});

function phoneDigitsOnly(value) {
  let d = String(value || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  return d;
}

function buildPhoneLookupVariants(raw) {
  const t = String(raw || "").trim();
  const d = phoneDigitsOnly(raw);
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
  for (const variant of [...out]) {
    const digits = phoneDigitsOnly(variant);
    if (!digits) continue;
    out.add(`+${digits}`);
    if (digits.length === 10 && digits.startsWith("0")) {
      out.add(`+94${digits.slice(1)}`);
    }
  }
  return [...out].filter(Boolean);
}

async function attachPreviousPhone(keepId, primary, previousRaw) {
  const variants = buildPhoneLookupVariants(previousRaw);
  const primaryDigits = phoneDigitsOnly(primary);
  const prevDigits = phoneDigitsOnly(previousRaw);
  if (!prevDigits || prevDigits === primaryDigits) return false;
  const existing = await prisma.contactPhone.findFirst({
    where: {
      contactId: keepId,
      phoneNumber: { in: variants },
    },
    select: { id: true },
  });
  if (existing) return false;
  const stored = String(previousRaw).trim() || variants[0];
  await prisma.contactPhone.create({
    data: { contactId: keepId, phoneNumber: stored, isPrimary: false },
  });
  return true;
}

async function main() {
  const [keep, loser] = await Promise.all([
    prisma.contactMaster.findUnique({
      where: { id: KEEP_ID },
      include: {
        phones: true,
        emails: true,
        _count: { select: { adaptPurchases: true, allocationUpdates: true } },
      },
    }),
    prisma.contactMaster.findUnique({
      where: { id: LOSER_ID },
      include: {
        phones: true,
        emails: true,
        _count: { select: { adaptPurchases: true, allocationUpdates: true } },
      },
    }),
  ]);

  if (!keep || !loser || keep.companyId !== COMPANY_ID || loser.companyId !== COMPANY_ID) {
    throw new Error("Keep/loser contact missing or wrong company");
  }

  const plan = {
    mode: apply ? "apply" : "dry-run",
    keep: {
      id: keep.id,
      name: keep.name,
      phoneNumber: keep.phoneNumber,
      assignedMerchant: keep.assignedMerchant,
      lastPurchaseAt: keep.lastPurchaseAt,
      adaptPurchases: keep._count.adaptPurchases,
    },
    loser: {
      id: loser.id,
      name: loser.name,
      phoneNumber: loser.phoneNumber,
      assignedMerchant: loser.assignedMerchant,
      source: loser.source,
      lastPurchaseAt: loser.lastPurchaseAt,
      adaptPurchases: loser._count.adaptPurchases,
    },
    primaryPhone: PRIMARY_PHONE,
    assignedMerchant: ASSIGNED_MER,
  };

  if (!apply) {
    console.log(JSON.stringify({ ...plan, wouldMerge: true }, null, 2));
    return;
  }

  const adaptMoved = await prisma.adaptPurchaseHistory.updateMany({
    where: { contactId: loser.id, companyId: COMPANY_ID },
    data: { contactId: keep.id },
  });
  const allocMoved = await prisma.contactAllocationUpdate.updateMany({
    where: { contactId: loser.id },
    data: { contactId: keep.id },
  });

  let previousAttached = 0;
  for (const alt of [loser.phoneNumber, keep.phoneNumber, "+94705346476"]) {
    if (await attachPreviousPhone(keep.id, PRIMARY_PHONE, alt)) previousAttached += 1;
  }
  for (const p of loser.phones) {
    if (await attachPreviousPhone(keep.id, PRIMARY_PHONE, p.phoneNumber)) previousAttached += 1;
  }

  const latest =
    keep.lastPurchaseAt && loser.lastPurchaseAt
      ? keep.lastPurchaseAt > loser.lastPurchaseAt
        ? keep.lastPurchaseAt
        : loser.lastPurchaseAt
      : keep.lastPurchaseAt || loser.lastPurchaseAt;

  await prisma.contactMaster.update({
    where: { id: keep.id },
    data: {
      phoneNumber: PRIMARY_PHONE,
      assignedMerchant: ASSIGNED_MER,
      ...(latest ? { lastPurchaseAt: latest } : {}),
      ...(!keep.source && loser.source ? { source: loser.source } : {}),
    },
  });

  await prisma.contactAllocationUpdate.create({
    data: {
      companyId: COMPANY_ID,
      contactId: keep.id,
      merchantId: null,
      merchantName: ASSIGNED_MER,
      category: "allocation",
    },
  });

  await prisma.contactEmail.deleteMany({ where: { contactId: loser.id } });
  await prisma.contactPhone.deleteMany({ where: { contactId: loser.id } });
  await prisma.contactMaster.update({
    where: { id: loser.id },
    data: { phoneNumber: null, email: null, assignedMerchant: null, name: `[merged] ${loser.name}` },
  });

  const remainingDupes = await prisma.contactMaster.findMany({
    where: {
      companyId: COMPANY_ID,
      OR: [
        { phoneNumber: { in: buildPhoneLookupVariants(PRIMARY_PHONE) } },
        { phones: { some: { phoneNumber: { in: buildPhoneLookupVariants(PRIMARY_PHONE) } } } },
      ],
    },
    select: { id: true, phoneNumber: true, assignedMerchant: true, name: true },
  });

  console.log(
    JSON.stringify(
      {
        ...plan,
        merged: true,
        adaptMoved: adaptMoved.count,
        allocMoved: allocMoved.count,
        previousAttached,
        contactsWithPhoneAfter: remainingDupes,
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
