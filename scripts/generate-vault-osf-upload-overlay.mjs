/**
 * Regenerate lib/vault-osf/workbook-upload-overlay-data.json from a Vault OSF xlsx.
 *
 * Usage: node scripts/generate-vault-osf-upload-overlay.mjs [path-to.xlsx]
 * Default: OSF-vault-2026-09-09 (1).xlsx at repo root.
 *
 * Supports:
 * - Generated Vault OSF (header row 2: Barcode / Priority Status)
 * - Manual Dilhan-style sheets (header lower; "New status" for priority)
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

function findHeaderRow(data) {
  for (let i = 0; i < Math.min(data.length, 30); i += 1) {
    const row = (data[i] ?? []).map((x) => String(x ?? "").trim());
    const hasSku = row.some((x) => x === "Variant SKU" || x === "SKU");
    const hasBarcode = row.some((x) => /^barcode$/i.test(x));
    if (hasSku && hasBarcode) return i;
  }
  return -1;
}

function colIndex(headers, ...preds) {
  for (const pred of preds) {
    const idx = headers.findIndex(pred);
    if (idx >= 0) return idx;
  }
  return -1;
}

const wb = XLSX.readFile(input, { raw: false });
const sheet = wb.Sheets.Main ?? wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
const hi = findHeaderRow(data);
if (hi < 0) {
  console.error("Could not find Variant SKU + Barcode header row");
  process.exit(1);
}

const h = data[hi].map((x) => String(x ?? "").trim());
const skuCol = colIndex(
  h,
  (x) => x === "Variant SKU",
  (x) => x === "SKU",
);
const bcIdx = colIndex(h, (x) => /^barcode$/i.test(x));
const priIdx = colIndex(
  h,
  (x) => /^priority status$/i.test(x),
  (x) => /^new status$/i.test(x),
  (x) => /priority/i.test(x),
);

if (skuCol < 0 || bcIdx < 0) {
  console.error("Expected Variant SKU and Barcode columns", h.slice(0, 12));
  process.exit(1);
}

const map = {};
let withBc = 0;
let withPri = 0;
for (let i = hi + 1; i < data.length; i += 1) {
  const row = data[i];
  const sku = cleanCell(row[skuCol]);
  if (!sku) continue;
  const barcode = cleanCell(row[bcIdx]);
  const priorityStatus = priIdx >= 0 ? cleanCell(row[priIdx]) : "";
  // Skip placeholder barcode "0" — treat as missing
  const usableBarcode = barcode && barcode !== "0" ? barcode : "";
  if (usableBarcode) withBc += 1;
  if (priorityStatus) withPri += 1;
  map[sku] = {
    ...(usableBarcode ? { barcode: usableBarcode } : {}),
    ...(priorityStatus ? { priorityStatus } : {}),
  };
}

fs.writeFileSync(out, `${JSON.stringify(map, null, 2)}\n`);
console.log(
  `Wrote ${Object.keys(map).length} SKUs (${withBc} barcodes, ${withPri} priorities) → ${path.relative(root, out)}`,
);
console.log(`Source: ${input} (header row ${hi + 1})`);
