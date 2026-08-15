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

const keep = parseCsv(fs.readFileSync("tmp/split-contacts-KEEP-DO-NOT-MERGE.csv", "utf8"));
const kh = keep[0];
const ki = Object.fromEntries(kh.map((h, i) => [h, i]));

const dc = parseCsv(fs.readFileSync("tmp/cosmo-email-only-vs-phone-doublecheck.csv", "utf8"));
const dh = dc[0];
const di = Object.fromEntries(dh.map((h, i) => [h, i]));
const phoneEmail = {};
for (const r of dc.slice(1)) {
  phoneEmail[r[di.email_only_contact_id]] = r[di.phone_contact_email] || "";
}

const groups = {};
for (const r of keep.slice(1)) {
  const reason = r[ki.keep_reason];
  if (!groups[reason]) groups[reason] = [];
  groups[reason].push({
    emailName: r[ki.email_card_name],
    email: r[ki.email_card_email],
    phoneName: r[ki.phone_card_name],
    phone: r[ki.phone_card_phone],
    phoneEmail: phoneEmail[r[ki.email_card_id]] || "",
    erp: r[ki.erp_name],
  });
}

console.log(JSON.stringify(groups, null, 2));
