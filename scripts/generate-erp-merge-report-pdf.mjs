/**
 * ERP customer merge report PDF (merges + survivor contacts).
 * Run: node scripts/generate-erp-merge-report-pdf.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pdfMake = require("pdfmake");
const vfsFonts = require("pdfmake/build/vfs_fonts");

for (const [key, val] of Object.entries(vfsFonts)) {
  pdfMake.virtualfs.writeFileSync(key, Buffer.from(val, "base64"));
}
pdfMake.addFonts({
  Roboto: {
    normal: "Roboto-Regular.ttf",
    bold: "Roboto-Medium.ttf",
    italics: "Roboto-Italic.ttf",
    bolditalics: "Roboto-MediumItalic.ttf",
  },
});
pdfMake.setUrlAccessPolicy(() => false);
pdfMake.setLocalAccessPolicy(() => false);

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "..", "exports", "erp-customer-merge-report.pdf");

const MERGES = [
  { removed: "0000231", survivor: "Maleesha Shaheli Senanayake", phone: "0766065302", batch: "Test" },
  { removed: "0000876", survivor: "sasida dilhan", phone: "0766576655", batch: "Test" },
  { removed: "chaminda lakshan", survivor: "sasida dilhan", phone: "0766576655", batch: "Test" },
  { removed: "Sasinda Dilhan", survivor: "sasida dilhan", phone: "0766576655", batch: "Test" },
  { removed: "Ms Sujeewa Fernando - 1", survivor: "Ms Sujeewa Fernando", phone: "0773472869", batch: "Batch 1" },
  { removed: "0004843", survivor: "Ms Sujeewa Fernando", phone: "0773472869", batch: "Batch 1" },
  { removed: "S.A.D Mihira Sampath - 2", survivor: "S.A.D Mihira Sampath", phone: "0723849901", batch: "Batch 1" },
  { removed: "S.A.D Mihira Sampath - 1", survivor: "S.A.D Mihira Sampath", phone: "0723849901", batch: "Batch 1" },
  { removed: "0000065", survivor: "Mrs. Nisansala Perera", phone: "0717136428", batch: "Batch 1" },
  { removed: "0000280", survivor: "S.N.Samarakoon", phone: "0775773070", batch: "Batch 1" },
  { removed: "0000383", survivor: "Nishanthi Dilrukshi", phone: "0706533107", batch: "Batch 1" },
  { removed: "0000751", survivor: "Mrs. Dinali Nissanka", phone: "0773820045", batch: "Batch 1" },
  { removed: "0001637", survivor: "Shanika Perera", phone: "0715349220", batch: "Batch 1" },
  { removed: "0002559", survivor: "W. N Jayasinghe", phone: "0761742558", batch: "Batch 1" },
  { removed: "0004929", survivor: "Ms iresha", phone: "0766999106", batch: "Batch 1" },
  { removed: "0004946", survivor: "Ms Kenuli Gamage", phone: "0723727604", batch: "Batch 1" },
  { removed: "0005096", survivor: "Mr Suramya", phone: "0713170627", batch: "Batch 1" },
  { removed: "0005281", survivor: "Nilakshi", phone: "0763795236", batch: "Batch 1" },
  { removed: "0005575", survivor: "Mr chanaka lakshan", phone: "0760313198", batch: "Batch 1" },
  { removed: "0005588", survivor: "Ms Virasha Samarasinghe", phone: "0769621648", batch: "Batch 1" },
  { removed: "0005622", survivor: "Ms Rashmi  Vimansa", phone: "0710688915", batch: "Batch 1" },
  { removed: "0005623", survivor: "T A Ranathunga", phone: "0777780826", batch: "Batch 1" },
  { removed: "0005630", survivor: "Gayathri", phone: "0771482335", batch: "Batch 1" },
  { removed: "0005695", survivor: "Ms Selvi", phone: "0778704403", batch: "Batch 1" },
  { removed: "0005789", survivor: "Mr Jayasekara", phone: "0773480098", batch: "Batch 1" },
  { removed: "0005972", survivor: "K. Sujeewa", phone: "0779785717", batch: "Batch 1" },
  { removed: "0000024", survivor: "Subha Herath", phone: "0779725766", batch: "Batch 2" },
  { removed: "0000048", survivor: "Ms Hideshika", phone: "0717236816", batch: "Batch 2" },
  { removed: "0000076", survivor: "Ms Nishadi senanayake", phone: "0777307538", batch: "Batch 2" },
  { removed: "0000106", survivor: "Mr Asitha", phone: "0773215011", batch: "Batch 2" },
  { removed: "0000248", survivor: "Ms Dilshani Bandara", phone: "0773747306", batch: "Batch 2" },
  { removed: "0000889", survivor: "Isuru C Madhuwantha", phone: "0701461128", batch: "Batch 2" },
  { removed: "0002025", survivor: "Ms. Anushka", phone: "0718668644", batch: "Batch 2" },
  { removed: "0003738", survivor: "Mr. G T B  Ekanayaka", phone: "0771763612", batch: "Batch 2" },
  { removed: "TestSMS_01", survivor: "Chami Gunawardane", phone: "0766713205", batch: "Batch 2" },
  { removed: "mr.thilina", survivor: "mr. thilina", phone: "0717775654", batch: "Batch 2" },
  { removed: "Uditha Madushani", survivor: "Ms uditha madushani", phone: "0701119194", batch: "Batch 2" },
  { removed: "test", survivor: "SMS Test Temp (API)", phone: "0771972260", batch: "Batch 2" },
];

const accent = "#1a365d";
const muted = "#555555";

function loadErpEnv() {
  const mcpPath = join(__dirname, "..", ".mcp.json");
  const mcp = JSON.parse(readFileSync(mcpPath, "utf8"));
  return mcp.mcpServers.erpnext.env;
}

function loadContactDedupeResults() {
  const path = join(__dirname, "..", "exports", "erp-contact-dedupe-results.json");
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { merged: [], survivors: [] };
  }
}

async function getContactsForCustomer(base, auth, customerName) {
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

function isLegacyContact(name) {
  return /^Customer\d+-/i.test(name) || /-0+\d{3,7}$/.test(name) || /TestSMS|^test-/i.test(name);
}

function table(headers, rows, widths) {
  return {
    table: {
      headerRows: 1,
      widths: widths ?? headers.map(() => "*"),
      body: [
        headers.map((h) => ({ text: h, style: "tableHeader" })),
        ...rows.map((row) =>
          row.map((c) => ({ text: String(c ?? ""), style: "tableCell" })),
        ),
      ],
    },
    layout: "lightHorizontalLines",
    margin: [0, 6, 0, 12],
  };
}

const env = loadErpEnv();
const base = env.ERPNEXT_URL.replace(/\/$/, "");
const auth = `token ${env.ERPNEXT_API_KEY}:${env.ERPNEXT_API_SECRET}`;
const contactDedupe = loadContactDedupeResults();

const survivors = [...new Set(MERGES.map((m) => m.survivor))].sort();
const contactRows = [];

for (const survivor of survivors) {
  const contacts = await getContactsForCustomer(base, auth, survivor);
  if (contacts.length === 0) {
    contactRows.push([survivor, "(none)", "", "", ""]);
    continue;
  }
  for (const ct of contacts) {
    const mobile = ct.mobile_no || ct.phone || "";
    const label = [ct.first_name, ct.last_name].filter(Boolean).join(" ").trim() || ct.name;
    contactRows.push([survivor, ct.name, label, mobile, ct.email_id || ""]);
  }
}

const contactMergeRows = (contactDedupe.merged ?? []).map((m, i) => [
  String(i + 1),
  m.removed,
  m.keeper,
  m.customer,
]);

const generatedAt = new Date().toISOString().slice(0, 19).replace("T", " UTC ");
const contactMergeCount = contactDedupe.merged?.length ?? 0;

const content = [
  { text: "ERP Customer & Contact Merge Report", style: "h1", margin: [0, 0, 0, 4] },
  {
    text: `Supplement Vault ERPNext — generated ${generatedAt}`,
    style: "muted",
    margin: [0, 0, 0, 12],
  },
  {
    text: "Customers and contacts were merged via frappe.client.rename_doc (merge=1). Submitted Sales Invoice contact_person links were repointed to the primary contact automatically. Invoice amounts and accounting unchanged.",
    style: "body",
    margin: [0, 0, 0, 12],
  },
  { text: "Summary", style: "h2" },
  {
    ul: [
      `${MERGES.length} customer records merged (removed)`,
      `${survivors.length} survivor customers`,
      `${contactMergeCount} duplicate contact records merged into primary contacts`,
      "9 duplicate phone groups still pending customer review (Tier C/D)",
    ],
    margin: [0, 0, 0, 12],
  },
  { text: "Section 1 — Customer merges", style: "h2", pageBreak: "before" },
  table(
    ["#", "Removed customer ID", "Survivor (kept)", "Phone", "Batch"],
    MERGES.map((m, i) => [String(i + 1), m.removed, m.survivor, m.phone, m.batch]),
    ["5%", "22%", "28%", "15%", "10%"],
  ),
  { text: "Section 2 — Contact merges (duplicate → primary)", style: "h2", pageBreak: "before" },
  contactMergeRows.length > 0
    ? table(
        ["#", "Removed contact ID", "Primary contact (kept)", "Customer"],
        contactMergeRows,
        ["5%", "30%", "35%", "30%"],
      )
    : { text: "No contact merge log found.", style: "body" },
  { text: "Section 3 — Primary contacts after cleanup (live ERP)", style: "h2", pageBreak: "before" },
  table(
    ["Customer", "Contact ID", "Name", "Mobile", "Email"],
    contactRows,
    ["18%", "24%", "16%", "14%", "28%"],
  ),
  { text: "Section 4 — Pending customer merges (not done)", style: "h2", pageBreak: "before" },
  table(
    ["Phone", "Issue", "Action"],
    [
      ["0701670326", "A.K.S Lakmali + Shakila Ravimal", "Verify same person before merge"],
      ["0716877087", "Welikala + ms Malinda Waligana", "Verify same person before merge"],
      ["0768031074", "Sheranga name variants + Customer388", "Review then merge"],
      ["0779550458", "Nathali variants + ms bjhcwkddv", "Review then merge"],
      ["0770557107", "Ranasinghe vs Weerasinghe", "Review then merge"],
      ["0701245556", "Thushara name variants", "Review then merge"],
      ["0768609809", "nelum name variants", "Review then merge"],
      ["0765269270", "Ruvani vs Noreksha Dasanayake", "Review then merge"],
      ["0769238123", "Mr vs ms Rumy", "Review then merge"],
    ],
    ["15%", "45%", "40%"],
  ),
];

const docDef = {
  info: {
    title: "ERP Customer & Contact Merge Report",
    author: "Cosmo OS",
    subject: "ERPNext customer merge audit",
  },
  pageSize: "A4",
  pageOrientation: "landscape",
  pageMargins: [40, 48, 40, 48],
  defaultStyle: { font: "Roboto", fontSize: 9, lineHeight: 1.3 },
  styles: {
    h1: { fontSize: 20, bold: true, color: accent },
    h2: { fontSize: 14, bold: true, color: accent, margin: [0, 10, 0, 6] },
    h3: { fontSize: 11, bold: true, color: "#2d3748" },
    body: { fontSize: 9, color: "#1a1a1a" },
    muted: { fontSize: 8, color: muted, italics: true },
    tableHeader: { bold: true, fontSize: 8, fillColor: "#e2e8f0", color: accent },
    tableCell: { fontSize: 8 },
  },
  footer(currentPage, pageCount) {
    return {
      columns: [
        { text: "ERP Customer & Contact Merge Report — Supplement Vault", style: "muted", margin: [40, 0, 0, 0] },
        {
          text: `Page ${currentPage} of ${pageCount}`,
          alignment: "right",
          style: "muted",
          margin: [0, 0, 40, 0],
        },
      ],
    };
  },
  content,
};

await mkdir(dirname(outPath), { recursive: true });
const buffer = await pdfMake.createPdf(docDef).getBuffer();
await writeFile(outPath, buffer);
console.log(`PDF written to: ${outPath}`);
