import * as ExcelJS from "exceljs";
import * as fflate from "fflate";
import SaleEngine from "./engine";
import { SALES_REPORT_DEFAULTS } from "./defaults";
import { loadSalesReportInputs } from "./data";
import { loadSalesReportConfig } from "./config";

type ReportSettings = Record<string, unknown>;

(globalThis as typeof globalThis & { fflate?: typeof fflate }).fflate = fflate;

export function mergeSalesReportSettings(saved?: ReportSettings) {
  const settings = JSON.parse(JSON.stringify(SALES_REPORT_DEFAULTS)) as ReportSettings;
  if (!saved || typeof saved !== "object") return settings;
  const source = saved.maps ? { ...saved, ...(saved.maps as ReportSettings), ...(saved.options as ReportSettings) } : saved;
  for (const key of Object.keys(settings)) if (source[key] !== undefined) settings[key] = source[key];
  return settings;
}

export function salesReportSettingsForClient(settings: ReportSettings) {
  return {
    rows: settings.rows,
    saleAllocations: settings.saleAllocations,
    maps: { ship: settings.ship, mer: settings.mer, special: settings.special, email: settings.email, override: settings.override, vatTo: settings.vatTo, noVatCoupons: settings.noVatCoupons, poya: settings.poya, outletWarehouses: settings.outletWarehouses },
    options: { shopifyDefault: settings.shopifyDefault, staffKeyword: settings.staffKeyword, vatLocation: settings.vatLocation, palmersBrand: settings.palmersBrand, excludeStatus: settings.excludeStatus },
  };
}

export async function runSalesReport(companyId: string, fromDate: string, toDate: string, savedSettings?: ReportSettings) {
  const settings = mergeSalesReportSettings(savedSettings ?? await loadSalesReportConfig(companyId));
  const input = await loadSalesReportInputs(companyId, fromDate, toDate);
  const result = SaleEngine.processDump(input.dump2, settings, SaleEngine.isoToSerial(toDate), { rangeStartSerial: SaleEngine.isoToSerial(fromDate) });
  const vat = SaleEngine.processVat(input.dump3, input.itemList, result, settings);
  return { input, result: { ...result, vat }, settings };
}

export async function runSalesPromotion(companyId: string, fromDate: string, toDate: string, codes: string[], mode: "exact" | "starts" | "contains", savedSettings?: ReportSettings) {
  const settings = mergeSalesReportSettings(savedSettings ?? await loadSalesReportConfig(companyId));
  const input = await loadSalesReportInputs(companyId, fromDate, toDate);
  const result = SaleEngine.processDump(input.dump2, settings, SaleEngine.isoToSerial(toDate), { promo: { codes, mode, from: SaleEngine.isoToSerial(fromDate), to: SaleEngine.isoToSerial(toDate) } });
  return { input, result, summary: SaleEngine.promoSummary(result, settings), settings };
}

export async function buildSalesReportFile(companyId: string, fromDate: string, toDate: string, kind: "final" | "workings" | "review" | "promotion", savedSettings?: ReportSettings, promotion?: { codes: string[]; mode: "exact" | "starts" | "contains" }) {
  const { result, settings } = await runSalesReport(companyId, fromDate, toDate, savedSettings);
  const dot = `${fromDate.split("-").reverse().join(".")}-${toDate.split("-").reverse().join(".")}`;
  if (kind === "promotion") {
    if (!promotion?.codes.length) throw new Error("Enter at least one coupon code");
    const promo = await runSalesPromotion(companyId, fromDate, toDate, promotion.codes, promotion.mode, settings);
    const meta = { codes: promotion.codes.map((code) => code.toUpperCase()), modeLabel: `${promotion.mode} code`, fromISO: fromDate, toISO: toDate };
    return { buffer: await SaleEngine.buildPromoWorkbook(ExcelJS, promo.result, promo.summary, meta), fileName: `Promotion Analysis ${promotion.codes.join(" ")} ${dot}.xlsx` };
  }
  if (kind === "review") return { buffer: await SaleEngine.buildReview(ExcelJS, result), fileName: `Cosmetics Review ${dot}.xlsx` };
  if (kind === "workings") return { buffer: await SaleEngine.buildWorkings(ExcelJS, result, settings), fileName: `Sale Workings ${dot}.xlsx` };
  return { buffer: await SaleEngine.buildCosmoReport(ExcelJS, result, settings), fileName: `Merchants Targets Achievement ${dot}.xlsx` };
}
