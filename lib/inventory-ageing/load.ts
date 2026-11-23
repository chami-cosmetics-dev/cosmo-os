import "server-only";

import { prisma } from "@/lib/prisma";
import { isIntercompanyPurchaseSupplier } from "@/lib/osf/erp-purchases";
import { getAllOsfErpInstances, type OsfErpCredentials } from "@/lib/osf/erp-stock";
import { calculateAgeing, type AgeingItem, type AgeingMovement, type AgeingReceipt, type IntercompanySource } from "./calculate";

type ErpRow = Record<string, unknown>;
export type InventoryAgeingProgress = { percent: number; status: string };
const PAGE = 500;
const LEDGER_PAGE = 200;
const CHUNK = 80;
const MAX_PAGE_ATTEMPTS = 4;
const str = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const chunks = <T,>(list: T[], length = CHUNK) => Array.from({ length: Math.ceil(list.length / length) }, (_, i) => list.slice(i * length, (i + 1) * length));

async function erpList(
  cfg: OsfErpCredentials,
  doctype: string,
  fields: string[],
  filters: unknown[] = [],
  onPage?: (page: { offset: number; count: number }) => void,
): Promise<ErpRow[]> {
  const all: ErpRow[] = [];
  const pageSize = doctype === "Stock Ledger Entry" ? LEDGER_PAGE : PAGE;
  for (let offset = 0; ; offset += pageSize) {
    const params = new URLSearchParams({ fields: JSON.stringify(fields), filters: JSON.stringify(filters),
      limit_start: String(offset), limit_page_length: String(pageSize), order_by: "creation asc, name asc" });
    let page: ErpRow[] | null = null;
    for (let attempt = 1; attempt <= MAX_PAGE_ATTEMPTS; attempt++) {
      try {
        const response = await fetch(`${cfg.baseUrl}/api/resource/${encodeURIComponent(doctype)}?${params}`, {
          headers: { Authorization: `token ${cfg.apiKey}:${cfg.apiSecret}`, Accept: "application/json" },
          cache: "no-store", signal: AbortSignal.timeout(30000),
        });
        if (!response.ok) {
          const error = new Error(`${doctype} ERP request failed (${response.status}): ${(await response.text()).slice(0, 180)}`);
          if (![408, 429, 502, 503, 504].includes(response.status)) throw error;
          throw Object.assign(error, { retryable: true });
        }
        const result = ((await response.json()) as { data?: ErpRow[] }).data;
        if (!Array.isArray(result)) throw new Error(`${doctype} ERP response has no data array at offset ${offset}`);
        page = result;
        break;
      } catch (error) {
        const transient = error instanceof TypeError || (error instanceof Error && (error.name === "TimeoutError" || (error as Error & { retryable?: boolean }).retryable));
        if (!transient || attempt === MAX_PAGE_ATTEMPTS) {
          throw new Error(`${doctype} ERP page ${offset} failed after ${attempt} attempt(s): ${error instanceof Error ? error.message : String(error)}`, { cause: error });
        }
        await new Promise((resolve) => setTimeout(resolve, 350 * 2 ** (attempt - 1)));
      }
    }
    if (!page) throw new Error(`${doctype} ERP page ${offset} could not be loaded`);
    all.push(...page);
    onPage?.({ offset, count: page.length });
    if (page.length < pageSize) return all;
  }
}

async function byNames(cfg: OsfErpCredentials, doctype: string, fields: string[], names: string[], field = "name") {
  const rows: ErpRow[] = [];
  for (const batch of chunks([...new Set(names)].filter(Boolean))) rows.push(...await erpList(cfg, doctype, fields, [[field, "in", batch]]));
  return rows;
}

function dateOnly(value: unknown) { return str(value).slice(0, 10); }

export async function loadInventoryAgeing(
  companyId: string,
  reportDate: string,
  onProgress?: (progress: InventoryAgeingProgress) => void,
) {
  const progress = onProgress ?? (() => undefined);
  progress({ percent: 2, status: "Loading catalogue and ERP configuration" });
  const [instances, locations, catalogueRows] = await Promise.all([
    getAllOsfErpInstances(companyId),
    prisma.companyLocation.findMany({ where: { companyId }, select: { erpnextCompany: true, erpnextInstanceId: true, supplierPrefix: true } }),
    prisma.productItem.findMany({
      where: { companyId, sku: { not: null }, barcode: { not: null } },
      select: { sku: true, barcode: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  if (!instances.length) throw new Error("No ERP connection configured");
  progress({ percent: 6, status: "Preparing ERP company mappings" });
  const allMovements: AgeingMovement[] = [];
  const allReceipts: AgeingReceipt[] = [];
  const metadata = new Map<string, Pick<AgeingItem, "stockUom" | "barcode" | "description" | "brand" | "sellingRate" | "currency">>();
  const dataWarnings: string[] = [];
  const catalogueBarcodes = new Map<string, string>();
  for (const row of catalogueRows) {
    const sku = str(row.sku);
    const barcode = str(row.barcode);
    if (!sku || !barcode) continue;
    if (!catalogueBarcodes.has(sku)) catalogueBarcodes.set(sku, barcode);
    if (!catalogueBarcodes.has(sku.toUpperCase())) catalogueBarcodes.set(sku.toUpperCase(), barcode);
  }
  let scopedCompanies = 0;
  const totalCompanies = Math.max(1, locations.filter((location) => Boolean(location.erpnextCompany?.trim())).length);
  let completedCompanies = 0;
  for (const instance of instances) {
    const erpCompanies = [...new Set(locations.filter((l) => !l.erpnextInstanceId || l.erpnextInstanceId === instance.id).map((l) => l.erpnextCompany?.trim()).filter((x): x is string => Boolean(x)))];
    if (!erpCompanies.length) continue;
    scopedCompanies += erpCompanies.length;
    const prefixes = [...new Set(locations.map((l) => l.supplierPrefix?.trim()).filter((x): x is string => Boolean(x)))];
    const companyRows = await byNames(instance.cfg, "Company", ["name", "default_currency"], erpCompanies);
    const currencies = new Map(companyRows.map((r) => [str(r.name), str(r.default_currency)]));
    // Full historical SLE scan; never restrict to recent receipts or a fixed number of pages.
    const movements: AgeingMovement[] = [];
    for (const company of erpCompanies) {
      const companyStart = 8 + Math.round((completedCompanies / totalCompanies) * 52);
      progress({ percent: companyStart, status: `Loading stock ledger for ${company}` });
      let ledgerPages = 0;
      const sle = await erpList(
        instance.cfg,
        "Stock Ledger Entry",
        ["name", "company", "item_code", "warehouse", "posting_date", "posting_time", "creation", "actual_qty", "qty_after_transaction", "valuation_rate", "voucher_type", "voucher_no", "voucher_detail_no", "is_cancelled"],
        [["company", "=", company], ["posting_date", "<=", reportDate]],
        () => {
          ledgerPages += 1;
          progress({ percent: Math.min(60, companyStart + Math.min(8, ledgerPages)), status: `Loading stock ledger for ${company} — ${ledgerPages} page${ledgerPages === 1 ? "" : "s"}` });
        },
      );
      for (const r of sle) {
        if (["1", "yes", "true"].includes(str(r.is_cancelled).toLowerCase())) continue;
        movements.push({ erp: instance.id, company, itemCode: str(r.item_code), warehouse: str(r.warehouse), postingDate: dateOnly(r.posting_date), postingTime: str(r.posting_time), creation: str(r.creation), name: str(r.name), qty: num(r.actual_qty), balance: r.qty_after_transaction == null ? null : num(r.qty_after_transaction), valuationRate: r.valuation_rate == null ? null : num(r.valuation_rate), voucherType: str(r.voucher_type), voucherNo: str(r.voucher_no), voucherDetailNo: str(r.voucher_detail_no) || null });
      }
      completedCompanies += 1;
      progress({ percent: 8 + Math.round((completedCompanies / totalCompanies) * 52), status: `Stock ledger loaded for ${company}` });
    }
    allMovements.push(...movements);
    progress({ percent: 62, status: `Matching Purchase Receipts for ${instance.label ?? "ERP"}` });
    const prNames = [...new Set(movements.filter((m) => m.voucherType === "Purchase Receipt").map((m) => m.voucherNo))];
    const prParents = await byNames(instance.cfg, "Purchase Receipt", ["name", "company", "supplier", "supplier_name", "creation", "docstatus", "is_return"], prNames);
    const validPr = prParents.filter((p) => num(p.docstatus) === 1 && num(p.is_return) !== 1 && erpCompanies.includes(str(p.company)));
    const prJoined = await byNames(instance.cfg, "Purchase Receipt", [
      "name", "company", "supplier", "supplier_name", "creation", "docstatus", "is_return",
      "`tabPurchase Receipt Item`.name as pr_item_name",
      "`tabPurchase Receipt Item`.item_code",
      "`tabPurchase Receipt Item`.stock_qty",
      "`tabPurchase Receipt Item`.stock_uom",
    ], validPr.map((p) => str(p.name)));
    const prItems: ErpRow[] = prJoined.map((p) => ({ ...p, parent: str(p.name), name: str(p.pr_item_name) }));
    // Frappe denies direct child-Doctype reads for this token. Query linked child fields
    // through the permitted Purchase Invoice parent, as the purchasing history does.
    const piJoined: ErpRow[] = [];
    progress({ percent: 70, status: `Loading linked Purchase Invoice costs for ${instance.label ?? "ERP"}` });
    for (const company of erpCompanies) for (const batch of chunks(validPr.filter((p) => str(p.company) === company).map((p) => str(p.name)))) {
      piJoined.push(...await erpList(instance.cfg, "Purchase Invoice", [
        "name", "company", "supplier", "posting_date", "creation", "docstatus", "is_return",
        "`tabPurchase Invoice Item`.name as pi_item_name",
        "`tabPurchase Invoice Item`.purchase_receipt",
        "`tabPurchase Invoice Item`.pr_detail",
        "`tabPurchase Invoice Item`.item_code",
        "`tabPurchase Invoice Item`.stock_qty",
        "`tabPurchase Invoice Item`.base_net_amount",
      ], [["company", "=", company], ["posting_date", "<=", reportDate], ["docstatus", "=", 1], ["Purchase Invoice Item", "purchase_receipt", "in", batch]]));
    }
    const piItems: ErpRow[] = piJoined.map((p) => ({ ...p, parent: str(p.name), name: str(p.pi_item_name) }));
    const piByName = new Map(piJoined.map((p) => [str(p.name), p]));
    const piByPrItem = new Map<string, ErpRow[]>();
    for (const pi of piItems) {
      const key = JSON.stringify([str(pi.purchase_receipt), str(pi.pr_detail)]);
      piByPrItem.set(key, [...(piByPrItem.get(key) ?? []), pi]);
    }
    const prByName = new Map(validPr.map((p) => [str(p.name), p]));
    for (const item of prItems) {
      const pr = prByName.get(str(item.parent));
      if (!pr) continue;
      const linked = piByPrItem.get(JSON.stringify([str(pr.name), str(item.name)])) ?? [];
      let invoicedQty = 0, invoiceAmount = 0;
      const seen = new Set<string>();
      for (const line of linked) {
        if (seen.has(str(line.name))) continue;
        seen.add(str(line.name));
        const parent = piByName.get(str(line.parent));
        if (!parent || num(parent.docstatus) !== 1 || dateOnly(parent.posting_date) > reportDate || dateOnly(parent.creation) > reportDate) continue;
        if (str(parent.company) !== str(pr.company) || str(parent.supplier) !== str(pr.supplier) || str(line.item_code) !== str(item.item_code)) continue;
        // Submitted returns carry negative stock quantities and amounts in ERPNext.
        invoicedQty += num(line.stock_qty);
        invoiceAmount += num(line.base_net_amount);
      }
      allReceipts.push({ erp: instance.id, company: str(pr.company), name: str(pr.name), itemName: str(item.name), itemCode: str(item.item_code), supplier: str(pr.supplier), creation: str(pr.creation), intercompany: isIntercompanyPurchaseSupplier(str(pr.supplier), str(pr.supplier_name), prefixes), stockQty: num(item.stock_qty), invoicedQty: Math.max(0, invoicedQty), invoiceAmount });
    }
    const itemCodes = [...new Set(movements.map((m) => m.itemCode))];
    progress({ percent: 82, status: `Loading item details for ${instance.label ?? "ERP"}` });
    const itemRows = await byNames(instance.cfg, "Item", ["name", "item_name", "description", "brand", "stock_uom"], itemCodes);
    let priceRows: ErpRow[] = [];
    try {
      priceRows = await byNames(instance.cfg, "Item Price", ["name", "item_code", "price_list", "uom", "price_list_rate", "currency", "valid_from", "valid_upto", "selling"], itemCodes, "item_code");
    } catch (error) {
      dataWarnings.push(`${instance.label ?? instance.id}: Standard Selling rates are unavailable; selling rates are blank (${error instanceof Error ? error.message.slice(0, 100) : "unknown error"})`);
    }
    for (const company of erpCompanies) for (const item of itemRows) {
      const code = str(item.name);
      const stockUom = str(item.stock_uom);
      const currency = currencies.get(company) || null;
      const validPrices = priceRows.filter((p) => str(p.item_code) === code && str(p.price_list) === "Standard Selling" && (!str(p.uom) || str(p.uom) === stockUom) && (!currency || str(p.currency) === currency) && (!dateOnly(p.valid_from) || dateOnly(p.valid_from) <= reportDate) && (!dateOnly(p.valid_upto) || dateOnly(p.valid_upto) >= reportDate));
      metadata.set(JSON.stringify([instance.id, company, code]), { stockUom, barcode: catalogueBarcodes.get(code) ?? catalogueBarcodes.get(code.toUpperCase()) ?? null, description: str(item.item_name) || str(item.description) || null, brand: str(item.brand) || null, sellingRate: validPrices.length === 1 ? num(validPrices[0]!.price_list_rate) : null, currency });
    }
  }
  if (!scopedCompanies) throw new Error("No ERP company mappings configured for inventory ageing");
  progress({ percent: 90, status: "Tracing intercompany returns to source stock" });
  const intercompanySources: IntercompanySource[] = [];
  const intercompanyReceipts = allReceipts.filter((r) => r.intercompany);
  const receiptNames = [...new Set(intercompanyReceipts.map((r) => r.name))];
  const warnedReceipts = new Set<string>();
  for (const batch of chunks(receiptNames)) {
    const [current, backfill, special] = await Promise.all([
      prisma.grnPurchaseReceipt.findMany({ where: { companyId, name: { in: batch } }, select: { name: true, supplierStockReturnName: true, supplierStockReturnLinks: { select: { supplierStockReturn: { select: { name: true, docstatus: true, deletedAt: true } } } } } }),
      prisma.grnBackfillPurchaseReceipt.findMany({ where: { companyId, name: { in: batch } }, select: { name: true, supplierStockReturnLinks: { select: { supplierStockReturn: { select: { name: true, docstatus: true, deletedAt: true } } } } } }),
      prisma.grnSpecialLink.findMany({ where: { companyId, purchaseReceiptName: { in: batch } }, select: { purchaseReceiptName: true, supplierStockReturnName: true } }),
    ]);
    const links = new Map<string, Set<string>>();
    for (const row of current) {
      const names = [row.supplierStockReturnName, ...row.supplierStockReturnLinks.filter((l) => l.supplierStockReturn.docstatus === 1 && !l.supplierStockReturn.deletedAt).map((l) => l.supplierStockReturn.name)].filter((v): v is string => Boolean(v));
      links.set(row.name, new Set([...(links.get(row.name) ?? []), ...names]));
    }
    for (const row of backfill) links.set(row.name, new Set([...(links.get(row.name) ?? []), ...row.supplierStockReturnLinks.filter((l) => l.supplierStockReturn.docstatus === 1 && !l.supplierStockReturn.deletedAt).map((l) => l.supplierStockReturn.name)]));
    for (const row of special) links.set(row.purchaseReceiptName, new Set([...(links.get(row.purchaseReceiptName) ?? []), row.supplierStockReturnName]));
    const ssrNames = [...new Set([...links.values()].flatMap((v) => [...v]))];
    if (!ssrNames.length) continue;
    const [ssrs, backfillSsrs, returns, backfillReturns, materialIssues] = await Promise.all([
      prisma.grnSupplierStockReturn.findMany({ where: { companyId, name: { in: ssrNames }, docstatus: 1, deletedAt: null }, select: { name: true, rawPayload: true } }),
      prisma.grnBackfillSupplierStockReturn.findMany({ where: { companyId, name: { in: ssrNames }, docstatus: 1, deletedAt: null }, select: { name: true, rawPayload: true } }),
      prisma.grnPurchaseInvoice.findMany({ where: { companyId, docstatus: 1, isReturn: 1, OR: [{ supplierStockReturnName: { in: ssrNames } }, { items: { some: { supplierStockReturn: { in: ssrNames } } } }] }, select: { name: true, supplierStockReturnName: true, items: { select: { itemCode: true, supplierStockReturn: true } } } }),
      prisma.grnBackfillPurchaseInvoice.findMany({ where: { companyId, docstatus: 1, isReturn: 1, OR: [{ supplierStockReturnName: { in: ssrNames } }, { items: { some: { supplierStockReturn: { in: ssrNames } } } }] }, select: { name: true, supplierStockReturnName: true, items: { select: { itemCode: true, supplierStockReturn: true } } } }),
      prisma.grnSupplierStockReturnMaterialIssueLink.findMany({ where: { companyId, supplierStockReturnName: { in: ssrNames } }, select: { supplierStockReturnName: true, materialIssue: { select: { name: true, docstatus: true, postingDate: true, items: { select: { itemCode: true, qty: true, effectiveRate: true } } } } } }),
    ]);
    const companyBySsr = new Map([...ssrs, ...backfillSsrs].map((s) => [s.name, str((s.rawPayload as Record<string, unknown> | null)?.company)]));
    const activeSsrNames = new Set(companyBySsr.keys());
    const returnsBySsr = new Map<string, IntercompanySource["returnItems"]>();
    const legacyBySsr = new Map<string, NonNullable<IntercompanySource["legacyItems"]>>();
    for (const pi of [...returns, ...backfillReturns]) for (const item of pi.items) {
      const ssr = item.supplierStockReturn || pi.supplierStockReturnName;
      if (ssr) returnsBySsr.set(ssr, [...(returnsBySsr.get(ssr) ?? []), { voucher: pi.name, voucherType: "Purchase Invoice", itemCode: item.itemCode }]);
    }
    for (const link of materialIssues) if (link.materialIssue.docstatus === 1) for (const item of link.materialIssue.items) {
      returnsBySsr.set(link.supplierStockReturnName, [...(returnsBySsr.get(link.supplierStockReturnName) ?? []), { voucher: link.materialIssue.name, voucherType: "Stock Entry", itemCode: item.itemCode }]);
      legacyBySsr.set(link.supplierStockReturnName, [...(legacyBySsr.get(link.supplierStockReturnName) ?? []), { voucher: link.materialIssue.name, itemCode: item.itemCode, qty: Math.abs(num(item.qty)), rate: item.effectiveRate == null ? null : Math.abs(num(item.effectiveRate)), postingDate: link.materialIssue.postingDate?.toISOString().slice(0, 10) ?? "" }]);
    }
    // Older SSRs may predate the GRN Material Issue link table. ERP keeps their
    // exact SSR identifier in the Supplier Return Stock Entry remarks.
    const missingLegacy = ssrNames.filter((name) => activeSsrNames.has(name) && !(returnsBySsr.get(name)?.length));
    for (const instance of instances) for (const names of chunks(missingLegacy)) {
      let entries: ErpRow[] = [];
      try {
        entries = await erpList(instance.cfg, "Stock Entry", [
          "name", "company", "posting_date", "stock_entry_type", "remarks",
          "`tabStock Entry Detail`.item_code", "`tabStock Entry Detail`.qty",
          "`tabStock Entry Detail`.basic_rate", "`tabStock Entry Detail`.valuation_rate",
        ], [["remarks", "in", names.map((name) => `Supplier Return: ${name}`)], ["docstatus", "=", 1], ["stock_entry_type", "=", "Supplier Return"], ["posting_date", "<=", reportDate]]);
      } catch (error) {
        dataWarnings.push(`${instance.label ?? instance.id}: legacy Supplier Return entries unavailable (${error instanceof Error ? error.message.slice(0, 100) : "unknown error"})`);
        continue;
      }
      for (const entry of entries) {
        const ssrName = str(entry.remarks).replace(/^Supplier Return:\s*/i, "");
        if (!names.includes(ssrName) || str(entry.company) !== companyBySsr.get(ssrName)) continue;
        const itemCode = str(entry.item_code);
        const qty = Math.abs(num(entry.qty));
        if (!itemCode || qty <= 0) continue;
        const voucher = str(entry.name);
        const rate = entry.basic_rate == null && entry.valuation_rate == null ? null : Math.abs(num(num(entry.basic_rate) > 0 ? entry.basic_rate : entry.valuation_rate ?? entry.basic_rate));
        returnsBySsr.set(ssrName, [...(returnsBySsr.get(ssrName) ?? []), { voucher, voucherType: "Stock Entry", itemCode }]);
        legacyBySsr.set(ssrName, [...(legacyBySsr.get(ssrName) ?? []), { voucher, itemCode, qty, rate, postingDate: dateOnly(entry.posting_date) }]);
      }
    }
    for (const r of intercompanyReceipts.filter((r) => batch.includes(r.name))) {
      const receiptKey = JSON.stringify([r.erp, r.company, r.name]);
      if (warnedReceipts.has(receiptKey)) continue;
      warnedReceipts.add(receiptKey);
      const ssrLinks = [...(links.get(r.name) ?? [])].filter((name) => activeSsrNames.has(name));
      if (ssrLinks.length !== 1) { if (ssrLinks.length > 1) dataWarnings.push(`${r.name}: multiple SSR links; source stock cannot be assigned safely`); continue; }
      const ssrName = ssrLinks[0]!;
      const sourceCompany = companyBySsr.get(ssrName);
      if (!sourceCompany) { dataWarnings.push(`${r.name}: source SSR ${ssrName} has no ERP company`); continue; }
      intercompanySources.push({ receiptErp: r.erp, receiptCompany: r.company, receiptName: r.name, ssrName, sourceCompany, returnItems: returnsBySsr.get(ssrName) ?? [], legacyItems: legacyBySsr.get(ssrName) });
    }
  }
  progress({ percent: 94, status: "Allocating remaining stock and calculating ageing" });
  const report = calculateAgeing({ reportDate, movements: allMovements, receipts: allReceipts, metadata, intercompanySources });
  progress({ percent: 99, status: "Finalising ageing summary" });
  return { ...report, dataWarnings, historicalState: "Reconstructed from current submitted document state; earlier cancellations or amendments may not be recoverable" };
}
