/**
 * Regenerate lib/vault-osf/workbook-upload-overlay-data.json from a Vault OSF xlsx.
 *
 * Usage: node scripts/generate-vault-osf-upload-overlay.mjs [path-to.xlsx]
 * Default: OSF-vault-2026-09-09 (1).xlsx at repo root.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const input = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, "OSF-vault-2026-09-09 (1).xlsx");
const out = path.join(root, "lib/vault-osf/workbook-upload-overlay-data.json");

function cleanCell(value) {
  const s = String(value ?? "").trim();
  if (!s) return "";
  return s.replace(/^'+/, "").trim();
}

const wb = XLSX.readFile(input);
const sheet = wb.Sheets.Main ?? wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
const h = data[1].map((x) => String(x).trim());
const skuCol = h.indexOf("Variant SKU") >= 0 ? h.indexOf("Variant SKU") : h.indexOf("SKU");
const bcIdx = h.indexOf("Barcode");
const priIdx = h.indexOf("Priority Status");
if (skuCol < 0 || bcIdx < 0 || priIdx < 0) {
  console.error("Expected Variant SKU, Barcode, Priority Status in row 2", h.slice(0, 8));
  process.exit(1);
}

const map = {};
for (let i = 2; i < data.length; i += 1) {
  const row = data[i];
  const sku = cleanCell(row[skuCol]);
  if (!sku) continue;
  const barcode = cleanCell(row[bcIdx]);
  const priorityStatus = cleanCell(row[priIdx]);
  map[sku] = {
    ...(barcode ? { barcode } : {}),
    ...(priorityStatus ? { priorityStatus } : {}),
  };
}

fs.writeFileSync(out, `${JSON.stringify(map, null, 2)}\n`);
console.log(`Wrote ${Object.keys(map).length} SKUs → ${path.relative(root, out)}`);
