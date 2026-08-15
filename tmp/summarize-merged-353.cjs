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

const table = parseCsv(fs.readFileSync("tmp/split-contacts-MERGED.csv", "utf8"));
const header = table[0];
const idx = Object.fromEntries(header.map((x, i) => [x, i]));
let same = 0;
let changed = 0;
const changes = [];
for (const r of table.slice(1)) {
  const orig = (r[idx.phone_card_phone] || "").trim();
  const fill = (r[idx.fill_phone] || "").trim();
  if (orig === fill) same += 1;
  else {
    changed += 1;
    if (changes.length < 12) {
      changes.push({
        name: r[idx.email_card_name],
        email: r[idx.email_card_email],
        orig,
        fill,
      });
    }
  }
}
console.log(
  JSON.stringify(
    {
      rows: table.length - 1,
      phoneUnchanged: same,
      phoneCanonicalized: changed,
      sampleCanonicalized: changes,
    },
    null,
    2
  )
);
