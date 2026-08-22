/**
 * Inspect + merge two phone cards into one customer.
 * Keep = card already allocated to Venushka if possible, else later purchase.
 * Loser phone becomes Previous on keep; set assignedMerchant = Venushka.
 *
 *   node scripts/with-env.mjs cosmo-prod node tmp/merge-two-phones-venushka.cjs --dry-run
 *   node scripts/with-env.mjs cosmo-prod node tmp/merge-two-phones-venushka.cjs --apply
 */
const { PrismaClient } = require("@prisma/client");

const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";
const PHONE_A = "0713034138";
const PHONE_B = "0763817656";
const MERCHANT = "Venushka";
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

function canonicalLocal(rawPhone) {
  let d = phoneDigitsOnly(rawPhone);
  if (d.startsWith("94") && d.length >= 11) d = d.slice(2);
  if (d.length === 9) d = `0${d}`;
  if (d.length === 10 && d.startsWith("0")) return d;
  return null;
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
      out.add(`94${digits.slice(1)}`);
    } else if (digits.length === 9) {
      out.add(`+94${digits}`);
      out.add(`94${digits}`);
      out.add(`0${digits}`);
    }
  }
  return [...out].filter(Boolean);
}

function isSharedEmail(email) {
  const e = String(email || "").toLowerCase();
  return (
    e.endsWith("@cosmetics.lk") ||
    e.includes("cosmetic") ||
    e.includes("cosmatics") ||
    e.includes("pos1@") ||
    e.includes("pos2@")
  );
}

async function findByPhone(phone) {
  const variants = buildPhoneLookupVariants(phone);
  const contacts = await prisma.contactMaster.findMany({
    where: {
      companyId: COMPANY_ID,
      OR: [
        { phoneNumber: { in: variants } },
        { phones: { some: { phoneNumber: { in: variants } } } },
      ],
    },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      source: true,
      assignedMerchant: true,
      recentMerchant: true,
      lastPurchaseAt: true,
      loyaltyAssignedTier: true,
      createdAt: true,
      updatedAt: true,
      emails: { select: { email: true } },
      phones: { select: { phoneNumber: true, isPrimary: true } },
      _count: {
        select: {
          adaptPurchases: true,
          allocationUpdates: true,
        },
      },
    },
  });
  return contacts;
}

async function attachPreviousPhone(keepId, keepPrimary, previousRaw) {
  const previous = canonicalLocal(previousRaw);
  const primary = canonicalLocal(keepPrimary);
  if (!previous || previous === primary) return false;
  const existing = await prisma.contactPhone.findFirst({
    where: {
      contactId: keepId,
      OR: [{ phoneNumber: previous }, { phoneNumber: { in: buildPhoneLookupVariants(previous) } }],
    },
    select: { id: true },
  });
  if (existing) return false;
  await prisma.contactPhone.create({
    data: { contactId: keepId, phoneNumber: previous, isPrimary: false },
  });
  return true;
}

function pickKeep(a, b) {
  const aVen = String(a.assignedMerchant || "").toLowerCase().includes("venushka");
  const bVen = String(b.assignedMerchant || "").toLowerCase().includes("venushka");
  if (aVen !== bVen) return aVen ? a : b;
  const aT = a.lastPurchaseAt ? a.lastPurchaseAt.getTime() : 0;
  const bT = b.lastPurchaseAt ? b.lastPurchaseAt.getTime() : 0;
  if (aT !== bT) return aT > bT ? a : b;
  if (a._count.adaptPurchases !== b._count.adaptPurchases) {
    return a._count.adaptPurchases > b._count.adaptPurchases ? a : b;
  }
  return a.createdAt <= b.createdAt ? a : b;
}

async function main() {
  const [cardsA, cardsB] = await Promise.all([findByPhone(PHONE_A), findByPhone(PHONE_B)]);

  const summary = {
    mode: apply ? "apply" : "dry-run",
    phoneA: PHONE_A,
    phoneB: PHONE_B,
    matchesA: cardsA.map(summarize),
    matchesB: cardsB.map(summarize),
  };

  if (cardsA.length !== 1 || cardsB.length !== 1) {
    console.log(JSON.stringify({ ...summary, error: "expected exactly one card per phone" }, null, 2));
    return;
  }

  const cardA = cardsA[0];
  const cardB = cardsB[0];
  if (cardA.id === cardB.id) {
    console.log(
      JSON.stringify(
        {
          ...summary,
          alreadySameCard: true,
          keepId: cardA.id,
          action: apply
            ? "set assignedMerchant + ensure both phones on same card"
            : "would set assignedMerchant + ensure both phones",
        },
        null,
        2
      )
    );
    if (apply) {
      const keepPhone = canonicalLocal(cardA.phoneNumber) || PHONE_A;
      await prisma.contactMaster.update({
        where: { id: cardA.id },
        data: {
          assignedMerchant: MERCHANT,
          phoneNumber: keepPhone,
        },
      });
      await attachPreviousPhone(cardA.id, keepPhone, PHONE_A);
      await attachPreviousPhone(cardA.id, keepPhone, PHONE_B);
    }
    return;
  }

  const keep = pickKeep(cardA, cardB);
  const loser = keep.id === cardA.id ? cardB : cardA;
  const keepPhone = canonicalLocal(keep.phoneNumber) || canonicalLocal(PHONE_A) || keep.phoneNumber;
  const loserPhone =
    canonicalLocal(loser.phoneNumber) ||
    (keepPhone === PHONE_A ? PHONE_B : PHONE_A);

  const plan = {
    ...summary,
    keep: summarize(keep),
    loser: summarize(loser),
    primaryPhone: keepPhone,
    previousPhone: loserPhone,
    assignedMerchant: MERCHANT,
  };

  if (!apply) {
    console.log(JSON.stringify({ ...plan, wouldMerge: true }, null, 2));
    return;
  }

  if (String(keep.phoneNumber) !== keepPhone) {
    await prisma.contactMaster.update({
      where: { id: keep.id },
      data: { phoneNumber: keepPhone },
    });
  }

  const adaptMoved = await prisma.adaptPurchaseHistory.updateMany({
    where: { contactId: loser.id, companyId: COMPANY_ID },
    data: { contactId: keep.id },
  });

  const allocMoved = await prisma.contactAllocationUpdate.updateMany({
    where: { contactId: loser.id },
    data: { contactId: keep.id },
  });

  let removedMoved = 0;
  try {
    const moved = await prisma.contactRemovedEmail.updateMany({
      where: { contactId: loser.id },
      data: { contactId: keep.id },
    });
    removedMoved = moved.count;
  } catch {
    // optional table
  }

  let callQueueCleared = 0;
  try {
    const deleted = await prisma.contactInsightCallQueue.deleteMany({
      where: { contactId: loser.id },
    });
    callQueueCleared = deleted.count;
  } catch {
    // optional
  }

  let previousAttached = 0;
  if (await attachPreviousPhone(keep.id, keepPhone, loserPhone)) previousAttached += 1;
  for (const extra of loser.phones) {
    if (await attachPreviousPhone(keep.id, keepPhone, extra.phoneNumber)) previousAttached += 1;
  }
  // ensure both requested numbers exist on keep
  if (await attachPreviousPhone(keep.id, keepPhone, PHONE_A)) previousAttached += 1;
  if (await attachPreviousPhone(keep.id, keepPhone, PHONE_B)) previousAttached += 1;

  const keepEmails = new Set(
    [
      keep.email,
      ...(
        await prisma.contactEmail.findMany({
          where: { contactId: keep.id },
          select: { email: true },
        })
      ).map((e) => e.email.toLowerCase()),
    ]
      .filter(Boolean)
      .map((e) => String(e).toLowerCase())
  );

  let emailsCopied = 0;
  for (const email of [loser.email, ...loser.emails.map((e) => e.email)]) {
    const n = String(email || "")
      .trim()
      .toLowerCase();
    if (!n || keepEmails.has(n) || isSharedEmail(n)) continue;
    if (!keep.email || isSharedEmail(keep.email)) {
      await prisma.contactMaster.update({
        where: { id: keep.id },
        data: { email: n },
      });
      keep.email = n;
    } else {
      await prisma.contactEmail
        .create({ data: { contactId: keep.id, email: n, isPrimary: false } })
        .catch(() => {});
    }
    keepEmails.add(n);
    emailsCopied += 1;
  }

  const latest =
    keep.lastPurchaseAt && loser.lastPurchaseAt
      ? keep.lastPurchaseAt > loser.lastPurchaseAt
        ? keep.lastPurchaseAt
        : loser.lastPurchaseAt
      : keep.lastPurchaseAt || loser.lastPurchaseAt;

  const keepPatch = {
    assignedMerchant: MERCHANT,
  };
  if (latest && (!keep.lastPurchaseAt || keep.lastPurchaseAt < latest)) {
    keepPatch.lastPurchaseAt = latest;
  }
  if (!keep.loyaltyAssignedTier && loser.loyaltyAssignedTier) {
    keepPatch.loyaltyAssignedTier = loser.loyaltyAssignedTier;
  }

  await prisma.contactMaster.update({
    where: { id: keep.id },
    data: keepPatch,
  });

  await prisma.contactEmail.deleteMany({ where: { contactId: loser.id } });
  await prisma.contactPhone.deleteMany({ where: { contactId: loser.id } });
  await prisma.contactMaster.update({
    where: { id: loser.id },
    data: { phoneNumber: null, email: null, assignedMerchant: null },
  });

  const after = await prisma.contactMaster.findUnique({
    where: { id: keep.id },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      assignedMerchant: true,
      lastPurchaseAt: true,
      phones: { select: { phoneNumber: true } },
      emails: { select: { email: true } },
    },
  });

  console.log(
    JSON.stringify(
      {
        ...plan,
        merged: true,
        adaptMoved: adaptMoved.count,
        allocMoved: allocMoved.count,
        removedMoved,
        callQueueCleared,
        previousAttached,
        emailsCopied,
        after,
      },
      null,
      2
    )
  );
}

function summarize(c) {
  return {
    id: c.id,
    name: c.name,
    phoneNumber: c.phoneNumber,
    email: c.email,
    source: c.source,
    assignedMerchant: c.assignedMerchant,
    recentMerchant: c.recentMerchant,
    lastPurchaseAt: c.lastPurchaseAt,
    loyaltyAssignedTier: c.loyaltyAssignedTier,
    adaptPurchases: c._count?.adaptPurchases,
    allocationUpdates: c._count?.allocationUpdates,
    phones: c.phones?.map((p) => p.phoneNumber),
    emails: c.emails?.map((e) => e.email),
  };
}

main()
  .finally(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
