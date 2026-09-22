import { baseSku } from "@/lib/osf/base-sku";
import { stockForColumn } from "@/lib/osf/erp-stock";
import {
  applyOsfWorkbookHeaderBands,
  type OsfWorkbookBandKey,
} from "@/lib/osf/workbook-band-styles";
import { averageMonthlySale, maxSale, reorderQty, sumNullable } from "@/lib/vault-osf/formulas";
import {
  monthKeysInWindow,
  monthPurchaseQtyHeader,
  monthPurchaseTotalHeader,
  monthTotalSaleHeader,
} from "@/lib/vault-osf/months";
import type { VaultBusinessUnit, VaultCatalogRow } from "@/lib/vault-osf/types";
import type { LatestPurchase, PriceInfo, PurchaseCell, SalesCell } from "@/lib/vault-osf/types";

export type VaultOsfColDef = {
  key: string;
  header: string;
  section?: string;
  band?: OsfWorkbookBandKey;
};

export type VaultWorkbookInput = {
  catalog: VaultCatalogRow[];
  units: VaultBusinessUnit[];
  asOfDate: string;
  binMap: Map<string, number>;
  /** sku → columnKey → SalesCell */
  sales: Map<string, Record<string, Record<string, SalesCell>>>;
  /** sku → month → PurchaseCell */
  purchases: Map<string, Record<string, PurchaseCell>>;
  prices: Map<string, PriceInfo>;
  latest: Map<string, LatestPurchase>;
  /** sku → columnKey → rop */
  rops: Map<string, Record<string, number>>;
};

export const COSMO_HEADERS_MUST_ABSENT = [
  "Common SKU Stock",
  "Common ROP",
  "% of ROP",
  "70% OF TOTAL ROP",
  "OGF Price",
  "Cosmetics Margin %",
  "Purchased (last 30d)",
  "AVER sales 5M",
  "New malinda",
  "New USA",
  "Buffer stock",
];

export function vaultColumnDefs(units: VaultBusinessUnit[], asOfDate: string): VaultOsfColDef[] {
  const ordered = [...units].sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key));
  const months = monthKeysInWindow(asOfDate);
  const defs: VaultOsfColDef[] = [
    { key: "variantSku", header: "Variant SKU", section: "Identity", band: "identity" },
    { key: "sku", header: "Common SKU", band: "identity" },
    { key: "brand", header: "Brand", band: "identity" },
    { key: "itemName", header: "Item", band: "identity" },
    { key: "barcode", header: "Barcode", band: "identity" },
    { key: "category", header: "Category", band: "identity" },
    { key: "priorityStatus", header: "Priority Status", band: "identity" },
    { key: "country", header: "Country", band: "identity" },
    { key: "countryClaimType", header: "Country Claim Type", band: "identity" },
  ];

  ordered.forEach((u, i) => {
    defs.push({
      key: `rop:${u.key}`,
      header: u.label,
      section: i === 0 ? "ROP" : undefined,
      band: "rop",
    });
  });
  defs.push({ key: "ropTotal", header: "Total ROP", band: "rop" });

  ordered.forEach((u, i) => {
    defs.push({
      key: `stock:${u.key}`,
      header: u.label,
      section: i === 0 ? `Stock (${asOfDate})` : undefined,
      band: "stock",
    });
  });
  defs.push({ key: "stockTotal", header: "Total", band: "stock" });

  // Sales block, then purchase block (qty then value per month).
  for (const [i, month] of months.entries()) {
    defs.push({
      key: `sales:${month}:total`,
      header: monthTotalSaleHeader(month),
      section: i === 0 ? "Sales" : undefined,
      band: "sales",
    });
  }
  for (const [i, month] of months.entries()) {
    const section = i === 0 ? "Purchases" : undefined;
    defs.push({
      key: `purchQty:${month}`,
      header: monthPurchaseQtyHeader(month),
      section,
      band: "purchase",
    });
    defs.push({
      key: `purchValue:${month}`,
      header: monthPurchaseTotalHeader(month),
      band: "purchase",
    });
  }

  defs.push({ key: "mrp", header: "MRP", section: "Pricing", band: "price" });
  defs.push({ key: "discountedPrice", header: "Discounted Price", band: "price" });
  defs.push({ key: "maxSale", header: "Max sale", section: "Derived", band: "calc" });
  defs.push({ key: "ave", header: "AVE", band: "calc" });

  ordered.forEach((u, i) => {
    defs.push({
      key: `reorder:${u.key}`,
      header: u.label,
      section: i === 0 ? "Reorder Quantity" : undefined,
      band: "order",
    });
  });
  defs.push({ key: "reorderTotal", header: "Total", band: "order" });
  defs.push({ key: "latestPrice", header: "Latest price", section: "Supplier", band: "cost" });
  defs.push({ key: "latestSupplier", header: "Latest price suppliers", band: "cost" });
  return defs;
}

function cell(value: string | number | null | undefined): string | number | null {
  if (value == null || value === "") return null;
  return value;
}

/** Excel column letter from 1-based index (1 → A, 27 → AA). */
export function excelColumnLetter(col1Based: number): string {
  let n = col1Based;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** Numeric columns that get Excel SUBTOTAL(9, …) on the totals row. */
export function vaultOsfSubtotalColumn(key: string): boolean {
  if (key.startsWith("rop:")) return true;
  if (key === "ropTotal") return true;
  if (key.startsWith("stock:")) return true;
  if (key === "stockTotal") return true;
  if (key.startsWith("sales:")) return true;
  if (key.startsWith("purchQty:")) return true;
  if (key.startsWith("purchValue:")) return true;
  if (key === "mrp" || key === "discountedPrice") return true;
  if (key === "maxSale" || key === "ave") return true;
  if (key.startsWith("reorder:")) return true;
  if (key === "reorderTotal") return true;
  if (key === "latestPrice") return true;
  return false;
}

export function buildVaultMainRows(input: VaultWorkbookInput): Array<Record<string, string | number | null>> {
  const units = [...input.units].sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key));
  const months = monthKeysInWindow(input.asOfDate);
  const rows: Array<Record<string, string | number | null>> = [];

  for (const item of input.catalog) {
    const row: Record<string, string | number | null> = {
      variantSku: item.variantSku,
      // B column: strip -1 / _1 suffix (BG004-1 → BG004)
      sku: baseSku(item.sku) || item.sku,
      barcode: cell(item.barcode),
      priorityStatus: cell(item.priorityStatus),
      country: cell(item.country),
      countryClaimType: cell(item.countryClaimType),
      category: cell(item.category),
      brand: cell(item.brand),
      itemName: item.itemName,
    };

    const ropMap = input.rops.get(item.sku) ?? {};
    const stocks: number[] = [];
    const rops: Array<number | null> = [];
    for (const u of units) {
      const stock = stockForColumn(input.binMap, u.warehouses, item.sku) ?? 0;
      stocks.push(stock);
      row[`stock:${u.key}`] = stock;
      const rop = ropMap[u.key];
      const ropVal = rop != null && Number.isFinite(rop) ? rop : null;
      rops.push(ropVal);
      row[`rop:${u.key}`] = ropVal;
      row[`reorder:${u.key}`] = reorderQty(ropVal, stock);
    }
    row.ropTotal = sumNullable(rops);
    row.stockTotal = stocks.reduce((a, b) => a + b, 0);
    row.reorderTotal = sumNullable(units.map((u) => row[`reorder:${u.key}`] as number | null));

    const monthTotals: Array<number | null> = [];
    const salesByMonth = input.sales.get(item.sku) ?? {};
    const purchByMonth = input.purchases.get(item.sku) ?? {};
    for (const month of months) {
      // Per-unit sales are still summed per unit — ERP and imported cells are
      // stored that way — but only the total is written to the sheet.
      const unitQtys = units.map((u) => salesByMonth[month]?.[u.key]?.qty ?? null);
      const total = sumNullable(unitQtys);
      row[`sales:${month}:total`] = total;
      monthTotals.push(total);
      const purch = purchByMonth[month] ?? { qty: null, netValue: null };
      row[`purchQty:${month}`] = purch.qty;
      row[`purchValue:${month}`] = purch.netValue;
    }

    const max = maxSale(monthTotals);
    row.maxSale = max;
    // AVE = total sale / count of months that have sales (blanks ignored).
    row.ave = averageMonthlySale(monthTotals);

    const price = input.prices.get(item.sku);
    row.mrp = price?.mrp ?? null;
    row.discountedPrice = price?.discountedPrice ?? null;
    const latest = input.latest.get(item.sku);
    row.latestPrice = latest?.rate ?? null;
    row.latestSupplier = latest?.supplier ?? null;

    rows.push(row);
  }
  return rows;
}

export async function buildVaultOsfWorkbookBuffer(input: VaultWorkbookInput): Promise<Buffer> {
  const ExcelJS = await import("exceljs");
  const defs = vaultColumnDefs(input.units, input.asOfDate);
  const rows = buildVaultMainRows(input);
  const wb = new ExcelJS.Workbook();
  // Row1 section, Row2 SUBTOTAL, Row3 headers, Row4+ data — freeze all three header rows.
  const ws = wb.addWorksheet("Main", { views: [{ state: "frozen", ySplit: 3 }] });
  ws.addRow(defs.map((d) => d.section ?? ""));

  const dataStartRow = 4;
  const dataEndRow = rows.length === 0 ? dataStartRow : dataStartRow + rows.length - 1;
  const totalsRow = ws.addRow(defs.map(() => ""));
  defs.forEach((d, colIdx) => {
    const cellRef = totalsRow.getCell(colIdx + 1);
    if (colIdx === 0) {
      cellRef.value = "Subtotal";
      return;
    }
    if (!vaultOsfSubtotalColumn(d.key)) {
      cellRef.value = "";
      return;
    }
    const letter = excelColumnLetter(colIdx + 1);
    cellRef.value = {
      formula: `SUBTOTAL(9,${letter}${dataStartRow}:${letter}${dataEndRow})`,
    };
  });

  ws.addRow(defs.map((d) => d.header));
  for (const r of rows) {
    ws.addRow(defs.map((d) => (r[d.key] == null ? "" : r[d.key])));
  }
  applyOsfWorkbookHeaderBands(ws, defs, {
    sectionRow: 1,
    totalsRow: 2,
    headerRow: 3,
  });

  const months = monthKeysInWindow(input.asOfDate);
  const info = wb.addWorksheet("Info");
  info.addRow(["asOfDate", input.asOfDate]);
  info.addRow(["salesFrom", `${months[0] ?? ""}-01`]);
  info.addRow(["salesTo", input.asOfDate]);
  info.addRow(["rowCount", rows.length]);
  info.addRow(["units", input.units.map((u) => `${u.label}=${u.erpCompany}`).join("; ")]);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
