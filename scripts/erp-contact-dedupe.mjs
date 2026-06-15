/**
 * Merge duplicate ERP Contact records into one primary contact per survivor customer.
 * Uses frappe.client.rename_doc merge=1 so submitted Sales Invoice contact_person links update.
 * Run: node scripts/erp-contact-dedupe.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SURVIVORS = [
  "Maleesha Shaheli Senanayake",
  "sasida dilhan",
  "Ms Sujeewa Fernando",
  "S.A.D Mihira Sampath",
  "Mrs. Nisansala Perera",
  "S.N.Samarakoon",
  "Nishanthi Dilrukshi",
  "Mrs. Dinali Nissanka",
  "Shanika Perera",
  "W. N Jayasinghe",
  "Ms iresha",
  "Ms Kenuli Gamage",
  "Mr Suramya",
  "Nilakshi",
  "Mr chanaka lakshan",
  "Ms Virasha Samarasinghe",
  "Ms Rashmi  Vimansa",
  "T A Ranathunga",
  "Gayathri",
  "Ms Selvi",
  "Mr Jayasekara",
  "K. Sujeewa",
  "Subha Herath",
  "Ms Hideshika",
  "Ms Nishadi senanayake",
  "Mr Asitha",
  "Ms Dilshani Bandara",
  "Isuru C Madhuwantha",
  "Ms. Anushka",
  "Mr. G T B  Ekanayaka",
  "Chami Gunawardane",
  "mr. thilina",
  "Ms uditha madushani",
  "SMS Test Temp (API)",
];

function loadErp() {
  const mcp = JSON.parse(readFileSync(join(__dirname, "..", ".mcp.json"), "utf8"));
  const env = mcp.mcpServers.erpnext.env;
  return {
    base: env.ERPNEXT_URL.replace(/\/$/, ""),
    auth: `token ${env.ERPNEXT_API_KEY}:${env.ERPNEXT_API_SECRET}`,
  };
}

function scoreContact(ct, customerName) {
  let score = 0;
  const name = ct.name || "";
  const mobile = String(ct.mobile_no || ct.phone || "").replace(/\s/g, "");

  if (/^Customer\d+-/i.test(name)) score -= 50;
  if (/TestSMS|^test-/i.test(name)) score -= 80;
  if (/-0+\d{3,7}$/.test(name)) score -= 35;
  if (ct.email_id?.trim()) score += 20;
  if (/^0\d{9}$/.test(mobile)) score += 30;
  else if (mobile.length >= 9) score += 8;
  if (name.toLowerCase().includes(customerName.toLowerCase().split(" ")[0])) score += 5;

  return score;
}

async function getContacts(base, auth, customerName) {
  const filters = encodeURIComponent(
    JSON.stringify([
      ["Dynamic Link", "link_doctype", "=", "Customer"],
      ["Dynamic Link", "link_name", "=", customerName],
    ]),
  );
  const fields = encodeURIComponent(
    JSON.stringify(["name", "first_name", "last_name", "mobile_no", "phone", "email_id"]),
  );
  const res = await fetch(
    `${base}/api/resource/Contact?filters=${filters}&fields=${fields}&limit_page_length=50`,
    { headers: { Authorization: auth } },
  );
  if (!res.ok) return [];
  const json = await res.json();
  return json.data ?? [];
}

async function contactExists(base, auth, name) {
  const res = await fetch(`${base}/api/resource/Contact/${encodeURIComponent(name)}`, {
    headers: { Authorization: auth },
  });
  return res.ok;
}

async function mergeContact(base, auth, oldName, keeperName) {
  const res = await fetch(`${base}/api/method/frappe.client.rename_doc`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      doctype: "Contact",
      old_name: oldName,
      new_name: keeperName,
      merge: 1,
    }),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, message: text.slice(0, 400) };
}

const { base, auth } = loadErp();
const results = { merged: [], skipped: [], failed: [], survivors: [] };

for (const customer of SURVIVORS) {
  let contacts = await getContacts(base, auth, customer);
  if (contacts.length <= 1) {
    results.survivors.push({ customer, keeper: contacts[0]?.name ?? null, contactCount: contacts.length });
    continue;
  }

  contacts = contacts.filter((c) => c.name);
  contacts.sort((a, b) => scoreContact(b, customer) - scoreContact(a, customer));
  const keeper = contacts[0].name;
  const toMerge = contacts.slice(1).map((c) => c.name);

  for (const oldName of toMerge) {
    if (oldName === keeper) continue;
    const exists = await contactExists(base, auth, oldName);
    if (!exists) {
      results.skipped.push({ customer, oldName, keeper, reason: "already merged" });
      continue;
    }
    const keeperStill = await contactExists(base, auth, keeper);
    if (!keeperStill) {
      results.failed.push({ customer, oldName, keeper, reason: "keeper missing" });
      continue;
    }

    const res = await mergeContact(base, auth, oldName, keeper);
    if (res.ok) {
      results.merged.push({ customer, removed: oldName, keeper });
      console.log(`OK  ${oldName} -> ${keeper}`);
    } else {
      results.failed.push({ customer, removed: oldName, keeper, ...res });
      console.log(`FAIL ${oldName} -> ${keeper} [${res.status}]`);
    }
  }

  const remaining = await getContacts(base, auth, customer);
  results.survivors.push({
    customer,
    keeper,
    contactCount: remaining.length,
    remaining: remaining.map((c) => c.name),
  });
}

const outPath = join(__dirname, "..", "exports", "erp-contact-dedupe-results.json");
await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(results, null, 2));

console.log("\n=== CONTACT DEDUPE ===");
console.log("Merged:", results.merged.length);
console.log("Skipped:", results.skipped.length);
console.log("Failed:", results.failed.length);
console.log("Results:", outPath);
