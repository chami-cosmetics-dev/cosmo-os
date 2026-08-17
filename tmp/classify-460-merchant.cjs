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

function isOfficialMerchant(email) {
  const e = String(email || "").toLowerCase();
  if (!e) return false;
  if (e.endsWith("@cosmetics.lk") || e.endsWith("@lmj.lk")) return true;
  if (e.includes(".cosmetics@") || e.includes("cosmetic") || e.includes("cosmatics")) return true;
  if (e.includes("pos1@") || e.includes("pos2@")) return true;
  return false;
}

const KNOWN_CASHIER = new Set([
  "sewwandikaushalya293@gmail.com",
  "hpg.inoka@gmail.com",
  "mnktrading24@gmail.com",
  "ajstradinglanka@gmail.com",
  "dilrukshi1994nil@gmail.com",
  "tharidudanushka1013@gmail.com",
  "sandalisemini17@gmail.com",
  "natiimasha111@gmail.com",
  "iroshinijayawardena7@gmail.com",
  "channa@lmj.lk",
  "maneeshagim@gmail.com",
  "lathansubashini@gmail.com",
  "achinikaushalya6@gmail.com",
  "achinikaushalya06@gmail.com",
  "i.shanu12@gmail.com",
  "yasadari123@gmail.com",
  "renuspj92@mail.com",
  "sandali.nirasha19991231@gmail.com",
  "asankabiz84@gmail.com",
  "lmjtab6@gmail.com",
  "sadeepaindunil123@gamil.com",
  "cosmetics.nathali@gmail.com",
  "dulangicosmetics@gmail.com",
  "kiribathgodapos1@gmail.com",
  "coolplanetpos1@gmail.com",
  "sales@cosmetics.lk",
]);

const j = JSON.parse(
  fs.readFileSync("tmp/audit-contacts/same-person-two-phones.json", "utf8")
);
const emailCount = new Map();
const sameEmail = parseCsv(fs.readFileSync("tmp/audit-contacts/same-email.csv", "utf8"));
const ei = Object.fromEntries(sameEmail[0].map((h, i) => [h, i]));
for (const r of sameEmail.slice(1)) {
  emailCount.set(String(r[ei.email] || "").toLowerCase(), Number(r[ei.count] || 0));
}

const rows = j.sameNameTwoCardsRows.filter((r) => r.how === "same_name_same_customer_email");
let official = 0;
let cashier = 0;
let highReuse = 0;
let likelyPersonal = 0;
const merchantSamples = [];
const personalSamples = [];

for (const r of rows) {
  const e = String(r.email || "").toLowerCase();
  const usedOn = emailCount.get(e) || 0;
  let kind = "personal";
  if (isOfficialMerchant(e)) {
    kind = "official_merchant";
    official += 1;
  } else if (KNOWN_CASHIER.has(e)) {
    kind = "cashier_gmail";
    cashier += 1;
  } else if (usedOn >= 10) {
    kind = "reused_10plus_cards";
    highReuse += 1;
  } else {
    likelyPersonal += 1;
  }
  const pack = {
    name: r.name,
    phones: r.phones,
    email: e,
    cards_with_this_email: usedOn,
    kind,
  };
  if (kind !== "personal" && merchantSamples.length < 12) merchantSamples.push(pack);
  if (kind === "personal" && personalSamples.length < 8) personalSamples.push(pack);
}

console.log(
  JSON.stringify(
    {
      total460: rows.length,
      officialMerchantPattern: official,
      knownCashierGmail: cashier,
      emailOn10PlusCards: highReuse,
      likelyPersonalCustomer: likelyPersonal,
      merchantSamples,
      personalSamples,
    },
    null,
    2
  )
);
