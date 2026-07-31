import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

import { mapAdaptHeaders, rowFromValues } from "@/lib/adapt-import/columns";
import { resolveAdaptContact } from "@/lib/adapt-import/contact-resolve";
import type { AdaptImportDb } from "@/lib/adapt-import/db";
import {
  loadAdaptLocationMapFile,
  resolveAdaptCompanyLocationId,
  type CompanyLocationLike,
} from "@/lib/adapt-import/location-map";
import { persistAdaptPurchaseRow } from "@/lib/adapt-import/persist";
import { classifyAdaptRow } from "@/lib/adapt-import/row-classify";
import {
  emptyAdaptImportReport,
  type AdaptImportReport,
  type AdaptLocationMapEntry,
} from "@/lib/adapt-import/types";

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      values.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  values.push(current);
  return values;
}

export type RunAdaptImportInput = {
  companyId: string;
  filePath: string;
  db: AdaptImportDb;
  dryRun?: boolean;
  mapPath?: string | null;
  resumeKeys?: Set<string>;
  checkpointKeys?: Set<string>;
  batchSize?: number;
  importBatchId?: string | null;
  limit?: number | null;
};

export async function runAdaptImport(
  input: RunAdaptImportInput
): Promise<AdaptImportReport> {
  const db = input.db;
  const dryRun = Boolean(input.dryRun);
  const report = emptyAdaptImportReport(input.companyId, dryRun);
  const resume = input.resumeKeys ?? new Set<string>();
  const checkpoint = input.checkpointKeys;

  const company = await db.company.findUnique({
    where: { id: input.companyId },
    select: { id: true },
  });
  if (!company) {
    throw new Error(`Company not found: ${input.companyId}`);
  }

  const locations: CompanyLocationLike[] = await db.companyLocation.findMany({
    where: { companyId: input.companyId },
    select: { id: true, name: true, shortName: true, locationReference: true },
  });

  let map: AdaptLocationMapEntry[] = [];
  if (input.mapPath) {
    map = loadAdaptLocationMapFile(input.mapPath);
  }

  const rl = createInterface({
    input: createReadStream(input.filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let headers: string[] | null = null;
  let processed = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    if (!headers) {
      headers = mapAdaptHeaders(parseCsvLine(line));
      continue;
    }

    if (input.limit != null && processed >= input.limit) break;
    processed += 1;
    report.rowsRead += 1;

    try {
      const row = rowFromValues(headers, parseCsvLine(line));
      const classified = classifyAdaptRow(row);

      if (classified.status === "skip") {
        report.skipped += 1;
        report.skipReasons[classified.reason] += 1;
        continue;
      }

      if (classified.enrichOnly) {
        report.skipped += 1;
        report.skipReasons.bad_amount_or_date += 1;
      }

      if (classified.salesInvoiceMasterId) {
        const midKey = `mid:${classified.salesInvoiceMasterId}`;
        if (resume.has(midKey)) continue;
      }

      const resolved = await resolveAdaptContact({
        companyId: input.companyId,
        phone: classified.phone,
        email: classified.email,
        db,
      });

      if (resolved.status === "match" && resolved.ambiguous) {
        report.ambiguous += 1;
        report.skipReasons.ambiguous += 1;
      }

      const companyLocationId = resolveAdaptCompanyLocationId({
        salesLocationId: classified.salesLocationId,
        locationName: classified.locationName,
        map,
        locations,
      });

      const persist = await persistAdaptPurchaseRow({
        companyId: input.companyId,
        classified,
        companyLocationId,
        contactId: resolved.status === "match" ? resolved.contact.id : null,
        dryRun,
        importBatchId: input.importBatchId,
        db,
      });

      if (persist.contactAction === "created") {
        if (dryRun) report.contactsWouldCreate += 1;
        else report.contactsCreated += 1;
      } else if (persist.contactAction === "enriched") {
        if (dryRun) report.contactsWouldEnrich += 1;
        else report.contactsEnriched += 1;
      }

      if (persist.status === "upserted") {
        if (dryRun) report.purchasesWouldUpsert += 1;
        else {
          report.purchasesUpserted += 1;
          if (classified.salesInvoiceMasterId) {
            checkpoint?.add(`mid:${classified.salesInvoiceMasterId}`);
          }
        }
      }
    } catch {
      report.failed += 1;
    }
  }

  return report;
}
