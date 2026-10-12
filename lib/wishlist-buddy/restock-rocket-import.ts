/** Parsing for the Restock Rocket "requests" CSV export. Pure: no DB, no network. */

import { canonicalPhoneForErpCustomerId } from "@/lib/phone-lookup";

export const RESTOCK_ROCKET_HEADERS = [
  "Customer contact",
  "Customer name",
  "Product name",
  "Subscription status",
  "Product SKU",
  "Accepts marketing",
  "Quantity",
  "Requested at",
] as const;

export type RestockRocketRequest = {
  /** 1-based line in the file (header is line 1). */
  line: number;
  name: string;
  email: string | null;
  phone: string | null;
  sku: string;
  productName: string;
  quantity: number | null;
  acceptsMarketing: boolean | null;
  requestedAt: Date | null;
  /** Original `Requested at` text (dd/mm/yyyy). */
  requestedAtRaw: string;
  externalRef: string;
};

export type RestockRocketParseResult = {
  requests: RestockRocketRequest[];
  skipped: Array<{ line: number; reason: string }>;
};

/** RFC 4180-style CSV: quoted fields, doubled quotes, commas/newlines inside quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += c;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

/** `dd/mm/yyyy` as midnight Asia/Colombo (+05:30). */
export function parseRestockRocketDate(raw: string): Date | null {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const day = Number(d);
  const month = Number(mo);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(`${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}T00:00:00+05:30`);
  return Number.isNaN(date.getTime()) ? null : date;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseRestockRocketCsv(text: string): RestockRocketParseResult {
  const rows = parseCsv(text);
  const header = (rows[0] ?? []).map((h) => h.trim());
  const missing = RESTOCK_ROCKET_HEADERS.filter((h) => !header.includes(h));
  if (missing.length > 0) {
    throw new Error(`Not a Restock Rocket requests export: missing column(s) ${missing.join(", ")}`);
  }
  const col = (name: (typeof RESTOCK_ROCKET_HEADERS)[number]) => header.indexOf(name);

  const requests: RestockRocketRequest[] = [];
  const skipped: RestockRocketParseResult["skipped"] = [];
  const seenRefs = new Set<string>();

  rows.slice(1).forEach((cells, i) => {
    const line = i + 2;
    if (!cells.some((c) => c.trim())) return;
    const get = (name: (typeof RESTOCK_ROCKET_HEADERS)[number]) => (cells[col(name)] ?? "").trim();

    const status = get("Subscription status");
    if (status.toLowerCase() !== "subscribed") {
      skipped.push({ line, reason: `status "${status || "(empty)"}"` });
      return;
    }
    const sku = get("Product SKU");
    if (!sku) {
      skipped.push({ line, reason: "no SKU" });
      return;
    }

    const contact = get("Customer contact");
    let email: string | null = null;
    let phone: string | null = null;
    if (contact.includes("@")) {
      const lower = contact.toLowerCase();
      if (!EMAIL_RE.test(lower)) {
        skipped.push({ line, reason: "invalid email" });
        return;
      }
      email = lower;
    } else {
      phone = canonicalPhoneForErpCustomerId(contact);
      if (!phone) {
        skipped.push({ line, reason: "invalid phone" });
        return;
      }
    }

    const externalRef = `restockrocket:${email ?? phone}|${sku}`;
    if (seenRefs.has(externalRef)) {
      skipped.push({ line, reason: "duplicate of an earlier line (same contact + SKU)" });
      return;
    }
    seenRefs.add(externalRef);

    const qty = Number(get("Quantity"));
    const marketing = get("Accepts marketing").toLowerCase();
    requests.push({
      line,
      name: get("Customer name") || "Customer",
      email,
      phone,
      sku,
      productName: get("Product name") || sku,
      quantity: Number.isFinite(qty) && qty > 0 ? qty : null,
      acceptsMarketing: marketing === "yes" ? true : marketing === "no" ? false : null,
      requestedAt: parseRestockRocketDate(get("Requested at")),
      requestedAtRaw: get("Requested at"),
      externalRef,
    });
  });

  return { requests, skipped };
}

export function restockRocketRemark(request: RestockRocketRequest): string {
  const parts = ["Imported from Restock Rocket"];
  if (request.requestedAtRaw) parts.push(`requested ${request.requestedAtRaw}`);
  if (request.quantity && request.quantity > 1) parts.push(`qty ${request.quantity}`);
  if (request.acceptsMarketing !== null) parts.push(`accepts marketing: ${request.acceptsMarketing ? "yes" : "no"}`);
  return parts.join(", ");
}
