import type { VaultBusinessUnit, VaultCatalogRow } from "@/lib/vault-osf/types";
import type { LatestPurchase, PriceInfo, PurchaseCell, SalesCell } from "@/lib/vault-osf/types";
import { maxSale, monthsOfCover, reorderQty, sumNullable } from "@/lib/vault-osf/formulas";
import { monthKeysInWindow, monthSectionLabel } from "@/lib/vault-osf/months";
import { stockForColumn } from "@/lib/osf/erp-stock";

export type VaultOsfColDef = {
  key: string;
  header: string;
  section?: string;
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
  const defs: VaultOsfColDef[] = [
    { key: "variantSku", header: "Variant SKU", section: "Identity" },
    { key: "sku", header: "SKU" },
    { key: "barcode", header: "Barcode" },
    { key: "priorityStatus", header: "Priority Status" },
    { key: "country", header: "Country" },
    { key: "category", header: "Category" },
    { key: "brand", header: "Brand" },
    { key: "itemName", header: "Item" },
  ];

  ordered.forEach((u, i) => {
    defs.push({
      key: `rop:${u.key}`,
      header: u.label,
      section: i === 0 ? "ROP" : undefined,
    });
  });
  defs.push({ key: "ropTotal", header: "Total ROP" });

  ordered.forEach((u, i) => {
    defs.push({
      key: `stock:${u.key}`,
      header: u.label,
      section: i === 0 ? `Stock (${asOfDate})` : undefined,
    });
  });
  defs.push({ key: "stockTotal", header: "Total" });

  // Months carry the SV/ORI/AE combined total only; the per-unit split lives in
  // ROP / Stock / Reorder, which is where it drives a decision.
  for (const month of monthKeysInWindow(asOfDate)) {
    const section = monthSectionLabel(month, asOfDate);
    defs.push({
      key: `sales:${month}:total`,
      header: `Total ${section.split(" ")[0]}`,
      section,
    });
    defs.push({ key: `purchQty:${month}`, header: "Purch Qty (All)" });
    defs.push({ key: `purchValue:${month}`, header: "Purch Value (All)" });
  }

  defs.push({ key: "mrp", header: "MRP", section: "Pricing" });
  defs.push({ key: "discountedPrice", header: "Discounted Price" });
  defs.push({ key: "maxSale", header: "Max sale", section: "Derived" });
  defs.push({ key: "ave", header: "AVE" });

  ordered.forEach((u, i) => {
    defs.push({
      key: `reorder:${u.key}`,
      header: u.label,
      section: i === 0 ? "Reorder Quantity" : undefined,
    });
  });
  defs.push({ key: "reorderTotal", header: "Total" });
  defs.push({ key: "latestPrice", header: "Latest price", section: "Supplier" });
  defs.push({ key: "latestSupplier", header: "Latest price suppliers" });
  return defs;
}

function cell(value: string | number | null | undefined): string | number | null {
  if (value == null || value === "") return null;
  return value;
}

export function buildVaultMainRows(input: VaultWorkbookInput): Array<Record<string, string | number | null>> {
  const units = [...input.units].sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key));
  const months = monthKeysInWindow(input.asOfDate);
  const rows: Array<Record<string, string | number | null>> = [];

  for (const item of input.catalog) {
    const row: Record<string, string | number | null> = {
      variantSku: item.variantSku,
      sku: item.sku,
      barcode: cell(item.barcode),
      priorityStatus: cell(item.priorityStatus),
      country: cell(item.country),
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
    row.ave = monthsOfCover(row.stockTotal as number, max);

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
  const ws = wb.addWorksheet("Main", { views: [{ state: "frozen", ySplit: 2 }] });
  ws.addRow(defs.map((d) => d.section ?? ""));
  ws.addRow(defs.map((d) => d.header));
  for (const r of rows) {
    ws.addRow(defs.map((d) => (r[d.key] == null ? "" : r[d.key])));
  }
  ws.getRow(1).font = { bold: true };
  ws.getRow(2).font = { bold: true };

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
