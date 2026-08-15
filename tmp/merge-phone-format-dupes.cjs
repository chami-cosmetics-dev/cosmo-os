/**
 * Merge Cosmo contacts that are the same number in different formats
 * (+9477… vs 077…). Keep 0XXXXXXXXX card. Move Adapt/emails. Strip loser.
 *
 *   node scripts/with-env.mjs cosmo-prod node tmp/merge-phone-format-dupes.cjs --dry-run
 *   node scripts/with-env.mjs cosmo-prod node tmp/merge-phone-format-dupes.cjs --apply
 *   node scripts/with-env.mjs cosmo-prod node tmp/merge-phone-format-dupes.cjs --apply --only=770271960
 */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";
const apply = process.argv.includes("--apply");
const onlyArg = process.argv.find((a) => a.startsWith("--only="))?.split("=")[1] ?? null;

const raw = process.env.DATABASE_URL || "";
const prisma = new PrismaClient({
  datasources: { db: { url: raw.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || raw } },
});

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
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

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(ms|mrs|mr|miss|dr)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameTokens(value) {
  return normalizeName(value).split(" ").filter((t) => t.length >= 2);
}

function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size && !B.size) return 1;
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  return inter / new Set([...A, ...B]).size;
}

function emailsOf(c) {
  const out = new Set();
  if (c.email) out.add(c.email.trim().toLowerCase());
  for (const e of c.emails || []) out.add(String(e.email).trim().toLowerCase());
  return [...out];
}

async function main() {
  const contacts = await prisma.contactMaster.findMany({
    where: { companyId: COMPANY_ID, phoneNumber: { not: null } },
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

  const groups = new Map();
  for (const c of contacts) {
    const canon = canonicalLocal(c.phoneNumber);
    if (!canon) continue;
    if (["0123455555", "0123456789", "0123456780"].includes(canon)) continue;
    if (onlyArg) {
      const want = canonicalLocal(onlyArg);
      if (want && canon !== want) continue;
    }
    const list = groups.get(canon) ?? [];
    list.push(c);
    groups.set(canon, list);
  }

  const pairs = [];
  for (const [canon, list] of groups) {
    if (list.length < 2) continue;
    const formats = new Set(list.map((c) => String(c.phoneNumber).trim()));
    if (formats.size < 2) continue;

    const stored = list.map((c) => String(c.phoneNumber).trim());
    const hasPlus = stored.some((p) => p.includes("+") || p.startsWith("94"));
    const hasLocal = stored.some((p) => /^0\d{9}$/.test(p));
    if (!hasPlus && !stored.some((p) => !p.startsWith("0"))) {
      // still a format group if strings differ
    }

    list.sort((a, b) => a.createdAt - b.createdAt);
    const namesSame = list.every((c) => normalizeName(c.name) === normalizeName(list[0].name));
    const emailSets = list.map(emailsOf);
    const sharedEmail = emailSets.some((a, i) =>
      emailSets.some((b, j) => i !== j && a.some((e) => b.includes(e)))
    );
    const minScore = list.slice(1).reduce((min, c) => {
      const s = jaccard(nameTokens(list[0].name), nameTokens(c.name));
      return Math.min(min, s);
    }, 1);

    const keep =
      list.find((c) => /^0\d{9}$/.test(String(c.phoneNumber).trim())) ?? list[list.length - 1];
    const losers = list.filter((c) => c.id !== keep.id);
    const safe = list.length === 2 && (namesSame || sharedEmail || minScore >= 0.67);

    pairs.push({
      canon,
      count: list.length,
      formats: stored.join(" | "),
      names: list.map((c) => c.name).join(" | "),
      ids: list.map((c) => c.id).join("|"),
      emails: emailSets.map((e) => e.join("/")).join(" | "),
      name_score: Number(minScore.toFixed(3)),
      names_same: namesSame ? "yes" : "no",
      shared_email: sharedEmail ? "yes" : "no",
      keep_id: keep.id,
      keep_phone: keep.phoneNumber,
      merge: safe ? "yes" : "review",
      loser_ids: losers.map((c) => c.id).join("|"),
    });
  }

  pairs.sort((a, b) => a.merge.localeCompare(b.merge) || a.canon.localeCompare(b.canon));

  const out = path.resolve("tmp/phone-format-dupes.csv");
  const header = [
    "merge",
    "canon",
    "count",
    "formats",
    "names",
    "ids",
    "emails",
    "name_score",
    "names_same",
    "shared_email",
    "keep_id",
    "keep_phone",
    "loser_ids",
  ];
  const lines = [header.join(",")];
  for (const p of pairs) {
    lines.push(header.map((h) => csvEscape(p[h] ?? "")).join(","));
  }
  fs.writeFileSync(out, lines.join("\n"), "utf8");

  let merged = 0;
  let adaptMoved = 0;
  if (apply) {
    for (const p of pairs.filter((x) => x.merge === "yes")) {
      const keepId = p.keep_id;
      const loserIds = p.loser_ids.split("|").filter(Boolean);
      const keep = await prisma.contactMaster.findUnique({
        where: { id: keepId },
        select: { id: true, email: true, lastPurchaseAt: true, phoneNumber: true },
      });
      if (!keep) continue;

      if (!/^0\d{9}$/.test(String(keep.phoneNumber || ""))) {
        await prisma.contactMaster.update({
          where: { id: keepId },
          data: { phoneNumber: p.canon },
        });
      }

      for (const loserId of loserIds) {
        const loser = await prisma.contactMaster.findUnique({
          where: { id: loserId },
          select: {
            id: true,
            email: true,
            lastPurchaseAt: true,
            emails: { select: { email: true } },
          },
        });
        if (!loser) continue;

        const moved = await prisma.adaptPurchaseHistory.updateMany({
          where: { contactId: loserId, companyId: COMPANY_ID },
          data: { contactId: keepId },
        });
        adaptMoved += moved.count;

        await prisma.contactAllocationUpdate.updateMany({
          where: { contactId: loserId },
          data: { contactId: keepId },
        });

        const keepEmails = new Set(
          [keep.email, ...(await prisma.contactEmail.findMany({
            where: { contactId: keepId },
            select: { email: true },
          })).map((e) => e.email.toLowerCase())]
            .filter(Boolean)
            .map((e) => String(e).toLowerCase())
        );

        const loserEmails = [loser.email, ...loser.emails.map((e) => e.email)].filter(Boolean);
        for (const email of loserEmails) {
          const n = String(email).trim().toLowerCase();
          if (!n || keepEmails.has(n)) continue;
          if (!keep.email) {
            await prisma.contactMaster.update({ where: { id: keepId }, data: { email: n } });
            keep.email = n;
          } else {
            await prisma.contactEmail.create({
              data: { contactId: keepId, email: n, isPrimary: false },
            }).catch(() => {});
          }
          keepEmails.add(n);
        }

        const latest =
          keep.lastPurchaseAt && loser.lastPurchaseAt
            ? keep.lastPurchaseAt > loser.lastPurchaseAt
              ? keep.lastPurchaseAt
              : loser.lastPurchaseAt
            : keep.lastPurchaseAt || loser.lastPurchaseAt;
        if (latest && (!keep.lastPurchaseAt || keep.lastPurchaseAt < latest)) {
          await prisma.contactMaster.update({
            where: { id: keepId },
            data: { lastPurchaseAt: latest },
          });
          keep.lastPurchaseAt = latest;
        }

        await prisma.contactEmail.deleteMany({ where: { contactId: loserId } });
        await prisma.contactPhone.deleteMany({ where: { contactId: loserId } });
        await prisma.contactMaster.update({
          where: { id: loserId },
          data: { phoneNumber: null, email: null },
        });
        merged += 1;
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        formatDupGroups: pairs.length,
        safeToMerge: pairs.filter((p) => p.merge === "yes").length,
        needsReview: pairs.filter((p) => p.merge === "review").length,
        pairsMerged: merged,
        adaptMoved,
        csv: out,
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
