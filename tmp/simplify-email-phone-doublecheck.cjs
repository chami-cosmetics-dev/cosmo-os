/**
 * Build a simpler human-readable version of the double-check CSV.
 *
 *   node tmp/simplify-email-phone-doublecheck.cjs
 */
const fs = require("fs");
const path = require("path");

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

function esc(v) {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const src = path.resolve("tmp/cosmo-email-only-vs-phone-doublecheck.csv");
const rows = parseCsv(fs.readFileSync(src, "utf8"));
const header = rows[0];
const idx = Object.fromEntries(header.map((h, i) => [h, i]));
const get = (r, k) => r[idx[k]] ?? "";

const simpleHeader = [
  "verdict",
  "what_to_do",
  "email_card_name",
  "email_card_email",
  "phone_card_name",
  "phone_card_phone",
  "erp_name",
  "names_look_same",
  "email_card_web_orders",
  "phone_card_adapt_invoices",
  "email_card_id",
  "phone_card_id",
];

const outRows = [];
const counts = {};

for (const r of rows.slice(1)) {
  if (!r.length || !get(r, "email_only_contact_id")) continue;
  const likely = get(r, "same_person_likely");
  counts[likely] = (counts[likely] || 0) + 1;

  let what = get(r, "merge_recommendation");
  if (what === "candidate_merge_into_phone_contact") what = "SAME PERSON — merge email card into phone card";
  else if (what === "manual_review") what = "CHECK MANUALLY — names partly match";
  else if (what === "do_not_merge_name_mismatch") what = "DO NOT MERGE — different names";
  else if (what === "do_not_merge_shared_email") what = "DO NOT MERGE — shared/shop email";

  outRows.push({
    verdict: likely === "yes" ? "SAME" : likely === "maybe" ? "MAYBE" : "NO",
    what_to_do: what,
    email_card_name: get(r, "email_only_name"),
    email_card_email: get(r, "email_only_email"),
    phone_card_name: get(r, "phone_contact_name"),
    phone_card_phone: get(r, "phone_contact_phone"),
    erp_name: get(r, "erp_customer_name"),
    names_look_same: get(r, "names_equal_normalized") === "yes" ? "YES" : "no",
    email_card_web_orders: get(r, "email_only_cosmo_order_count"),
    phone_card_adapt_invoices: get(r, "phone_contact_adapt_count"),
    email_card_id: get(r, "email_only_contact_id"),
    phone_card_id: get(r, "phone_contact_id"),
  });
}

outRows.sort((a, b) => a.verdict.localeCompare(b.verdict) || a.email_card_name.localeCompare(b.email_card_name));

const lines = [simpleHeader.join(",")];
for (const row of outRows) {
  lines.push(simpleHeader.map((h) => esc(row[h])).join(","));
}

const out = path.resolve("tmp/cosmo-split-contacts-SIMPLE.csv");
fs.writeFileSync(out, lines.join("\n"), "utf8");

const guide = path.resolve("tmp/cosmo-split-contacts-README.txt");
fs.writeFileSync(
  guide,
  `Cosmo split contacts — how to read the CSV
==========================================

File: cosmo-split-contacts-SIMPLE.csv

Each row = ONE person who currently has TWO Cosmo cards:

  1) EMAIL CARD  = has email, NO phone (usually from web/Shopify)
  2) PHONE CARD  = has phone (usually from Adapt/ERP)

Insight opens one card at a time, so history looks empty on the other card.

Columns
-------
verdict
  SAME  = names match closely → same person
  MAYBE = only partial name match → check by hand
  NO    = do not merge

what_to_do
  Plain instruction for that row

email_card_name / email_card_email
  The card with no phone

phone_card_name / phone_card_phone
  The card that already has the number

erp_name
  Name in ERP for that email+phone

names_look_same
  YES if names are the same after cleaning Mr/Ms etc.

email_card_web_orders
  How many Cosmo web orders sit on the email

phone_card_adapt_invoices
  How many Adapt POS invoices sit on the phone card

email_card_id / phone_card_id
  Cosmo IDs (for merge later)

Counts in this file
-------------------
${Object.entries(counts)
  .map(([k, v]) => `${k}: ${v}`)
  .join("\n")}

Recommended
-----------
1. Sort/filter verdict = SAME
2. Spot-check a few names
3. Only then merge email card → phone card
`,
  "utf8"
);

console.log(JSON.stringify({ rows: outRows.length, counts, csv: out, guide }, null, 2));
