import * as ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { salesAmountExcludingShipping } from "@/lib/sales-amount-excluding-shipping";
import { getMerchantCouponCode } from "@/lib/order-merchant-coupon";

type Pair = { from: string; to: string };
export type VaultReportSettings = {
  merchants: string[];
  mappings: Array<{ code: string; merchant: string }>;
  companyNames: string[];
  warehouseMappings: Pair[];
  emailMappings: Pair[];
  invoiceOverrides: Pair[];
  specialCoupons: Pair[];
  allocations: Array<{ from: string; to: string; fromDate: string; toDate: string; percent: number }>;
  targets: Array<{ merchant: string; target: number }>;
};

function vaultCompanyName(value: string) {
  // ERP records use both "SupplementVault" and "SupplementVault.lk" for the
  // same company. Keep the report column stable and combine those sales.
  return value.trim().replace(/\.lk$/i, "");
}

export async function vaultSettings(companyId: string): Promise<VaultReportSettings> {
  const saved = await prisma.salesReportConfig.findUnique({ where: { companyId }, select: { settings: true } });
  const root = saved?.settings && typeof saved.settings === "object" && !Array.isArray(saved.settings) ? saved.settings as Record<string, unknown> : {};
  const data = (root.vaultSalesReport && typeof root.vaultSalesReport === "object"
    ? root.vaultSalesReport
    : Array.isArray(root.merchants) && Array.isArray(root.mappings) ? root : null) as Partial<VaultReportSettings> | null;
  return {
    merchants: Array.isArray(data?.merchants) ? data.merchants : [],
    mappings: Array.isArray(data?.mappings) ? data.mappings : [],
    companyNames: Array.isArray(data?.companyNames) ? data.companyNames : [],
    warehouseMappings: Array.isArray(data?.warehouseMappings) ? data.warehouseMappings : [],
    emailMappings: Array.isArray(data?.emailMappings) ? data.emailMappings : [],
    invoiceOverrides: Array.isArray(data?.invoiceOverrides) ? data.invoiceOverrides : [],
    specialCoupons: Array.isArray(data?.specialCoupons) ? data.specialCoupons : [],
    allocations: Array.isArray(data?.allocations) ? data.allocations : [],
    targets: Array.isArray(data?.targets) ? data.targets : [],
  };
}

export async function saveVaultSettings(companyId: string, settings: VaultReportSettings) {
  const saved = await prisma.salesReportConfig.findUnique({ where: { companyId }, select: { settings: true } });
  const root = saved?.settings && typeof saved.settings === "object" && !Array.isArray(saved.settings) ? saved.settings as Record<string, unknown> : {};
  const data = { ...root, vaultSalesReport: settings } as Prisma.InputJsonValue;
  return prisma.salesReportConfig.upsert({ where: { companyId }, create: { companyId, settings: data }, update: { settings: data } });
}

export function validateVaultSettings(value: unknown): value is VaultReportSettings {
  if (!value || typeof value !== "object") return false;
  const v = value as VaultReportSettings;
  return Array.isArray(v.merchants) && v.merchants.length <= 200 && v.merchants.every(x => typeof x === "string" && Boolean(x.trim()))
    && Array.isArray(v.mappings) && v.mappings.length <= 1000 && v.mappings.every(x => typeof x.code === "string" && typeof x.merchant === "string")
    && Array.isArray(v.companyNames) && v.companyNames.length <= 100 && v.companyNames.every(x => typeof x === "string")
    && ([v.warehouseMappings, v.emailMappings, v.invoiceOverrides, v.specialCoupons] as unknown[]).every(list => Array.isArray(list) && list.length <= 1000 && list.every(x => x && typeof x.from === "string" && typeof x.to === "string"))
    && Array.isArray(v.targets) && v.targets.length <= 200 && v.targets.every(x => typeof x.merchant === "string" && Number.isFinite(x.target) && x.target >= 0)
    && Array.isArray(v.allocations) && v.allocations.length <= 100 && v.allocations.every(x => typeof x.from === "string" && typeof x.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x.fromDate) && /^\d{4}-\d{2}-\d{2}$/.test(x.toDate) && x.fromDate <= x.toDate && Number.isFinite(x.percent) && x.percent > 0 && x.percent <= 100);
}

export async function vaultReport(companyId: string, from: string, to: string, promotion?: { codes: string[]; mode: "exact" | "starts" | "contains" }) {
  const settings = await vaultSettings(companyId);
  const orders = await prisma.order.findMany({ where: { companyId, createdAt: { gte: new Date(`${from}T00:00:00.000Z`), lt: new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 86400000) } }, select: {
    name: true, erpnextInvoiceId: true, totalPrice: true, totalShipping: true, shippingLines: true, discountCodes: true, rawPayload: true, sourceName: true, createdAt: true, financialStatus: true, fulfillmentStage: true, erpnextWarehouse: true,
    companyLocation: { select: { name: true, erpnextCompany: true } }, assignedMerchant: { select: { email: true, couponCodes: true } },
  } });
  const mapped = new Map(settings.mappings.map(x => [x.code.trim().toLowerCase(), x.merchant.trim()]));
  const warehouse = new Map(settings.warehouseMappings.map(x => [x.from.trim().toLowerCase(), x.to.trim()]));
  const emails = new Map(settings.emailMappings.map(x => [x.from.trim().toLowerCase(), x.to.trim()]));
  const overrides = new Map(settings.invoiceOverrides.map(x => [x.from.trim().toLowerCase(), x.to.trim()]));
  const dmGeneralMerchant = "DM General";
  const companies = new Set(settings.companyNames.filter(Boolean).map(vaultCompanyName));
  const amounts = new Map<string, Map<string, number>>();
  const invoiceRows: Array<{ order: string; invoice: string; date: string; company: string; merchant: string; originalMerchant: string; allocation: string; coupons: string; warehouse: string; source: string; sale: number }> = [];
  let orderCount = 0;
  for (const order of orders) {
    if (order.financialStatus?.toLowerCase() === "voided" || order.fulfillmentStage.toLowerCase() === "returned_to_store") continue;
    const company = vaultCompanyName(warehouse.get((order.erpnextWarehouse || "").trim().toLowerCase()) || order.companyLocation.erpnextCompany || order.companyLocation.name);
    companies.add(company);
    const coupon = getMerchantCouponCode({ sourceName: order.sourceName, discountCodes: order.discountCodes, rawPayload: order.rawPayload, assignedMerchantCouponCodes: order.assignedMerchant?.couponCodes, joinAllDiscountCodes: true });
    const codes = (coupon || "").split(",").map(code => code.trim()).filter(Boolean);
    if (promotion && !promotion.codes.some(needle => codes.some(code => promotion.mode === "exact" ? code.toLowerCase() === needle : promotion.mode === "starts" ? code.toLowerCase().startsWith(needle) : code.toLowerCase().includes(needle)))) continue;
    const mappedCouponMerchant = codes.map(code => mapped.get(code.toLowerCase()) || mapped.get(code.split("-")[0].toLowerCase())).find(Boolean);
    const dmGeneralCoupon = codes.some(code => code.replace(/[\s-]/g, "_").toLowerCase() === "dm_general");
    const merchant = overrides.get((order.erpnextInvoiceId || order.name || "").toLowerCase())
      || settings.specialCoupons.find(x => codes.some(code => code.toLowerCase() === x.from.trim().toLowerCase()))?.to
      || mappedCouponMerchant
      || (dmGeneralCoupon ? dmGeneralMerchant : undefined)
      || emails.get((order.assignedMerchant?.email || "").trim().toLowerCase())
      || (company.toLowerCase() === "supplementvault" ? dmGeneralMerchant : "Unassigned");
    const amount = salesAmountExcludingShipping(order) ?? Number(order.totalPrice);
    let remaining = amount;
    const date = order.createdAt.toISOString().slice(0, 10);
    const credit = (name: string, value: number, allocation: string) => {
      const values = amounts.get(name) || new Map<string, number>();
      values.set(company, (values.get(company) || 0) + value);
      amounts.set(name, values);
      invoiceRows.push({ order: order.name || "", invoice: order.erpnextInvoiceId || order.name || "", date, company, merchant: name, originalMerchant: merchant, allocation, coupons: codes.join(", "), warehouse: order.erpnextWarehouse || "", source: order.sourceName || "", sale: value });
    };
    for (const allocation of settings.allocations) if (allocation.from.toLowerCase() === merchant.toLowerCase() && date >= allocation.fromDate && date <= allocation.toDate) {
      const moved = Math.min(remaining, amount * allocation.percent / 100);
      credit(allocation.to, moved, `${allocation.percent}% from ${merchant}`); remaining -= moved;
    }
    credit(merchant, remaining, remaining === amount ? "Resolved merchant" : "Remaining after allocation");
    orderCount++;
  }
  const companyNames = [...companies];
  const merchants = [...settings.merchants, ...[...amounts.keys()].filter(x => !settings.merchants.some(y => y.toLowerCase() === x.toLowerCase()))];
  const orderedMerchants = [...merchants.filter(merchant => merchant.toLowerCase() !== "dm general"), ...merchants.filter(merchant => merchant.toLowerCase() === "dm general")];
  const elapsedDays = Math.max(1, Number(to.slice(8, 10)));
  const daysInMonth = new Date(Number(to.slice(0, 4)), Number(to.slice(5, 7)), 0).getDate();
  const remainingDays = Math.max(0, daysInMonth - elapsedDays);
  const rows = orderedMerchants.map(merchant => {
    const sales = companyNames.map(company => amounts.get(merchant)?.get(company) || 0);
    const totalSale = sales.reduce((sum, value) => sum + value, 0);
    const target = settings.targets.find(item => item.merchant.toLowerCase() === merchant.toLowerCase())?.target || 0;
    return { merchant, sales, totalSale, target, achievement: target ? totalSale / target : null, balance: target ? Math.max(0, target - totalSale) : null, perDayTarget: target ? Math.max(0, target - totalSale) / Math.max(1, remainingDays) : null, forecast: totalSale / elapsedDays * daysInMonth, forecastAchievement: target ? totalSale / elapsedDays * daysInMonth / target : null };
  });
  return { settings, companies: companyNames, rows, totals: companyNames.map((_, i) => rows.reduce((sum, row) => sum + row.sales[i], 0)), totalTarget: rows.reduce((sum, row) => sum + row.target, 0), daysInMonth, elapsedDays, orderCount, invoiceRows, from, to };
}

export async function vaultWorkbook(report: Awaited<ReturnType<typeof vaultReport>>) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sales Report");
  const totalColumn = report.companies.length + 3;
  const last = report.companies.length + 8;
  const headerRow = 4;
  const border = { top: { style: "thin" as const, color: { argb: "FF4B5563" } }, left: { style: "thin" as const, color: { argb: "FF4B5563" } }, bottom: { style: "thin" as const, color: { argb: "FF4B5563" } }, right: { style: "thin" as const, color: { argb: "FF4B5563" } } };
  ws.mergeCells(1, 1, 1, last);
  ws.getCell("A1").value = "VAULT SALES REPORT";
  ws.getCell("A1").font = { bold: true, size: 16, color: { argb: "FF1F2937" } };
  ws.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 28;
  ws.mergeCells(2, 1, 2, last);
  ws.getCell("A2").value = `Invoice date: ${report.from} to ${report.to}`;
  ws.getCell("A2").font = { italic: true, color: { argb: "FF4B5563" } };
  ws.getCell("A2").alignment = { horizontal: "center" };
  ws.getRow(3).height = 8;
  const header = ws.getRow(headerRow);
  header.values = ["Merchant Name", "Target", ...report.companies.map(company => `${company} Sale`), "Total Sale", "Achievement %", "Balance", "Per Day Target", "Forecast Month End Achievement", "Forecast Achievement %"];
  header.height = 34;
  header.eachCell(cell => {
    cell.font = { bold: true, color: { argb: "FF0F172A" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF38BDF8" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = border;
  });
  for (const item of report.rows) {
    const row = ws.addRow([item.merchant, item.target || null, ...item.sales, item.totalSale, item.achievement, item.balance, item.perDayTarget, item.forecast, item.forecastAchievement]);
    row.getCell(totalColumn).value = { formula: `SUM(C${row.number}:${ws.getColumn(totalColumn - 1).letter}${row.number})`, result: item.totalSale };
    row.eachCell(cell => { cell.border = border; cell.alignment = { vertical: "middle" }; });
    if (item.merchant === "DM General") row.eachCell(cell => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCD5B5" } }; });
  }
  const totalSale = report.totals.reduce((sum, value) => sum + value, 0);
  const total = ws.addRow(["Grand Total", report.totalTarget, ...report.totals, totalSale, report.totalTarget ? totalSale / report.totalTarget : null, report.totalTarget ? Math.max(0, report.totalTarget - totalSale) : null, report.totalTarget ? Math.max(0, report.totalTarget - totalSale) / Math.max(1, report.daysInMonth - report.elapsedDays) : null, totalSale / report.elapsedDays * report.daysInMonth, report.totalTarget ? totalSale / report.elapsedDays * report.daysInMonth / report.totalTarget : null]);
  total.getCell(totalColumn).value = { formula: `SUM(C${total.number}:${ws.getColumn(totalColumn - 1).letter}${total.number})`, result: totalSale };
  total.eachCell(cell => { cell.font = { bold: true }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9EAD3" } }; cell.border = border; });
  ws.getColumn(1).width = 28;
  for (let col = 2; col <= last; col++) { ws.getColumn(col).width = col === last - 1 ? 24 : 18; ws.getColumn(col).numFmt = "#,##0.00"; }
  for (const col of [report.companies.length + 4, report.companies.length + 8]) ws.getColumn(col).numFmt = "0.0%";
  ws.autoFilter = { from: `A${headerRow}`, to: `${ws.getColumn(last).letter}${total.number}` };
  ws.views = [{ state: "frozen", ySplit: headerRow, xSplit: 1 }];

  const detail = wb.addWorksheet("Invoice Wise Breakdown");
  detail.addRow(["Order", "Invoice", "Invoice Date", "Company", "Allocated Merchant", "Original Merchant", "Allocation", "Coupon Codes", "Warehouse", "Source", "Sale"]);
  for (const item of report.invoiceRows) detail.addRow([item.order, item.invoice, item.date, item.company, item.merchant, item.originalMerchant, item.allocation, item.coupons, item.warehouse, item.source, item.sale]);
  detail.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  detail.getRow(1).eachCell(cell => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF8EA9DB" } }; });
  detail.columns.forEach((column, index) => { column.width = index === 7 ? 32 : index === 10 ? 18 : 22; });
  detail.getColumn(11).numFmt = "#,##0.00";
  detail.autoFilter = { from: "A1", to: `K${Math.max(1, detail.rowCount)}` };
  detail.views = [{ state: "frozen", ySplit: 1 }];
  return wb.xlsx.writeBuffer();
}
