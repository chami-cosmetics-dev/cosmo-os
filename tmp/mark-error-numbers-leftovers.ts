/**
 * Resolve leftover Dilhan error-number rows (Excel float-rounded phones).
 *
 *   node scripts/with-env.mjs cosmo-prod npx tsx tmp/mark-error-numbers-leftovers.ts --dry-run
 *   node scripts/with-env.mjs cosmo-prod npx tsx tmp/mark-error-numbers-leftovers.ts --apply
 */
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";

const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";
const FILE = "C:/Users/Bad-Boy/Downloads/Error Numbers_Dilhan_2026.11.10.xlsx";
const ERROR_NUMBER = "ERROR NUMBER";
const APPLY = process.argv.includes("--apply");

const LEFTOVER_ROWS = new Set([89, 93, 94, 96, 97, 98, 104, 108, 110, 111, 112, 114]);

function normName(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function phoneDigits(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value).toString();
  }
  return String(value ?? "").replace(/\D/g, "");
}

function stripLeadingZeros(digits: string) {
  const stripped = digits.replace(/^0+/, "");
  return stripped || "0";
}

function commonPrefixLen(a: string, b: string) {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i += 1;
  return i;
}

/** Best same-name contact for an Excel-corrupted phone. */
function bestPhoneMatch(
  named: Array<{ id: string; phoneNumber: string | null; assignedMerchant: string | null }>,
  excelPhone: unknown,
): { ids: string[]; score: number; phones: Array<string | null> } | null {
  const excel = stripLeadingZeros(phoneDigits(excelPhone));
  if (!excel || excel === "0") return null;

  const scored = named
    .map((c) => {
      const digits = stripLeadingZeros(phoneDigits(c.phoneNumber));
      const score = Math.max(
        commonPrefixLen(excel, digits),
        // Excel may have dropped a leading 0 / 00 international dial prefix on DB side.
        commonPrefixLen(excel, digits.replace(/^94/, "")),
        commonPrefixLen(excel.replace(/^94/, ""), digits),
      );
      return { contact: c, score, digits };
    })
    .filter((row) => row.score >= 5)
    .sort((a, b) => b.score - a.score || phoneDigits(a.contact.phoneNumber).length - phoneDigits(b.contact.phoneNumber).length);

  if (scored.length === 0) return null;
  const top = scored[0]!.score;
  const winners = scored.filter((row) => row.score === top);
  // Same phone stored with/without +00 — treat as one logical contact set.
  const uniquePhones = new Set(winners.map((w) => w.digits));
  if (uniquePhones.size === 1) {
    return {
      ids: winners.map((w) => w.contact.id),
      score: top,
      phones: winners.map((w) => w.contact.phoneNumber),
    };
  }
  if (winners.length === 1) {
    return {
      ids: [winners[0]!.contact.id],
      score: top,
      phones: [winners[0]!.contact.phoneNumber],
    };
  }
  return null;
}

type ContactHit = {
  id: string;
  name: string;
  phoneNumber: string | null;
  assignedMerchant: string | null;
};

async function main() {
  const rawUrl = process.env.DATABASE_URL ?? "";
  const prisma = new PrismaClient({
    datasources: {
      db: { url: rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || rawUrl },
    },
  });

  try {
    const wb = XLSX.readFile(FILE);
    const sheet = wb.Sheets[wb.SheetNames[0]!];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: null,
      raw: true,
    });

    console.log("Loading contacts…");
    const contacts: ContactHit[] = [];
    const pageSize = 5000;
    let cursor: string | null = null;
    for (;;) {
      const batch = await prisma.contactMaster.findMany({
        where: { companyId: COMPANY_ID },
        take: pageSize,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: "asc" },
        select: { id: true, name: true, phoneNumber: true, assignedMerchant: true },
      });
      if (batch.length === 0) break;
      contacts.push(...batch);
      cursor = batch[batch.length - 1]!.id;
      if (batch.length < pageSize) break;
    }
    console.log(`contacts=${contacts.length}`);

    const byName = new Map<string, ContactHit[]>();
    for (const contact of contacts) {
      const key = normName(contact.name);
      if (!key) continue;
      const list = byName.get(key) ?? [];
      list.push(contact);
      byName.set(key, list);
    }

    const summary = { total: 0, updated: 0, already: 0, missing: 0, ambiguous: 0 };
    const leftovers: Array<Record<string, unknown>> = [];
    const toUpdate: string[] = [];
    const resolved: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();

    for (let i = 0; i < rows.length; i += 1) {
      const excelRow = i + 2;
      if (!LEFTOVER_ROWS.has(excelRow)) continue;
      summary.total += 1;
      const row = rows[i]!;
      const nameKey = normName(row.NAME);
      const named = byName.get(nameKey) ?? [];

      let ids: string[] = [];
      let phones: Array<string | null> = [];
      let score = 0;

      // Unique exact name + junk phone (ess+)
      if (named.length === 1 && !/\d/.test(String(row.PHONE_NUMBER ?? ""))) {
        ids = [named[0]!.id];
        phones = [named[0]!.phoneNumber];
        score = 99;
      } else {
        const match = bestPhoneMatch(named, row.PHONE_NUMBER);
        if (match) {
          ids = match.ids;
          phones = match.phones;
          score = match.score;
        }
      }

      if (ids.length === 0) {
        summary.missing += 1;
        leftovers.push({
          excelRow,
          contactNo: row.CONTACT_NO,
          name: row.NAME,
          phone: row.PHONE_NUMBER,
          reason: "no_match",
          nameHits: named.length,
          samplePhones: named.slice(0, 8).map((c) => c.phoneNumber),
        });
        continue;
      }

      for (const id of ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        const contact = named.find((c) => c.id === id)!;
        if ((contact.assignedMerchant ?? "").trim().toUpperCase() === ERROR_NUMBER) {
          summary.already += 1;
          resolved.push({ excelRow, contactId: id, phone: contact.phoneNumber, score, status: "already" });
          continue;
        }
        toUpdate.push(id);
        summary.updated += 1;
        resolved.push({
          excelRow,
          contactId: id,
          name: contact.name,
          phone: contact.phoneNumber,
          from: contact.assignedMerchant,
          score,
          status: "update",
        });
      }
    }

    const reportPath = `tmp/error-numbers-leftovers-${APPLY ? "apply" : "dryrun"}.json`;
    writeFileSync(
      reportPath,
      JSON.stringify({ summary, resolved, leftovers, toUpdate }, null, 2),
    );
    console.log(JSON.stringify({ summary, resolved, leftovers }, null, 2));
    console.log(`report=${reportPath}`);

    if (!APPLY) {
      console.log("Dry run only. Pass --apply to write.");
      return;
    }

    if (toUpdate.length === 0) {
      console.log("Nothing to apply.");
      return;
    }

    await prisma.contactMaster.updateMany({
      where: { companyId: COMPANY_ID, id: { in: toUpdate } },
      data: { assignedMerchant: ERROR_NUMBER },
    });
    await prisma.contactAllocationUpdate.createMany({
      data: toUpdate.map((contactId) => ({
        companyId: COMPANY_ID,
        contactId,
        merchantId: null,
        merchantName: ERROR_NUMBER,
        category: "allocation",
      })),
    });
    console.log(`applied=${toUpdate.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
