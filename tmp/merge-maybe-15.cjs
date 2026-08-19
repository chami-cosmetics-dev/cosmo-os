/**
 * Merge KEEP CSV verdict=MAYBE (15) into phone card.
 *
 *   node scripts/with-env.mjs cosmo-prod node tmp/merge-maybe-15.cjs --dry-run
 *   node scripts/with-env.mjs cosmo-prod node tmp/merge-maybe-15.cjs --apply
 */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";
const apply = process.argv.includes("--apply");
const SRC = path.resolve("tmp/split-contacts-KEEP-DO-NOT-MERGE.csv");

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

function isSharedEmail(email) {
  const e = String(email || "").toLowerCase();
  return (
    e.endsWith("@cosmetics.lk") ||
    e.includes(".cosmetics@") ||
    e.includes("pos1@gmail.com") ||
    e.includes("pos2@gmail.com") ||
    e.includes("cosmetics")
  );
}

async function main() {
  const table = parseCsv(fs.readFileSync(SRC, "utf8"));
  const header = table[0];
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const get = (r, k) => r[idx[k]] ?? "";

  const mergeList = [];
  const skip = [];

  for (const r of table.slice(1)) {
    if (get(r, "verdict") !== "MAYBE") continue;
    const emailId = get(r, "email_card_id");
    const phoneId = get(r, "phone_card_id");
    const emailCard = await prisma.contactMaster.findUnique({
      where: { id: emailId },
      select: { id: true, name: true, phoneNumber: true, email: true, lastPurchaseAt: true },
    });
    const phoneCard = await prisma.contactMaster.findUnique({
      where: { id: phoneId },
      select: { id: true, name: true, phoneNumber: true, email: true, lastPurchaseAt: true },
    });
    if (!emailCard || !phoneCard) {
      skip.push({ reason: "card_gone", emailId, phoneId });
      continue;
    }
    if (!phoneCard.phoneNumber) {
      skip.push({ reason: "phone_card_no_phone", emailId, phoneId });
      continue;
    }
    if (emailCard.phoneNumber) {
      const c1 = canonicalLocal(emailCard.phoneNumber);
      const c2 = canonicalLocal(phoneCard.phoneNumber);
      if (c1 && c2 && c1 !== c2) {
        skip.push({ reason: "email_card_now_has_different_phone", emailId, phoneId });
        continue;
      }
    }
    mergeList.push({
      email_card_name: get(r, "email_card_name"),
      email_card_email: get(r, "email_card_email") || emailCard.email || "",
      phone_card_name: phoneCard.name,
      phone: phoneCard.phoneNumber,
      fill_phone: canonicalLocal(phoneCard.phoneNumber) || phoneCard.phoneNumber,
      email_card_id: emailId,
      phone_card_id: phoneId,
    });
  }

  let merged = 0;
  let adaptMoved = 0;
  let ordersFilled = 0;
  let lastPurchasePatched = 0;

  if (apply) {
    for (const p of mergeList) {
      const keep = await prisma.contactMaster.findUnique({
        where: { id: p.phone_card_id },
        select: { id: true, email: true, lastPurchaseAt: true, phoneNumber: true },
      });
      const loser = await prisma.contactMaster.findUnique({
        where: { id: p.email_card_id },
        select: {
          id: true,
          email: true,
          lastPurchaseAt: true,
          emails: { select: { email: true } },
        },
      });
      if (!keep || !loser) continue;

      const canon = canonicalLocal(keep.phoneNumber) || p.fill_phone;
      if (canon && String(keep.phoneNumber) !== canon) {
        await prisma.contactMaster.update({
          where: { id: keep.id },
          data: { phoneNumber: canon },
        });
      }

      const moved = await prisma.adaptPurchaseHistory.updateMany({
        where: { contactId: loser.id, companyId: COMPANY_ID },
        data: { contactId: keep.id },
      });
      adaptMoved += moved.count;

      await prisma.contactAllocationUpdate.updateMany({
        where: { contactId: loser.id },
        data: { contactId: keep.id },
      });

      const customerEmail = String(p.email_card_email || loser.email || "")
        .trim()
        .toLowerCase();
      if (customerEmail && !isSharedEmail(customerEmail)) {
        if (keep.email && isSharedEmail(keep.email) && keep.email.toLowerCase() !== customerEmail) {
          await prisma.contactEmail
            .create({
              data: { contactId: keep.id, email: keep.email, isPrimary: false },
            })
            .catch(() => {});
          await prisma.contactMaster.update({
            where: { id: keep.id },
            data: { email: customerEmail },
          });
          keep.email = customerEmail;
        } else if (!keep.email) {
          await prisma.contactMaster.update({
            where: { id: keep.id },
            data: { email: customerEmail },
          });
          keep.email = customerEmail;
        } else if (keep.email.toLowerCase() !== customerEmail) {
          await prisma.contactEmail
            .create({
              data: { contactId: keep.id, email: customerEmail, isPrimary: false },
            })
            .catch(() => {});
        }
      }

      if (customerEmail && !isSharedEmail(customerEmail) && canon) {
        const orders = await prisma.order.findMany({
          where: {
            companyId: COMPANY_ID,
            customerEmail: { equals: customerEmail, mode: "insensitive" },
            OR: [{ customerPhone: null }, { customerPhone: "" }],
          },
          select: { id: true },
        });
        for (const o of orders) {
          await prisma.order.update({
            where: { id: o.id },
            data: { customerPhone: canon },
          });
          ordersFilled += 1;
        }
      }

      const latest =
        keep.lastPurchaseAt && loser.lastPurchaseAt
          ? keep.lastPurchaseAt > loser.lastPurchaseAt
            ? keep.lastPurchaseAt
            : loser.lastPurchaseAt
          : keep.lastPurchaseAt || loser.lastPurchaseAt;
      if (latest && (!keep.lastPurchaseAt || keep.lastPurchaseAt < latest)) {
        await prisma.contactMaster.update({
          where: { id: keep.id },
          data: { lastPurchaseAt: latest },
        });
        lastPurchasePatched += 1;
      }

      await prisma.contactEmail.deleteMany({ where: { contactId: loser.id } });
      await prisma.contactPhone.deleteMany({ where: { contactId: loser.id } });
      await prisma.contactMaster.update({
        where: { id: loser.id },
        data: { phoneNumber: null, email: null },
      });
      merged += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        wouldMerge: mergeList.length,
        skip,
        merged,
        adaptMoved,
        ordersFilled,
        lastPurchasePatched,
        rows: mergeList.map((p) => ({
          name: p.email_card_name,
          onto: p.phone_card_name,
          phone: p.fill_phone,
          email: p.email_card_email,
        })),
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
