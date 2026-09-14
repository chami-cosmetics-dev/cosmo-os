/**
 * Import Vault OS contact lists (Cosmetics Excel export) → create missing contacts
 * and set assignedMerchant to owner MER code (overwrite existing allocation).
 *
 * Usage:
 *   node scripts/with-env.mjs vault node scripts/import-vault-contact-list-allocations.cjs --dry-run
 *   node scripts/with-env.mjs vault node scripts/import-vault-contact-list-allocations.cjs \
 *     --report ./data/vault-contact-list-alloc-2026-09-12.json
 */

const { mkdirSync, writeFileSync } = require("node:fs");
const { dirname } = require("node:path");
const { PrismaClient } = require("@prisma/client");
const XLSX = require("xlsx");

const VAULT_COMPANY_ID = "cmp5k145c006irlhemjfidlb5";

const DEFAULT_SOURCES = [
  {
    label: "Nimthera",
    file: "c:\\Users\\Bad-Boy\\Downloads\\Contacts for Nimthera 12 Sep 26.xlsx",
    assignedMerchant: "MER109",
  },
  {
    label: "Dinuli",
    file: "c:\\Users\\Bad-Boy\\Downloads\\Contacts for Dinuli 12 Sep 26.xlsx",
    assignedMerchant: "MER99",
  },
];

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
    const digits = phoneDigitsOnly(variant);
    if (!digits) continue;
    out.add(`+${digits}`);
  }
  return [...out].filter((s) => s.length > 0 && s.length <= 40);
}

function canonicalPhoneKey(raw) {
  const d = phoneDigitsOnly(raw);
  if (!d) return null;
  if (d.length === 9) return d;
  if (d.length === 10 && d.startsWith("0")) return d.slice(1);
  if (d.length === 11 && d.startsWith("94")) return d.slice(2);
  if (d.length === 12 && d.startsWith("940")) return d.slice(3);
  return d;
}

function normalizeStoredPhone(raw) {
  const key = canonicalPhoneKey(raw);
  if (!key) return null;
  return `0${key}`;
}

function normalizeEmail(raw) {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  return v && v.includes("@") ? v.slice(0, 255) : null;
}

function normalizeName(raw, phoneFallback) {
  const name = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (name) return name.slice(0, 255);
  return phoneFallback ? `Customer ${phoneFallback}` : "Unknown customer";
}

function sameMerchant(a, b) {
  return String(a || "")
    .trim()
    .toLowerCase() === String(b || "").trim().toLowerCase();
}

function loadExcelRows(filePath) {
  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames.find((n) => /allocated/i.test(n)) ?? wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, range: 1 });
  return { sheetName, rows };
}

async function loadContactPhoneIndex(prisma, companyId) {
  /** @type {Map<string, Set<string>>} */
  const variantToIds = new Map();
  /** @type {Map<string, { id: string, name: string|null, phoneNumber: string|null, assignedMerchant: string|null }>} */
  const contactsById = new Map();

  const pageSize = 2000;
  let cursor = null;
  for (;;) {
    const batch = await prisma.contactMaster.findMany({
      where: { companyId },
      take: pageSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        assignedMerchant: true,
        phones: { select: { phoneNumber: true } },
      },
    });
    if (batch.length === 0) break;
    for (const c of batch) {
      contactsById.set(c.id, {
        id: c.id,
        name: c.name,
        phoneNumber: c.phoneNumber,
        assignedMerchant: c.assignedMerchant,
      });
      const phones = [c.phoneNumber, ...c.phones.map((p) => p.phoneNumber)].filter(Boolean);
      for (const phone of phones) {
        for (const variant of buildPhoneLookupVariants(phone)) {
          let set = variantToIds.get(variant);
          if (!set) {
            set = new Set();
            variantToIds.set(variant, set);
          }
          set.add(c.id);
        }
      }
    }
    cursor = batch[batch.length - 1].id;
    if (batch.length < pageSize) break;
  }

  return { variantToIds, contactsById };
}

function resolveContactsForPhone(phoneRaw, variantToIds) {
  const ids = new Set();
  for (const variant of buildPhoneLookupVariants(phoneRaw)) {
    const hit = variantToIds.get(variant);
    if (hit) for (const id of hit) ids.add(id);
  }
  return [...ids];
}

function indexContactPhones(contact, variantToIds) {
  const phones = [contact.phoneNumber].filter(Boolean);
  for (const phone of phones) {
    for (const variant of buildPhoneLookupVariants(phone)) {
      let set = variantToIds.get(variant);
      if (!set) {
        set = new Set();
        variantToIds.set(variant, set);
      }
      set.add(contact.id);
    }
  }
}

function parseSources(rowsByFile) {
  /** @type {Map<string, { sourceLabel: string, assignedMerchant: string, name: string, email: string|null, phone: string, excelRow: number }>} */
  const byPhoneKey = new Map();

  for (const source of DEFAULT_SOURCES) {
    const { rows } = loadExcelRows(source.file);
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const phoneRaw = row["Telephone Number"] ?? row.phone ?? row.Phone;
      if (phoneRaw == null || String(phoneRaw).trim() === "") continue;

      const phone = normalizeStoredPhone(phoneRaw);
      const phoneKey = canonicalPhoneKey(phoneRaw);
      if (!phone || !phoneKey) continue;

      const name = normalizeName(row["Customer Name"], phone);
      const email = normalizeEmail(row.email ?? row.Email);

      const entry = {
        sourceLabel: source.label,
        assignedMerchant: source.assignedMerchant,
        name,
        email,
        phone,
        excelRow: i + 3,
      };

      const prev = byPhoneKey.get(phoneKey);
      if (prev && prev.assignedMerchant !== entry.assignedMerchant) {
        entry.conflict = `${prev.sourceLabel} vs ${source.label}`;
      }
      byPhoneKey.set(phoneKey, entry);
    }
    rowsByFile.push({ source: source.label, file: source.file, excelRows: rows.length });
  }

  return byPhoneKey;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = Boolean(args["dry-run"]);
  const reportPath =
    typeof args.report === "string"
      ? args.report
      : `./data/vault-contact-list-alloc-${dryRun ? "dryrun-" : ""}2026-09-12.json`;

  const rawUrl = process.env.DATABASE_URL ?? "";
  const prisma = new PrismaClient({
    datasources: {
      db: { url: rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || rawUrl },
    },
  });

  const summary = {
    companyId: VAULT_COMPANY_ID,
    dryRun,
    startedAt: new Date().toISOString(),
    sources: [],
    excelUniquePhones: 0,
    created: 0,
    allocatedUpdated: 0,
    alreadyOnTargetMer: 0,
    ambiguous: 0,
    skippedNoPhone: 0,
    byMerchant: {},
  };

  /** @type {Array<Record<string, unknown>>} */
  const issues = [];

  try {
    const company = await prisma.company.findUnique({
      where: { id: VAULT_COMPANY_ID },
      select: { id: true, name: true },
    });
    if (!company) throw new Error(`Company not found: ${VAULT_COMPANY_ID}`);

    const rowsByFile = [];
    const entries = parseSources(rowsByFile);
    summary.sources = rowsByFile;
    summary.excelUniquePhones = entries.size;

    console.log(`[vault-contact-list] company=${company.name} uniquePhones=${entries.size} dryRun=${dryRun}`);
    console.log("[vault-contact-list] loading contact index…");
    const { variantToIds, contactsById } = await loadContactPhoneIndex(prisma, VAULT_COMPANY_ID);

    /** contactId -> assignedMerchant */
    const allocationUpdates = new Map();
    /** pending creates keyed by phoneKey */
    const pendingCreates = [];

    for (const [phoneKey, entry] of entries) {
      if (entry.conflict) {
        issues.push({ phoneKey, ...entry, reason: "phone_in_both_lists_different_mer" });
        continue;
      }

      const matchIds = resolveContactsForPhone(entry.phone, variantToIds);
      if (matchIds.length > 1) {
        summary.ambiguous += 1;
        issues.push({
          phoneKey,
          phone: entry.phone,
          assignedMerchant: entry.assignedMerchant,
          reason: "ambiguous_multiple_contacts",
          contactIds: matchIds,
        });
        continue;
      }

      let contactId = matchIds[0];
      if (!contactId) {
        pendingCreates.push({ phoneKey, ...entry });
        continue;
      }

      const contact = contactsById.get(contactId);
      if (!contact) continue;

      if (sameMerchant(contact.assignedMerchant, entry.assignedMerchant)) {
        summary.alreadyOnTargetMer += 1;
      } else {
        allocationUpdates.set(contactId, entry.assignedMerchant);
        summary.byMerchant[entry.assignedMerchant] =
          (summary.byMerchant[entry.assignedMerchant] || 0) + 1;
      }
    }

    console.log(
      `[vault-contact-list] existing=${entries.size - pendingCreates.length - summary.ambiguous} ` +
        `toCreate=${pendingCreates.length} toRealloc=${allocationUpdates.size}`
    );

    if (!dryRun) {
      const createChunk = 200;
      for (let i = 0; i < pendingCreates.length; i += createChunk) {
        const chunk = pendingCreates.slice(i, i + createChunk);
        for (const row of chunk) {
          const created = await prisma.contactMaster.create({
            data: {
              companyId: VAULT_COMPANY_ID,
              name: row.name,
              email: row.email,
              phoneNumber: row.phone,
              assignedMerchant: row.assignedMerchant,
              source: `vault-contact-list:${row.sourceLabel}`,
            },
            select: { id: true, phoneNumber: true, assignedMerchant: true, name: true },
          });
          contactsById.set(created.id, {
            id: created.id,
            name: created.name,
            phoneNumber: created.phoneNumber,
            assignedMerchant: created.assignedMerchant,
          });
          indexContactPhones(
            { id: created.id, phoneNumber: created.phoneNumber },
            variantToIds
          );
          summary.created += 1;
          summary.byMerchant[row.assignedMerchant] =
            (summary.byMerchant[row.assignedMerchant] || 0) + 1;

          await prisma.contactAllocationUpdate.create({
            data: {
              companyId: VAULT_COMPANY_ID,
              contactId: created.id,
              merchantId: null,
              merchantName: row.assignedMerchant,
              category: "allocation",
            },
          });
        }
        console.log(`[vault-contact-list] created ${Math.min(i + createChunk, pendingCreates.length)}/${pendingCreates.length}`);
      }

      /** @type {Map<string, string[]>} */
      const idsByMerchant = new Map();
      for (const [contactId, merchant] of allocationUpdates) {
        const list = idsByMerchant.get(merchant) ?? [];
        list.push(contactId);
        idsByMerchant.set(merchant, list);
      }

      for (const [merchant, ids] of idsByMerchant) {
        const uniqueIds = [...new Set(ids)];
        for (let i = 0; i < uniqueIds.length; i += 500) {
          const part = uniqueIds.slice(i, i + 500);
          await prisma.contactMaster.updateMany({
            where: { companyId: VAULT_COMPANY_ID, id: { in: part } },
            data: { assignedMerchant: merchant },
          });
          await prisma.contactAllocationUpdate.createMany({
            data: part.map((contactId) => ({
              companyId: VAULT_COMPANY_ID,
              contactId,
              merchantId: null,
              merchantName: merchant,
              category: "allocation",
            })),
          });
        }
        summary.allocatedUpdated += uniqueIds.length;
        console.log(`[vault-contact-list] reallocated merchant=${merchant} count=${uniqueIds.length}`);
      }
    } else {
      summary.wouldCreate = pendingCreates.length;
      summary.wouldRealloc = allocationUpdates.size;
    }

    summary.finishedAt = new Date().toISOString();
    summary.issueCount = issues.length;

    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(
      reportPath,
      `${JSON.stringify({ summary, issues: issues.slice(0, 500) }, null, 2)}\n`,
      "utf8"
    );
    console.log(JSON.stringify(summary, null, 2));
    console.log(`[vault-contact-list] report ${reportPath}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
