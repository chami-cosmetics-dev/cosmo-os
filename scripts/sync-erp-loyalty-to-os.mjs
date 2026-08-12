/**
 * Pull ERP Customer Group Gold/Platinum onto matching OS ContactMaster rows.
 * Read from ERP only — never writes loyalty back to ERP.
 *
 * Usage:
 *   node scripts/with-env.mjs cosmo-prod node scripts/sync-erp-loyalty-to-os.mjs
 *   node scripts/with-env.mjs cosmo-dev node scripts/sync-erp-loyalty-to-os.mjs
 *   node scripts/with-env.mjs cosmo-prod node scripts/sync-erp-loyalty-to-os.mjs --dry-run
 */

import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const companyIdArg = args.find((a) => a.startsWith("--company-id="))?.split("=")[1] ?? null;
const pageSize = Number(args.find((a) => a.startsWith("--page-size="))?.split("=")[1] ?? 200);
const maxPages = Number(args.find((a) => a.startsWith("--max-pages="))?.split("=")[1] ?? 30);

const rawUrl = process.env.DATABASE_URL ?? "";
const prisma = new PrismaClient({
  datasources: {
    db: { url: rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || rawUrl },
  },
});

const ERP_GROUP_TO_TIER = {
  gold: "gold",
  loyalcs: "gold",
  platinum: "platinum",
  loyalcs2: "platinum",
};

function mapGroup(group) {
  const key = group?.trim().toLowerCase() ?? "";
  return ERP_GROUP_TO_TIER[key] ?? null;
}

function higherTier(a, b) {
  const rank = (t) => (t === "platinum" ? 2 : t === "gold" ? 1 : 0);
  const r = Math.max(rank(a), rank(b));
  if (r >= 2) return "platinum";
  if (r >= 1) return "gold";
  return null;
}

function buildPhoneLookupVariants(raw) {
  const t = raw.trim();
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
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
    if (d.length === 12 && d.startsWith("94") && d[2] === "0") {
      const local = d.slice(2);
      out.add(local);
      out.add(local.slice(1));
      out.add(`94${local.slice(1)}`);
    }
  }
  for (const variant of [...out]) {
    const digits = variant.replace(/\D/g, "");
    if (!digits) continue;
    out.add(`+${digits}`);
    if (digits.startsWith("94") && digits.length >= 11) {
      out.add(`00${digits}`);
    } else if (digits.length === 10 && digits.startsWith("0")) {
      out.add(`+94${digits.slice(1)}`);
      out.add(`94${digits.slice(1)}`);
    } else if (digits.length === 9) {
      out.add(`+94${digits}`);
      out.add(`94${digits}`);
      out.add(`0${digits}`);
    }
  }
  return [...out].filter((s) => s.length > 0 && s.length <= 32);
}

function resolveSlots(instances) {
  const erp1Match = instances.find((i) => /erp[_\s-]*1\b/i.test(i.label ?? ""));
  const erp2Match = instances.find((i) => /erp[_\s-]*2\b/i.test(i.label ?? ""));
  if (erp1Match || erp2Match) {
    return [
      ...(erp1Match ? [{ ...erp1Match, slot: "erp1" }] : []),
      ...(erp2Match ? [{ ...erp2Match, slot: "erp2" }] : []),
    ];
  }
  return instances.slice(0, 2).map((inst, idx) => ({
    ...inst,
    slot: idx === 0 ? "erp1" : "erp2",
  }));
}

async function erpGetJson(cfg, path) {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    headers: {
      Authorization: `token ${cfg.apiKey}:${cfg.apiSecret}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ERP GET ${path} [${res.status}]: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function listCustomersByGroup(cfg, group) {
  const fields = JSON.stringify([
    "name",
    "customer_name",
    "customer_group",
    "mobile_no",
    "email_id",
  ]);
  const all = [];
  for (let page = 0; page < maxPages; page++) {
    const filters = JSON.stringify([["customer_group", "=", group]]);
    const path =
      `/api/resource/Customer?filters=${encodeURIComponent(filters)}` +
      `&fields=${encodeURIComponent(fields)}` +
      `&limit_page_length=${pageSize}&limit_start=${page * pageSize}&order_by=name asc`;
    const json = await erpGetJson(cfg, path);
    const batch = json.data ?? [];
    all.push(...batch);
    if (batch.length < pageSize) break;
  }
  return all;
}

async function findContactIds(companyId, email, phone) {
  const phoneVariants = phone ? buildPhoneLookupVariants(phone) : [];
  const emailN = email?.trim().toLowerCase() || null;

  const primary = await prisma.contactMaster.findMany({
    where: {
      companyId,
      OR: [
        ...(emailN ? [{ email: { equals: emailN, mode: "insensitive" } }] : []),
        ...(phoneVariants.length ? [{ phoneNumber: { in: phoneVariants } }] : []),
      ],
    },
    select: { id: true, email: true, phoneNumber: true },
  });

  const phoneMatches = phoneVariants.length
    ? primary.filter((c) => phoneVariants.includes(c.phoneNumber?.trim() ?? ""))
    : [];
  const emailMatches = emailN
    ? primary.filter((c) => c.email?.trim().toLowerCase() === emailN)
    : [];

  let aliasIds = [];
  if (phoneVariants.length && prisma.contactPhone) {
    const rows = await prisma.contactPhone.findMany({
      where: { phoneNumber: { in: phoneVariants }, contact: { is: { companyId } } },
      select: { contactId: true },
    });
    aliasIds.push(...rows.map((r) => r.contactId));
  }
  if (emailN && prisma.contactEmail) {
    const rows = await prisma.contactEmail.findMany({
      where: { email: { equals: emailN, mode: "insensitive" }, contact: { is: { companyId } } },
      select: { contactId: true },
    });
    aliasIds.push(...rows.map((r) => r.contactId));
  }

  const preferred = phoneMatches.length > 0 ? phoneMatches : emailMatches;
  return [...new Set([...preferred.map((c) => c.id), ...aliasIds])];
}

async function applyTier(contactId, tier) {
  const current = await prisma.contactMaster.findUnique({
    where: { id: contactId },
    select: {
      loyaltyAssignedTier: true,
      loyaltyAssignedAt: true,
      loyaltyOutreachStatus: true,
    },
  });
  if (!current) return "missing";
  const next = higherTier(current.loyaltyAssignedTier, tier);
  if (!next) return "unchanged";
  if (current.loyaltyAssignedTier === next && current.loyaltyOutreachStatus === "assigned") {
    return "unchanged";
  }
  if (dryRun) return "updated";
  await prisma.contactMaster.update({
    where: { id: contactId },
    data: {
      loyaltyAssignedTier: next,
      loyaltyAssignedAt: current.loyaltyAssignedAt ?? new Date(),
      loyaltyOutreachStatus: "assigned",
    },
  });
  return "updated";
}

async function main() {
  const companyId =
    companyIdArg ??
    (
      await prisma.erpnextInstance.findFirst({
        orderBy: { createdAt: "asc" },
        select: { companyId: true },
      })
    )?.companyId;
  if (!companyId) throw new Error("No ErpnextInstance found — pass --company-id=");

  const rows = await prisma.erpnextInstance.findMany({
    where: { companyId },
    select: { id: true, label: true, baseUrl: true, apiKey: true, apiSecret: true },
    orderBy: { createdAt: "asc" },
  });
  const instances = resolveSlots(rows.filter((i) => i.baseUrl && i.apiKey && i.apiSecret)).map(
    (i) => ({
      ...i,
      cfg: {
        baseUrl: i.baseUrl.replace(/\/$/, ""),
        apiKey: i.apiKey,
        apiSecret: i.apiSecret,
      },
    })
  );

  const stats = { scanned: 0, matched: 0, updated: 0, unchanged: 0, skipped: 0 };
  const seen = new Set();

  console.log(
    JSON.stringify({
      dryRun,
      companyId,
      instances: instances.map((i) => ({ slot: i.slot, label: i.label, baseUrl: i.cfg.baseUrl })),
    })
  );

  for (const instance of instances) {
    for (const group of ["Gold", "Platinum"]) {
      const customers = await listCustomersByGroup(instance.cfg, group);
      console.log(`${instance.slot} ${group}: ${customers.length} customers`);
      for (const row of customers) {
        stats.scanned += 1;
        const tier = mapGroup(row.customer_group ?? group);
        if (!tier) {
          stats.skipped += 1;
          continue;
        }
        const phone = row.mobile_no?.trim() || row.name?.trim() || null;
        const email = row.email_id?.trim() || null;
        if (!phone && !email) {
          stats.skipped += 1;
          continue;
        }
        const ids = await findContactIds(companyId, email, phone);
        if (ids.length === 0) {
          stats.skipped += 1;
          continue;
        }
        stats.matched += ids.length;
        for (const contactId of ids) {
          const key = `${contactId}:${tier}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const result = await applyTier(contactId, tier);
          if (result === "updated") stats.updated += 1;
          else stats.unchanged += 1;
        }
      }
    }
  }

  console.log(JSON.stringify({ ok: true, ...stats }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
