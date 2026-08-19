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

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const src = path.join("tmp/audit-contacts", "same-email-two-phones-REVIEW.csv");
const rows = parseCsv(fs.readFileSync(src, "utf8"));
const header = rows[0];
const i = Object.fromEntries(header.map((h, n) => [h, n]));
const body = rows.slice(1);

const dist = {};
let twoSame = 0;
let twoDiff = 0;
let threePlusSame = 0;
let threePlusDiff = 0;
for (const r of body) {
  const cards = Number(r[i.cards]);
  dist[cards] = (dist[cards] || 0) + 1;
  const same = r[i.names_same] === "YES";
  if (cards === 2 && same) twoSame += 1;
  else if (cards === 2) twoDiff += 1;
  else if (same) threePlusSame += 1;
  else threePlusDiff += 1;
}

const confirm = body.filter(
  (r) => Number(r[i.cards]) === 2 && r[i.names_same] === "YES"
);
const maybeFamily = body.filter(
  (r) => Number(r[i.cards]) === 2 && r[i.names_same] !== "YES"
);

function write(file, list) {
  const lines = [header.join(",")];
  for (const r of list) lines.push(header.map((_, n) => csvEscape(r[n])).join(","));
  fs.writeFileSync(file, lines.join("\n") + "\n", "utf8");
}

const confirmPath = "tmp/audit-contacts/same-email-two-phones-CONFIRM.csv";
const maybePath = "tmp/audit-contacts/same-email-two-phones-DIFFERENT-NAMES.csv";
write(confirmPath, confirm);
write(maybePath, maybeFamily);

fs.copyFileSync(confirmPath, "C:\\Users\\Bad-Boy\\Downloads\\same-email-two-phones-CONFIRM.csv");
fs.copyFileSync(maybePath, "C:\\Users\\Bad-Boy\\Downloads\\same-email-two-phones-DIFFERENT-NAMES.csv");

console.log(
  JSON.stringify(
    {
      reviewTotal: body.length,
      cardsDist: dist,
      confirmTwoCardsSameName: twoSame,
      twoCardsDifferentName: twoDiff,
      threePlusSameName: threePlusSame,
      threePlusDifferentName: threePlusDiff,
      confirmSamples: confirm.slice(0, 6).map((r) => ({
        email: r[i.email],
        names: r[i.names],
        phones: r[i.phones],
      })),
    },
    null,
    2
  )
);
