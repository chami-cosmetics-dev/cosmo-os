const fs = require("fs");
const j = require("./tmp/audit-contacts/same-person-two-phones.json");

const STAFF = new Set([
  "sewwandikaushalya293@gmail.com",
  "melani.cosmetic.lk@gmail.com",
  "hpg.inoka@gmail.com",
  "mnktrading24@gmail.com",
  "amitha.cosmatics@outlook.com",
  "ajstradinglanka@gmail.com",
  "dilrukshi1994nil@gmail.com",
  "amitha.cosmetic@outlook.com",
  "tharidudanushka1013@gmail.com",
  "sandalisemini17@gmail.com",
  "natiimasha111@gmail.com",
  "iroshinijayawardena7@gmail.com",
  "channa@lmj.lk",
  "maneeshagim@gmail.com",
  "lathansubashini@gmail.com",
  "achinikaushalya6@gmail.com",
  "i.shanu12@gmail.com",
  "yasadari123@gmail.com",
  "renuspj92@mail.com",
  "thilini.cosmetic.lk@gmail.com",
]);

function line(row) {
  return [row.name, row.phones.join(" / "), row.email, row.how]
    .map((s) => `"${String(s || "").replace(/"/g, '""')}"`)
    .join(",");
}

const extras = j.extraOnCardRows;
const candidates = j.sameNameTwoCardsRows.filter((r) => {
  const e = String(r.email || "").toLowerCase();
  if (!e) return false;
  if (STAFF.has(e)) return false;
  if (e.includes("cosmetic") || e.includes("pos1") || e.includes("pos2")) return false;
  return r.how === "same_name_same_customer_email";
});

const header = "name,phones,email,how";
const all = [
  header,
  ...extras.map(line),
  ...candidates.map(line),
].join("\n");

fs.writeFileSync("tmp/audit-contacts/same-person-two-phones.csv", all);
console.log(JSON.stringify({ extras: extras.length, candidates: candidates.length }, null, 2));
