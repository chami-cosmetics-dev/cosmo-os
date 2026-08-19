/**
 * Export Adapt invoice rows that import intentionally did not upsert as purchases.
 *
 *   node scripts/with-env.mjs cosmo-prod npx --yes tsx tmp/export-adapt-skipped-rows.ts
 *
 * Source (same as re-import):
 *   C:\Users\Bad-Boy\Downloads\Archive (5)\invoice_data_headers.csv
 */
import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  mapAdaptHeaders,
  rowFromValues,
  cell,
  ADAPT_FIELD,
} from "../lib/adapt-import/columns";
import { iterateCsvRecordsFromFile } from "../lib/adapt-import/csv";
import { classifyAdaptRow } from "../lib/adapt-import/row-classify";

const FILE =
  process.argv.find((a) => a.startsWith("--file="))?.slice("--file=".length) ??
  "C:\\Users\\Bad-Boy\\Downloads\\Archive (5)\\invoice_data_headers.csv";

const OUT_DIR = path.resolve("tmp/adapt-skipped");

function csvEscape(v: string | null | undefined) {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const HEADER = [
  "skip_reason",
  "sales_invoice_master_id",
  "sales_invoice_no",
  "invoice_date",
  "ttl_amount",
  "customer_tp",
  "customer_email",
  "attention_name",
  "location_name",
  "known_name",
  "active_flag",
  "deleted_on",
  "cancel_coment",
] as const;

type Reason =
  | "cancelled_or_deleted"
  | "no_identifier"
  | "bad_amount_or_date";

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const writers: Record<Reason, ReturnType<typeof createWriteStream>> = {
    cancelled_or_deleted: createWriteStream(
      path.join(OUT_DIR, "adapt-skipped-cancelled_or_deleted.csv")
    ),
    no_identifier: createWriteStream(path.join(OUT_DIR, "adapt-skipped-no_identifier.csv")),
    bad_amount_or_date: createWriteStream(
      path.join(OUT_DIR, "adapt-skipped-bad_amount_or_date.csv")
    ),
  };
  const all = createWriteStream(path.join(OUT_DIR, "adapt-skipped-ALL.csv"));

  const headerLine = HEADER.join(",") + "\n";
  for (const w of Object.values(writers)) w.write(headerLine);
  all.write(headerLine);

  const counts: Record<Reason, number> = {
    cancelled_or_deleted: 0,
    no_identifier: 0,
    bad_amount_or_date: 0,
  };

  let rowsRead = 0;
  let headers: string[] | null = null;

  for await (const record of iterateCsvRecordsFromFile(FILE)) {
    if (!headers) {
      headers = mapAdaptHeaders(record);
      continue;
    }

    rowsRead += 1;
    if (rowsRead % 25000 === 0) {
      console.error(`[progress] rowsRead=${rowsRead} skipped=${Object.values(counts).reduce((a, b) => a + b, 0)}`);
    }

    const row = rowFromValues(headers, record);
    const classified = classifyAdaptRow(row);

    let reason: Reason | null = null;
    if (classified.status === "skip") {
      reason = classified.reason as Reason;
    } else if (classified.enrichOnly) {
      reason = "bad_amount_or_date";
    }
    if (!reason) continue;

    counts[reason] += 1;
    const out = {
      skip_reason: reason,
      sales_invoice_master_id: cell(row, ADAPT_FIELD.salesInvoiceMasterId) ?? "",
      sales_invoice_no: cell(row, ADAPT_FIELD.salesInvoiceNo) ?? "",
      invoice_date: cell(row, ADAPT_FIELD.invoiceDate) ?? "",
      ttl_amount: cell(row, ADAPT_FIELD.ttlAmount) ?? "",
      customer_tp:
        cell(row, ADAPT_FIELD.customerTp) ?? cell(row, ADAPT_FIELD.customerTpRaw) ?? "",
      customer_email: cell(row, ADAPT_FIELD.customerEmail) ?? "",
      attention_name: cell(row, ADAPT_FIELD.attentionName) ?? "",
      location_name: cell(row, ADAPT_FIELD.locationName) ?? "",
      known_name: cell(row, ADAPT_FIELD.knownName) ?? "",
      active_flag: cell(row, ADAPT_FIELD.activeFlag) ?? "",
      deleted_on: cell(row, ADAPT_FIELD.deletedOn) ?? "",
      cancel_coment: cell(row, ADAPT_FIELD.cancelComent) ?? "",
    };
    const lineOut = HEADER.map((h) => csvEscape(out[h])).join(",") + "\n";
    writers[reason].write(lineOut);
    all.write(lineOut);
  }

  await Promise.all(
    [...Object.values(writers), all].map(
      (w) =>
        new Promise<void>((resolve, reject) => {
          w.end(() => resolve());
          w.on("error", reject);
        })
    )
  );

  const summary = {
    file: FILE,
    rowsRead,
    skippedPurchases: counts,
    totalSkipped: Object.values(counts).reduce((a, b) => a + b, 0),
    note:
      "ambiguous (~225) were counted in import report but purchases still upserted to one matched contact — not in these drop files.",
    files: {
      all: path.join(OUT_DIR, "adapt-skipped-ALL.csv"),
      cancelled_or_deleted: path.join(OUT_DIR, "adapt-skipped-cancelled_or_deleted.csv"),
      no_identifier: path.join(OUT_DIR, "adapt-skipped-no_identifier.csv"),
      bad_amount_or_date: path.join(OUT_DIR, "adapt-skipped-bad_amount_or_date.csv"),
    },
  };
  writeFileSync(path.join(OUT_DIR, "SUMMARY.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
