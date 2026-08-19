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

const table = parseCsv(fs.readFileSync("tmp/audit-contacts/same-email.csv", "utf8"));
const idx = Object.fromEntries(table[0].map((h, i) => [h, i]));
const ranked = table.slice(1).map((r) => ({
  email: r[idx.email],
  count: Number(r[idx.count] || 0),
}));
ranked.sort((a, b) => b.count - a.count);
const buckets = { c2: 0, c3to10: 0, c11to50: 0, c51plus: 0 };
for (const r of ranked) {
  if (r.count === 2) buckets.c2 += 1;
  else if (r.count <= 10) buckets.c3to10 += 1;
  else if (r.count <= 50) buckets.c11to50 += 1;
  else buckets.c51plus += 1;
}
console.log(
  JSON.stringify(
    {
      groups: ranked.length,
      buckets,
      top25: ranked.slice(0, 25),
    },
    null,
    2
  )
);
