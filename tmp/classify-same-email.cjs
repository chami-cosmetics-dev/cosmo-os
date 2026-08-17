const fs = require("fs");

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

function national(p) {
  let d = String(p || "").replace(/\D/g, "");
  if (d.startsWith("94") && d.length >= 11) d = d.slice(2);
  if (d.length === 10 && d.startsWith("0")) d = d.slice(1);
  return d;
}

const table = parseCsv(fs.readFileSync("tmp/audit-contacts/same-email.csv", "utf8"));
const idx = Object.fromEntries(table[0].map((h, i) => [h, i]));
let oneNone = 0;
let twoPhones = 0;
let sameNat = 0;
let diffNat = 0;
let adaptSplit = 0;
const samples = [];

for (const r of table.slice(1)) {
  const phones = String(r[idx.phones] || "")
    .split("|")
    .map((s) => s.trim());
  const hasNone = phones.some((p) => p === "none" || !p);
  const phoneVals = phones.filter((p) => p && p !== "none");
  if (hasNone) oneNone += 1;
  else twoPhones += 1;
  if (phoneVals.length >= 2) {
    const nats = new Set(phoneVals.map(national).filter((d) => d.length >= 9));
    if (nats.size <= 1) sameNat += 1;
    else diffNat += 1;
    const adapt = String(r[idx.adapt_counts] || "")
      .split("|")
      .map((s) => Number(s.trim()) || 0);
    if (adapt.filter((n) => n > 0).length >= 2) {
      adaptSplit += 1;
      if (samples.length < 10) {
        samples.push({
          email: r[idx.email],
          names: r[idx.names],
          phones: r[idx.phones],
          adapt_counts: r[idx.adapt_counts],
          adapt_amounts: r[idx.adapt_amounts],
        });
      }
    }
  }
}

console.log(
  JSON.stringify(
    {
      rows: table.length - 1,
      emailOnlyPlusPhoneCard: oneNone,
      twoOrMorePhoneCards: twoPhones,
      sameNumberDifferentFormat: sameNat,
      differentPhonesSameEmail: diffNat,
      differentPhonesAndBothHaveAdapt: adaptSplit,
      adaptSplitSamples: samples,
    },
    null,
    2
  )
);
