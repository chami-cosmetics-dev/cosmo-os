const { PrismaClient } = require("@prisma/client");
const XLSX = require("xlsx");
const url = process.env.DATABASE_URL || "";
const p = new PrismaClient({
  datasources: { db: { url: url.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || url } },
});
const COMPANY = "cmp5k145c006irlhemjfidlb5";

function phoneDigitsOnly(raw) {
  let d = String(raw).replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  return d;
}
function canonicalPhoneKey(raw) {
  const d = phoneDigitsOnly(raw);
  if (!d) return null;
  if (d.length === 9) return d;
  if (d.length === 10 && d.startsWith("0")) return d.slice(1);
  if (d.length === 11 && d.startsWith("94")) return d.slice(2);
  if (d.length === 12 && d.startsWith("940")) return d.slice(3);
  return d;
}
function buildVariants(raw) {
  const t = String(raw).trim();
  let d = phoneDigitsOnly(raw);
  const out = new Set();
  if (t) out.add(t);
  if (d) {
    out.add(d);
    if (d.length === 9) { out.add("0"+d); out.add("94"+d); }
    if (d.length === 10 && d.startsWith("0")) { out.add(d.slice(1)); out.add("94"+d.slice(1)); }
    if (d.length === 11 && d.startsWith("94")) { out.add("0"+d.slice(2)); out.add(d.slice(2)); }
  }
  return [...out];
}

function loadPhones(path) {
  const wb = XLSX.readFile(path);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, range: 1 }); // skip first formula row
  const phones = [];
  for (const row of rows) {
    const phone = row["Telephone Number"] ?? row["PHONE_NUMBER"] ?? row.phone;
    if (phone == null || String(phone).trim() === "") continue;
    phones.push(String(phone));
  }
  return phones;
}

async function indexContacts() {
  const map = new Map(); // canonical -> {id, assignedMerchant}
  const pageSize = 2000;
  let cursor = null;
  for (;;) {
    const batch = await p.contactMaster.findMany({
      where: { companyId: COMPANY },
      take: pageSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: { id: true, assignedMerchant: true, phoneNumber: true, phones: { select: { phoneNumber: true } } },
    });
    if (!batch.length) break;
    for (const c of batch) {
      for (const phone of [c.phoneNumber, ...c.phones.map((x) => x.phoneNumber)].filter(Boolean)) {
        for (const v of buildVariants(phone)) {
          const key = canonicalPhoneKey(v);
          if (!key) continue;
          if (!map.has(key)) map.set(key, { id: c.id, assignedMerchant: c.assignedMerchant });
        }
      }
    }
    cursor = batch[batch.length - 1].id;
    if (batch.length < pageSize) break;
  }
  return map;
}

function summarize(label, phones, index, assignTo) {
  let matched = 0, missing = 0, already = 0, wouldChange = 0, blank = 0;
  const fromCounts = {};
  const seenContact = new Set();
  for (const phone of phones) {
    const key = canonicalPhoneKey(phone);
    if (!key) { blank++; continue; }
    const hit = index.get(key);
    if (!hit) { missing++; continue; }
    if (seenContact.has(hit.id)) continue;
    seenContact.add(hit.id);
    matched++;
    const cur = (hit.assignedMerchant || "").trim();
    fromCounts[cur || "(blank)"] = (fromCounts[cur || "(blank)"] || 0) + 1;
    if (cur.toLowerCase() === assignTo.toLowerCase()) already++;
    else wouldChange++;
  }
  console.log(JSON.stringify({
    file: label,
    excelPhones: phones.length,
    uniqueMatchedContacts: matched,
    missingInVault: missing,
    alreadyAssignedTarget: already,
    wouldChange,
    currentAssignmentBreakdown: fromCounts,
    proposedAssignedMerchant: assignTo,
  }, null, 2));
}

(async () => {
  const nimPhones = loadPhones("c:/Users/Bad-Boy/Downloads/Contacts for Nimthera 12 Sep 26.xlsx");
  const dinPhones = loadPhones("c:/Users/Bad-Boy/Downloads/Contacts for Dinuli 12 Sep 26.xlsx");
  // overlap
  const nimKeys = new Set(nimPhones.map(canonicalPhoneKey).filter(Boolean));
  const dinKeys = new Set(dinPhones.map(canonicalPhoneKey).filter(Boolean));
  let overlap = 0;
  for (const k of nimKeys) if (dinKeys.has(k)) overlap++;
  console.log(JSON.stringify({ nimUnique: nimKeys.size, dinUnique: dinKeys.size, phoneOverlap: overlap }));

  const index = await indexContacts();
  console.log("vaultPhoneKeys", index.size);
  summarize("Nimthera", nimPhones, index, "MER109");
  summarize("Dinuli", dinPhones, index, "MER99");
  await p.$disconnect();
})().catch((e) => { console.error(String(e.stack || e)); process.exit(1); });
