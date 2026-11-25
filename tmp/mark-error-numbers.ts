/**
 * Mark Dilhan Error Numbers xlsx → ContactMaster.assignedMerchant = ERROR NUMBER.
 *
 * Excel often drops leading zeros (22 vs 0000022). Match = same name + same
 * significant phone digits.
 *
 *   node scripts/with-env.mjs cosmo-prod npx tsx tmp/mark-error-numbers.ts --dry-run
 *   node scripts/with-env.mjs cosmo-prod npx tsx tmp/mark-error-numbers.ts --apply
 */
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";

const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";
const FILE =
  process.env.ERROR_NUMBERS_FILE ??
  "C:/Users/Bad-Boy/Downloads/Error Numbers_Dilhan_2026.11.10.xlsx";
const ERROR_NUMBER = "ERROR NUMBER";
const APPLY = process.argv.includes("--apply");

function normName(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Digits only, strip leading zeros; all-zero → "0". */
function significantDigits(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  const stripped = digits.replace(/^0+/, "");
  return stripped || "0";
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
      raw: false,
    });
    console.log(`rows=${rows.length} apply=${APPLY}`);

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

    const summary = {
      total: rows.length,
      updated: 0,
      already: 0,
      missing: 0,
      ambiguous: 0,
    };
    const leftovers: Array<Record<string, unknown>> = [];
    const toUpdate: string[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]!;
      const nameKey = normName(row.NAME);
      const phoneKey = significantDigits(row.PHONE_NUMBER);
      const contactNo = row.CONTACT_NO;

      if (!nameKey || !phoneKey) {
        summary.missing += 1;
        leftovers.push({
          row: i + 2,
          contactNo,
          phone: row.PHONE_NUMBER,
          name: row.NAME,
          reason: "blank_phone_or_name",
        });
        continue;
      }

      const named = byName.get(nameKey) ?? [];
      let hits = named.filter((c) => significantDigits(c.phoneNumber) === phoneKey);

      // Excel scientific notation / junk phones — fall back to unique exact name.
      const phoneLooksBroken =
        /e\+/i.test(String(row.PHONE_NUMBER ?? "")) ||
        /[a-z+]/i.test(String(row.PHONE_NUMBER ?? "").replace(/\s/g, ""));
      if (hits.length === 0 && phoneLooksBroken && named.length === 1) {
        hits = named;
      }

      if (hits.length === 0) {
        summary.missing += 1;
        leftovers.push({
          row: i + 2,
          contactNo,
          phone: row.PHONE_NUMBER,
          phoneKey,
          name: row.NAME,
          reason: "no_match",
          nameHits: named.length,
        });
        continue;
      }

      if (hits.length > 1) {
        summary.ambiguous += 1;
        leftovers.push({
          row: i + 2,
          contactNo,
          phone: row.PHONE_NUMBER,
          phoneKey,
          name: row.NAME,
          reason: "ambiguous",
          ids: hits.map((h) => h.id),
          phones: hits.map((h) => h.phoneNumber),
        });
        continue;
      }

      const contact = hits[0]!;
      if (seen.has(contact.id)) {
        summary.already += 1;
        continue;
      }
      if ((contact.assignedMerchant ?? "").trim().toUpperCase() === ERROR_NUMBER) {
        summary.already += 1;
        seen.add(contact.id);
        continue;
      }
      seen.add(contact.id);
      toUpdate.push(contact.id);
      summary.updated += 1;
    }

    const reportPath = `tmp/error-numbers-mark-${APPLY ? "apply" : "dryrun"}.json`;
    writeFileSync(
      reportPath,
      JSON.stringify({ summary, leftovers, toUpdateCount: toUpdate.length }, null, 2),
    );
    console.log(JSON.stringify(summary, null, 2));
    console.log(`leftovers=${leftovers.length} report=${reportPath}`);

    if (!APPLY) {
      console.log("Dry run only. Pass --apply to write.");
      return;
    }

    for (let i = 0; i < toUpdate.length; i += 200) {
      const chunk = toUpdate.slice(i, i + 200);
      await prisma.contactMaster.updateMany({
        where: { companyId: COMPANY_ID, id: { in: chunk } },
        data: { assignedMerchant: ERROR_NUMBER },
      });
      await prisma.contactAllocationUpdate.createMany({
        data: chunk.map((contactId) => ({
          companyId: COMPANY_ID,
          contactId,
          merchantId: null,
          merchantName: ERROR_NUMBER,
          category: "allocation",
        })),
      });
    }
    console.log(`applied=${toUpdate.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
