/**
 * Apply Allocated Merchant Excel → ContactMaster.assignedMerchant (Cosmetics.lk).
 *
 * Columns: PHONE_NUMBER, Allocated Merchant
 * Match: primary phoneNumber + ContactPhone secondaries via phone variants.
 *
 * Usage:
 *   node scripts/with-env.mjs cosmo-prod node scripts/import-allocated-merchants-xlsx.cjs \
 *     --company-id cmn2xcas1002crl5xtgoq28f5 \
 *     --file "c:\Users\Bad-Boy\Downloads\Allocated Merchant- 2026.08.10.xlsx" \
 *     --dry-run --report ./data/allocated-merchant-2026-08-10-dryrun.json
 *
 *   node scripts/with-env.mjs cosmo-prod node scripts/import-allocated-merchants-xlsx.cjs \
 *     --company-id cmn2xcas1002crl5xtgoq28f5 \
 *     --file "c:\Users\Bad-Boy\Downloads\Allocated Merchant- 2026.08.10.xlsx" \
 *     --report ./data/allocated-merchant-2026-08-10-report.json
 *
 * Flags:
 *   --fill-blanks-only   only set when assignedMerchant is currently blank
 *   --no-log             skip ContactAllocationUpdate rows
 */

const { createWriteStream, mkdirSync, writeFileSync } = require("node:fs");
const { dirname } = require("node:path");
const { PrismaClient } = require("@prisma/client");
const XLSX = require("xlsx");

const COMPANY_ID_DEFAULT = "cmn2xcas1002crl5xtgoq28f5";

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
    if (digits.startsWith("94") && digits.length >= 11) {
      out.add(`+${digits}`);
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

function normalizeMerchant(raw) {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 255);
}

function sameMerchant(a, b) {
  return String(a || "")
    .trim()
    .toLowerCase() === String(b || "").trim().toLowerCase();
}

async function loadContactPhoneIndex(prisma, companyId) {
  /** @type {Map<string, Set<string>>} variant -> contactIds */
  const variantToIds = new Map();
  /** @type {Map<string, { id: string, name: string|null, phoneNumber: string|null, assignedMerchant: string|null }>} */
  const contactsById = new Map();

  const pageSize = 5000;
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
      const phones = [
        c.phoneNumber,
        ...c.phones.map((p) => p.phoneNumber),
      ].filter(Boolean);
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const companyId =
    typeof args["company-id"] === "string" ? args["company-id"] : COMPANY_ID_DEFAULT;
  const filePath = typeof args.file === "string" ? args.file : null;
  const dryRun = Boolean(args["dry-run"]);
  const fillBlanksOnly = Boolean(args["fill-blanks-only"]);
  const noLog = Boolean(args["no-log"]);
  const reportPath =
    typeof args.report === "string"
      ? args.report
      : `./data/allocated-merchant-report-${dryRun ? "dryrun-" : ""}${Date.now()}.json`;
  const leftoverCsv =
    typeof args["leftover-csv"] === "string"
      ? args["leftover-csv"]
      : reportPath.replace(/\.json$/i, "-leftovers.csv");

  if (!filePath) {
    console.error("Missing --file <xlsx>");
    process.exit(1);
  }

  const rawUrl = process.env.DATABASE_URL ?? "";
  const prisma = new PrismaClient({
    datasources: {
      db: { url: rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || rawUrl },
    },
  });

  const startedAt = new Date().toISOString();
  console.log(
    `[alloc-import] company=${companyId} file=${filePath} dryRun=${dryRun} fillBlanksOnly=${fillBlanksOnly}`
  );

  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    });
    if (!company) throw new Error(`Company not found: ${companyId}`);

    const wb = XLSX.readFile(filePath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
    console.log(`[alloc-import] excel rows=${rows.length} sheet=${wb.SheetNames[0]}`);

    console.log("[alloc-import] loading contact phone index…");
    const { variantToIds, contactsById } = await loadContactPhoneIndex(prisma, companyId);
    console.log(`[alloc-import] contacts=${contactsById.size} phoneVariants=${variantToIds.size}`);

    const summary = {
      companyId,
      companyName: company.name,
      filePath,
      dryRun,
      fillBlanksOnly,
      startedAt,
      excelRows: rows.length,
      contactsInCompany: contactsById.size,
      updated: 0,
      alreadySame: 0,
      skippedFilled: 0,
      noContact: 0,
      ambiguous: 0,
      blankMerchant: 0,
      blankPhone: 0,
      merchantCounts: {},
    };

    /** @type {Array<Record<string, unknown>>} */
    const leftovers = [];
    /** merchantName -> contactIds to update */
    const updatesByMerchant = new Map();
    /** contactId -> { from, to, phone } for sample log */
    const updateSamples = [];

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const phoneRaw = row.PHONE_NUMBER ?? row.phone_number ?? row.Phone ?? row.phone;
      const merchantRaw =
        row["Allocated Merchant"] ??
        row.allocated_merchant ??
        row.AllocatedMerchant ??
        row.Merchant;

      if (phoneRaw == null || String(phoneRaw).trim() === "") {
        summary.blankPhone += 1;
        leftovers.push({
          excelRow: i + 2,
          phone: null,
          allocatedMerchant: merchantRaw,
          reason: "blank_phone",
        });
        continue;
      }

      const merchant = normalizeMerchant(merchantRaw);
      if (!merchant) {
        summary.blankMerchant += 1;
        leftovers.push({
          excelRow: i + 2,
          phone: String(phoneRaw),
          allocatedMerchant: null,
          reason: "blank_merchant",
        });
        continue;
      }

      const matchIds = resolveContactsForPhone(String(phoneRaw), variantToIds);
      if (matchIds.length === 0) {
        summary.noContact += 1;
        leftovers.push({
          excelRow: i + 2,
          phone: String(phoneRaw),
          phoneKey: canonicalPhoneKey(phoneRaw),
          allocatedMerchant: merchant,
          reason: "no_matching_contact",
        });
        continue;
      }
      if (matchIds.length > 1) {
        summary.ambiguous += 1;
        leftovers.push({
          excelRow: i + 2,
          phone: String(phoneRaw),
          phoneKey: canonicalPhoneKey(phoneRaw),
          allocatedMerchant: merchant,
          reason: "ambiguous_multiple_contacts",
          contactIds: matchIds,
          contactNames: matchIds.map((id) => contactsById.get(id)?.name ?? null),
        });
        continue;
      }

      const contactId = matchIds[0];
      const contact = contactsById.get(contactId);
      if (!contact) {
        summary.noContact += 1;
        leftovers.push({
          excelRow: i + 2,
          phone: String(phoneRaw),
          allocatedMerchant: merchant,
          reason: "no_matching_contact",
        });
        continue;
      }

      if (sameMerchant(contact.assignedMerchant, merchant)) {
        summary.alreadySame += 1;
        continue;
      }

      if (fillBlanksOnly && contact.assignedMerchant?.trim()) {
        summary.skippedFilled += 1;
        leftovers.push({
          excelRow: i + 2,
          phone: String(phoneRaw),
          phoneKey: canonicalPhoneKey(phoneRaw),
          allocatedMerchant: merchant,
          reason: "already_assigned_fill_blanks_only",
          contactId,
          contactName: contact.name,
          currentAssignedMerchant: contact.assignedMerchant,
        });
        continue;
      }

      let list = updatesByMerchant.get(merchant);
      if (!list) {
        list = [];
        updatesByMerchant.set(merchant, list);
      }
      list.push(contactId);
      summary.merchantCounts[merchant] = (summary.merchantCounts[merchant] || 0) + 1;
      if (updateSamples.length < 25) {
        updateSamples.push({
          contactId,
          name: contact.name,
          phone: contact.phoneNumber,
          from: contact.assignedMerchant,
          to: merchant,
        });
      }
      // Keep in-memory assignedMerchant current for leftover Cosmo scan
      contact.assignedMerchant = merchant;
    }

    const contactIdsToUpdate = [...updatesByMerchant.values()].flat();
    summary.wouldUpdate = contactIdsToUpdate.length;
    summary.updateSamples = updateSamples;

    if (!dryRun && contactIdsToUpdate.length > 0) {
      console.log(`[alloc-import] applying updates for ${contactIdsToUpdate.length} contacts…`);
      for (const [merchant, ids] of updatesByMerchant.entries()) {
        const uniqueIds = [...new Set(ids)];
        const chunkSize = 500;
        for (let i = 0; i < uniqueIds.length; i += chunkSize) {
          const chunk = uniqueIds.slice(i, i + chunkSize);
          await prisma.contactMaster.updateMany({
            where: { companyId, id: { in: chunk } },
            data: { assignedMerchant: merchant },
          });
          if (!noLog) {
            await prisma.contactAllocationUpdate.createMany({
              data: chunk.map((contactId) => ({
                companyId,
                contactId,
                merchantId: null,
                merchantName: merchant,
                category: "allocation",
              })),
            });
          }
        }
        console.log(`[alloc-import] merchant=${merchant} updated=${uniqueIds.length}`);
      }
      summary.updated = contactIdsToUpdate.length;
    } else {
      summary.updated = dryRun ? 0 : contactIdsToUpdate.length;
      if (dryRun) summary.wouldUpdate = contactIdsToUpdate.length;
    }

    // Cosmo contacts still without allocation after this run
    const stillUnallocated = [];
    for (const c of contactsById.values()) {
      if (c.assignedMerchant?.trim()) continue;
      const reason = c.phoneNumber?.trim()
        ? "contact_has_no_assigned_merchant"
        : "contact_has_no_phone";
      stillUnallocated.push({
        contactId: c.id,
        name: c.name,
        phone: c.phoneNumber,
        reason,
      });
    }
    summary.cosmoStillUnallocated = stillUnallocated.length;
    summary.cosmoUnallocatedNoPhone = stillUnallocated.filter(
      (r) => r.reason === "contact_has_no_phone"
    ).length;
    summary.cosmoUnallocatedWithPhone = stillUnallocated.filter(
      (r) => r.reason === "contact_has_no_assigned_merchant"
    ).length;

    summary.finishedAt = new Date().toISOString();
    summary.leftoverExcelRows = leftovers.length;

    mkdirSync(dirname(reportPath), { recursive: true });
    const fullReport = {
      summary,
      excelLeftovers: leftovers,
      cosmoStillUnallocated: stillUnallocated,
    };
    writeFileSync(reportPath, `${JSON.stringify(fullReport, null, 2)}\n`, "utf8");

    // CSV for Excel leftovers + cosmo unallocated
    mkdirSync(dirname(leftoverCsv), { recursive: true });
    const csvLines = [
      "source,excelRow,phone,phoneKey,allocatedMerchant,contactId,contactName,currentAssignedMerchant,reason",
    ];
    for (const row of leftovers) {
      csvLines.push(
        [
          "excel",
          row.excelRow ?? "",
          csvEscape(row.phone),
          csvEscape(row.phoneKey),
          csvEscape(row.allocatedMerchant),
          csvEscape(Array.isArray(row.contactIds) ? row.contactIds.join("|") : row.contactId),
          csvEscape(
            Array.isArray(row.contactNames) ? row.contactNames.join("|") : row.contactName
          ),
          csvEscape(row.currentAssignedMerchant),
          csvEscape(row.reason),
        ].join(",")
      );
    }
    for (const row of stillUnallocated) {
      csvLines.push(
        [
          "cosmo",
          "",
          csvEscape(row.phone),
          csvEscape(canonicalPhoneKey(row.phone || "")),
          "",
          csvEscape(row.contactId),
          csvEscape(row.name),
          "",
          csvEscape(row.reason),
        ].join(",")
      );
    }
    writeFileSync(leftoverCsv, `${csvLines.join("\n")}\n`, "utf8");

    console.log(JSON.stringify(summary, null, 2));
    console.log(`[alloc-import] wrote report ${reportPath}`);
    console.log(`[alloc-import] wrote leftovers csv ${leftoverCsv}`);
  } finally {
    await prisma.$disconnect();
  }
}

function csvEscape(value) {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
