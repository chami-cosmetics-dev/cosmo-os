export const AGE_BUCKETS = ["0_30", "31_60", "61_90", "91_150", "above_150"] as const;
export type AgeBucket = typeof AGE_BUCKETS[number];
export type AgeingLayer = {
  erp: string; company: string; itemCode: string; warehouse: string;
  prName: string | null; prItemName: string | null; supplier: string | null;
  prCreation: string | null; intercompany: boolean; qty: number;
  unitCost: number | null; pricedQty: number; costStatus: "Complete" | "Partial PI" | "Pending PI" | "Unallocated";
  originOffset?: number;
  openingStock?: boolean;
  materialReceipt?: boolean;
  sourceReference?: string;
  traceFailure?: string;
};
export type IntercompanySource = { receiptErp: string; receiptCompany: string; receiptName: string; ssrName: string; sourceCompany: string; returnItems: { voucher: string; voucherType: "Purchase Invoice" | "Stock Entry"; itemCode: string }[]; legacyItems?: { voucher: string; itemCode: string; qty: number; rate: number | null; postingDate: string }[] };
export type AgeingMovement = {
  erp: string; company: string; itemCode: string; warehouse: string;
  postingDate: string; postingTime: string; creation: string; name: string;
  qty: number; voucherType: string; voucherNo: string; voucherDetailNo: string | null;
  stockEntryType?: string | null;
  balance: number | null;
  valuationRate?: number | null;
};
export type AgeingReceipt = {
  erp: string; company: string; name: string; itemName: string; itemCode: string;
  supplier: string; creation: string; intercompany: boolean;
  stockQty: number; invoicedQty: number; invoiceAmount: number;
};
export type StockReturnLink = {
  erp: string; company: string;
  returnVoucherType: "Sales Invoice" | "Delivery Note";
  returnVoucher: string; returnItem: string;
  originalVoucherType: "Sales Invoice" | "Delivery Note";
  originalVoucher: string; originalItem: string;
};
export type AgeingItem = {
  erp: string; company: string; itemCode: string; stockUom: string;
  barcode: string | null; description: string | null; brand: string | null;
  sellingRate: number | null; currency: string | null;
  totalStockLeft: number; totalCost: number; unpricedQty: number;
  openingStock: number;
  costStatus: "Complete" | "Incomplete";
  buckets: Record<AgeBucket, { qty: number; cost: number }>;
  layers: (AgeingLayer & { bucket: AgeBucket | null })[];
};
export type AgeingDiagnostic = { erp: string; company: string; itemCode: string; warehouse: string; kind: string; detail: string; difference?: number };

const EPS = 1e-6;
const queueKey = (x: Pick<AgeingLayer, "erp" | "company" | "itemCode" | "warehouse">) => JSON.stringify([x.erp, x.company, x.itemCode, x.warehouse]);
const receiptKey = (erp: string, name: string, itemName: string) => JSON.stringify([erp, name, itemName]);
const clone = (x: AgeingLayer, qty: number): AgeingLayer => ({ ...x, qty });

export function bucketForAge(creation: string, reportDate: string): AgeBucket | null {
  const erpTimestamp = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(creation)
    ? `${creation.replace(" ", "T")}+05:30` : creation;
  const parsed = new Date(erpTimestamp);
  if (Number.isNaN(parsed.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(parsed).map((part) => [part.type, part.value]));
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  const age = Math.round((Date.parse(`${reportDate}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86400000);
  if (age < 0 || !Number.isFinite(age)) return null;
  return age <= 30 ? "0_30" : age <= 60 ? "31_60" : age <= 90 ? "61_90" : age <= 150 ? "91_150" : "above_150";
}

export function calculateAgeing(input: {
  reportDate: string; movements: AgeingMovement[]; receipts: AgeingReceipt[];
  intercompanySources?: IntercompanySource[];
  stockReturnLinks?: StockReturnLink[];
  metadata: Map<string, Pick<AgeingItem, "stockUom" | "barcode" | "description" | "brand" | "sellingRate" | "currency">>;
}) {
  const receipts = new Map(input.receipts.map((r) => [receiptKey(r.erp, r.name, r.itemName), r]));
  const queues = new Map<string, AgeingLayer[]>();
  const diagnostics: AgeingDiagnostic[] = [];
  const balance = new Map<string, number>();
  const transferPool = new Map<string, AgeingLayer[]>();
  const consumedSales = new Map<string, AgeingLayer[]>();
  const sources = input.intercompanySources ?? [];
  const stockReturns = new Map((input.stockReturnLinks ?? []).map((link) => [JSON.stringify([link.erp, link.company, link.returnVoucherType, link.returnVoucher, link.returnItem]), link]));
  const sourceByReceipt = new Map(sources.map((s) => [JSON.stringify([s.receiptErp, s.receiptCompany, s.receiptName]), s]));
  const ssrByReturn = new Map(sources.flatMap((s) => s.returnItems.map((item) => [JSON.stringify([s.sourceCompany, item.voucherType, item.voucher, item.itemCode]), s.ssrName] as const)));
  const returnedLayers = new Map<string, AgeingLayer[]>();
  const legacyBySsr = new Map<string, AgeingLayer[]>();
  for (const source of sources) for (const item of source.legacyItems ?? []) {
    const key = JSON.stringify([source.ssrName, item.itemCode]);
    if (legacyBySsr.has(key)) continue;
    legacyBySsr.set(key, (source.legacyItems ?? []).filter((candidate) => candidate.itemCode === item.itemCode).map((candidate) => ({
      erp: source.receiptErp, company: source.sourceCompany, itemCode: candidate.itemCode, warehouse: "",
      prName: candidate.voucher, prItemName: null, supplier: null,
      // A legacy Material Issue has no original PR date; use its posting date.
      prCreation: candidate.postingDate, intercompany: false, qty: candidate.qty,
      unitCost: candidate.rate, pricedQty: candidate.rate == null ? 0 : candidate.qty,
      costStatus: candidate.rate == null ? "Pending PI" : "Complete",
    })));
  }
  const sorted = input.movements.filter((m) => m.postingDate <= input.reportDate).sort((a, b) =>
    `${a.postingDate} ${a.postingTime} ${a.creation} ${a.name}`.localeCompare(`${b.postingDate} ${b.postingTime} ${b.creation} ${b.name}`));
  const take = (queue: AgeingLayer[], qty: number, preferredPr?: string | null) => {
    const taken: AgeingLayer[] = [];
    let remaining = qty;
    const ordered = preferredPr ? [...queue.filter((l) => l.prName === preferredPr), ...queue.filter((l) => l.prName !== preferredPr)] : [...queue];
    for (const layer of ordered) {
      if (remaining <= EPS) break;
      const amount = Math.min(layer.qty, remaining);
      if (amount <= EPS) continue;
      const offset = layer.originOffset ?? 0;
      layer.qty -= amount;
      layer.originOffset = offset + amount;
      taken.push({ ...clone(layer, amount), originOffset: offset });
      remaining -= amount;
    }
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i]!.qty <= EPS) queue.splice(i, 1);
    return { taken, remaining };
  };
  const transferKey = (m: AgeingMovement) => JSON.stringify([m.erp, m.company, m.itemCode, m.voucherType, m.voucherNo, m.voucherDetailNo]);
  for (const m of sorted) {
    const key = queueKey(m);
    const queue = queues.get(key) ?? [];
    queues.set(key, queue);
    const previous = balance.get(key) ?? 0;
    balance.set(key, m.balance ?? previous + m.qty);
    // ERP opening reconciliations can establish a stock balance with actual_qty=0.
    // Keep those units in FIFO so later deductions are correct, but report any
    // remaining opening units separately from ageing and purchase cost.
    if (m.voucherType === "Stock Reconciliation" && previous <= EPS && queue.length === 0 && (m.balance ?? 0) > EPS) {
      const qty = m.balance!;
      queue.push({ erp: m.erp, company: m.company, itemCode: m.itemCode, warehouse: m.warehouse,
        prName: m.voucherNo, prItemName: m.voucherDetailNo, supplier: null,
        prCreation: null, intercompany: false, openingStock: true,
        qty, unitCost: null, pricedQty: 0, costStatus: "Unallocated" });
      continue;
    }
    if (m.qty < -EPS) {
      const preferred = m.voucherType === "Purchase Receipt" ? m.voucherNo : null;
      // Some historical ERP ledgers establish stock with a balance-only entry
      // (actual_qty = 0). When that stock is later moved or sold, preserve the
      // known ERP balance as opening stock instead of inventing an unallocated
      // PR layer. It remains visible separately and never receives a cost/age.
      const attributedQty = queue.reduce((sum, layer) => sum + layer.qty, 0);
      const inferredOpeningQty = Math.max(0, previous - attributedQty);
      if (inferredOpeningQty > EPS) {
        queue.unshift({ erp: m.erp, company: m.company, itemCode: m.itemCode, warehouse: m.warehouse,
          prName: null, prItemName: null, supplier: null, prCreation: null, intercompany: false,
          openingStock: true, qty: inferredOpeningQty, unitCost: null, pricedQty: 0, costStatus: "Unallocated" });
      }
      const result = take(queue, -m.qty, preferred);
      const ssr = ssrByReturn.get(JSON.stringify([m.company, m.voucherType, m.voucherNo, m.itemCode]));
      if (ssr) {
        const sourceKey = JSON.stringify([ssr, m.itemCode]);
        returnedLayers.set(sourceKey, [...(returnedLayers.get(sourceKey) ?? []), ...result.taken]);
      }
      if (m.voucherType === "Stock Entry" || m.voucherType === "Material Transfer") {
        const poolKey = transferKey(m);
        transferPool.set(poolKey, [...(transferPool.get(poolKey) ?? []), ...result.taken]);
      } else if (m.voucherType === "Delivery Note" || m.voucherType === "Sales Invoice") {
        consumedSales.set(transferKey(m), result.taken);
      }
      if (result.remaining > EPS) diagnostics.push({ ...m, kind: "negative_stock", detail: `Outgoing ${-m.qty} exceeds attributed stock by ${result.remaining}`, difference: -result.remaining });
      continue;
    }
    if (m.qty <= EPS) continue;
    if (m.voucherType === "Stock Entry" && m.stockEntryType === "Material Receipt") {
      // Material Receipt stock is outside purchase-receipt ageing and cost, but
      // remains in FIFO so subsequent stock deductions stay correctly ordered.
      queue.push({ erp: m.erp, company: m.company, itemCode: m.itemCode, warehouse: m.warehouse,
        prName: m.voucherNo, prItemName: m.voucherDetailNo, supplier: null,
        prCreation: null, intercompany: false, materialReceipt: true,
        qty: m.qty, unitCost: null, pricedQty: 0, costStatus: "Unallocated" });
      continue;
    }
    const r = m.voucherType === "Purchase Receipt" ? receipts.get(receiptKey(m.erp, m.voucherNo, m.voucherDetailNo ?? "")) : undefined;
    if (r) {
      const pricedQty = Math.max(0, Math.min(m.qty, r.invoicedQty));
      queue.push({ erp: m.erp, company: m.company, itemCode: m.itemCode, warehouse: m.warehouse,
        prName: r.name, prItemName: r.itemName, supplier: r.supplier, prCreation: r.creation,
        intercompany: r.intercompany, qty: m.qty, unitCost: r.invoicedQty > EPS ? r.invoiceAmount / r.invoicedQty : null,
        pricedQty, costStatus: r.invoicedQty <= EPS ? "Pending PI" : pricedQty + EPS < m.qty ? "Partial PI" : "Complete", originOffset: 0 });
      continue;
    }
    const transfer = (m.voucherType === "Stock Entry" || m.voucherType === "Material Transfer") ? transferPool.get(transferKey(m)) : undefined;
    if (transfer?.length) {
      const moved = take(transfer, m.qty);
      queue.push(...moved.taken.map((l) => ({ ...l, warehouse: m.warehouse })));
      if (moved.remaining <= EPS) continue;
      m.qty = moved.remaining;
    }
    const returnLink = m.voucherType === "Sales Invoice" || m.voucherType === "Delivery Note"
      ? stockReturns.get(JSON.stringify([m.erp, m.company, m.voucherType, m.voucherNo, m.voucherDetailNo ?? ""]))
      : undefined;
    const saleSource = returnLink
      ? { ...m, voucherType: returnLink.originalVoucherType, voucherNo: returnLink.originalVoucher, voucherDetailNo: returnLink.originalItem }
      : m;
    const sale = m.voucherType === "Sales Invoice" || m.voucherType === "Delivery Note" ? consumedSales.get(transferKey(saleSource)) : undefined;
    if (sale?.length) {
      const restored = take(sale, m.qty);
      queue.push(...restored.taken.map((l) => ({ ...l, warehouse: m.warehouse })));
      if (restored.remaining <= EPS) continue;
      m.qty = restored.remaining;
    }
    queue.push({ erp: m.erp, company: m.company, itemCode: m.itemCode, warehouse: m.warehouse,
      prName: null, prItemName: null, supplier: null, prCreation: null, intercompany: false,
      qty: m.qty, unitCost: null, pricedQty: 0, costStatus: "Unallocated",
      sourceReference: returnLink
        ? `${returnLink.returnVoucherType} return ${m.voucherNo} against ${returnLink.originalVoucher}`
        : `${m.voucherType} ${m.voucherNo}` });
    diagnostics.push({ ...m, kind: "unallocated", detail: `${m.voucherType} ${m.voucherNo}: source PR cannot be established` });
  }
  // The source PI return removes stock from its own company. Reattribute only
  // the destination's remaining intercompany stock, preserving the FIFO offset
  // already consumed there by sales, returns, or warehouse transfers.
  const receiptStart = new Map<string, number>();
  const receiptGroups = new Map<string, AgeingReceipt[]>();
  for (const r of input.receipts.filter((r) => r.intercompany)) {
    const source = sourceByReceipt.get(JSON.stringify([r.erp, r.company, r.name]));
    if (!source) continue;
    const key = JSON.stringify([source.ssrName, r.itemCode]);
    receiptGroups.set(key, [...(receiptGroups.get(key) ?? []), r]);
  }
  for (const group of receiptGroups.values()) {
    group.sort((a, b) => `${a.creation} ${a.name} ${a.itemName}`.localeCompare(`${b.creation} ${b.name} ${b.itemName}`));
    let offset = 0;
    for (const r of group) {
      receiptStart.set(receiptKey(r.erp, r.name, r.itemName), offset);
      offset += r.stockQty;
    }
  }
  const resolve = (layer: AgeingLayer, seen = new Set<string>()): AgeingLayer[] => {
    if (!layer.intercompany) return [layer];
    const source = sourceByReceipt.get(JSON.stringify([layer.erp, layer.company, layer.prName]));
    if (!source) return [{ ...layer, traceFailure: "no active submitted SSR link" }];
    const identity = JSON.stringify([layer.erp, layer.company, layer.prName, layer.prItemName]);
    if (seen.has(identity)) return [{ ...layer, traceFailure: "intercompany trace loop" }];
    const originKey = JSON.stringify([source.ssrName, layer.itemCode]);
    const traced = returnedLayers.get(originKey) ?? [];
    const legacy = legacyBySsr.get(originKey) ?? [];
    const origin: AgeingLayer[] = [];
    let legacyIndex = 0, legacyOffset = 0;
    for (const tracedLayer of traced) {
      let remainingTraced = tracedLayer.qty;
      while (remainingTraced > EPS) {
        const fallback = legacy[legacyIndex];
        const amount = fallback ? Math.min(remainingTraced, fallback.qty - legacyOffset) : remainingTraced;
        if (amount <= EPS) { legacyIndex++; legacyOffset = 0; continue; }
        const hasOriginalSource = Boolean(tracedLayer.prCreation && tracedLayer.supplier && !tracedLayer.openingStock);
        origin.push(hasOriginalSource ? {
          ...tracedLayer, qty: amount,
          unitCost: tracedLayer.costStatus === "Complete" && tracedLayer.unitCost != null ? tracedLayer.unitCost : fallback?.unitCost ?? null,
          costStatus: tracedLayer.unitCost != null && tracedLayer.costStatus === "Complete" ? "Complete" : fallback?.unitCost != null ? "Complete" : tracedLayer.costStatus,
        } : fallback ? { ...fallback, qty: amount } : { ...tracedLayer, qty: amount });
        remainingTraced -= amount;
        if (fallback) { legacyOffset += amount; if (legacyOffset >= fallback.qty - EPS) { legacyIndex++; legacyOffset = 0; } }
      }
    }
    for (let i = legacyIndex; i < legacy.length; i++) {
      const fallback = legacy[i]!;
      const remainingFallback = fallback.qty - (i === legacyIndex ? legacyOffset : 0);
      if (remainingFallback > EPS) origin.push({ ...fallback, qty: remainingFallback });
    }
    if (!origin.length) return [{ ...layer, traceFailure: `SSR ${source.ssrName} has no source return movement` }];
    let skip = (receiptStart.get(receiptKey(layer.erp, layer.prName ?? "", layer.prItemName ?? "")) ?? 0) + (layer.originOffset ?? 0);
    let remaining = layer.qty;
    const resolved: AgeingLayer[] = [];
    for (const original of origin) {
      if (skip >= original.qty - EPS) { skip -= original.qty; continue; }
      const qty = Math.min(remaining, original.qty - skip);
      if (qty > EPS) resolved.push(...resolve({ ...original, qty, originOffset: (original.originOffset ?? 0) + skip }, new Set([...seen, identity])).map((part) => ({ ...part, erp: layer.erp, company: layer.company, warehouse: layer.warehouse })));
      remaining -= qty;
      skip = 0;
      if (remaining <= EPS) break;
    }
    if (remaining > EPS) {
      resolved.push({ ...layer, qty: remaining, traceFailure: `SSR ${source.ssrName} has insufficient source stock after FIFO allocation` });
    }
    return resolved;
  };
  for (const [key, queue] of queues) queues.set(key, queue.flatMap((layer) => resolve(layer)));
  const items = new Map<string, AgeingItem>();
  let actualStockQty = 0, eligibleStockQty = 0, excludedIntercompanyQty = 0, unallocatedStockQty = 0, unpricedEligibleQty = 0;
  for (const [key, queue] of queues) {
    const [erp, company, itemCode, warehouse] = JSON.parse(key) as string[];
    const actual = balance.get(key) ?? 0;
    actualStockQty += actual;
    const layerTotal = queue.reduce((n, l) => n + l.qty, 0);
    const difference = actual - layerTotal;
    if (Math.abs(difference) > EPS) diagnostics.push({ erp: erp!, company: company!, itemCode: itemCode!, warehouse: warehouse!, kind: "reconciliation", detail: "Layers differ from Stock Ledger balance", difference });
    for (const layer of queue) {
      if (layer.intercompany) {
        excludedIntercompanyQty += layer.qty;
        diagnostics.push({ erp: erp!, company: company!, itemCode: itemCode!, warehouse: warehouse!, kind: "intercompany_source_missing", detail: `PR ${layer.prName}: ${layer.qty} units — ${layer.traceFailure ?? "original PR/PI could not be traced"}`, difference: layer.qty });
        continue;
      }
      if (layer.openingStock) {
        const meta = input.metadata.get(JSON.stringify([erp, company, itemCode])) ?? { stockUom: "", barcode: null, description: null, brand: null, sellingRate: null, currency: null };
        const itemKey = JSON.stringify([itemCode, meta.stockUom, meta.currency]);
        let item = items.get(itemKey);
        if (!item) { item = { erp: erp!, company: company!, itemCode: itemCode!, ...meta, openingStock: 0, totalStockLeft: 0, totalCost: 0, unpricedQty: 0, costStatus: "Complete", buckets: Object.fromEntries(AGE_BUCKETS.map((b) => [b, { qty: 0, cost: 0 }])) as AgeingItem["buckets"], layers: [] }; items.set(itemKey, item); }
        item.openingStock += layer.qty;
        continue;
      }
      if (layer.materialReceipt) continue;
      if (!layer.prCreation) {
        unallocatedStockQty += layer.qty;
        diagnostics.push({
          erp: erp!,
          company: company!,
          itemCode: itemCode!,
          warehouse: warehouse!,
          kind: "unallocated_stock",
          detail: `${layer.qty} units have no traceable original PR date (${layer.sourceReference ?? layer.prName ?? "unknown source"})`,
          difference: layer.qty,
        });
        continue;
      }
      const bucket = bucketForAge(layer.prCreation, input.reportDate);
      if (!bucket) { unallocatedStockQty += layer.qty; diagnostics.push({ erp: erp!, company: company!, itemCode: itemCode!, warehouse: warehouse!, kind: "future_pr", detail: `PR ${layer.prName} created after report date` }); continue; }
      const meta = input.metadata.get(JSON.stringify([erp, company, itemCode])) ?? { stockUom: "", barcode: null, description: null, brand: null, sellingRate: null, currency: null };
      // The report is consolidated by SKU. Currency and stock UOM remain part of
      // the key so amounts or quantities with incompatible units are not added.
      const itemKey = JSON.stringify([itemCode, meta.stockUom, meta.currency]);
      let item = items.get(itemKey);
      if (!item) { item = { erp: erp!, company: company!, itemCode: itemCode!, ...meta, openingStock: 0, totalStockLeft: 0, totalCost: 0, unpricedQty: 0, costStatus: "Complete", buckets: Object.fromEntries(AGE_BUCKETS.map((b) => [b, { qty: 0, cost: 0 }])) as AgeingItem["buckets"], layers: [] }; items.set(itemKey, item); }
      else {
        // A consolidated selling rate is only meaningful when all sources agree.
        if (item.sellingRate !== meta.sellingRate) item.sellingRate = null;
        if (!item.barcode && meta.barcode) item.barcode = meta.barcode;
        if (!item.description && meta.description) item.description = meta.description;
        if (!item.brand && meta.brand) item.brand = meta.brand;
      }
      const knownQty = layer.costStatus === "Complete" && layer.unitCost != null ? layer.qty : 0;
      const cost = knownQty * (layer.unitCost ?? 0);
      item.totalStockLeft += layer.qty; item.totalCost += cost; item.unpricedQty += layer.qty - knownQty;
      item.buckets[bucket].qty += layer.qty; item.buckets[bucket].cost += cost;
      item.layers.push({ ...layer, bucket });
      if (knownQty + EPS < layer.qty) item.costStatus = "Incomplete";
      eligibleStockQty += layer.qty; unpricedEligibleQty += layer.qty - knownQty;
    }
  }
  const rows = [...items.values()].sort((a, b) => `${a.itemCode}${a.stockUom}${a.currency}`.localeCompare(`${b.itemCode}${b.stockUom}${b.currency}`));
  type Total = { brand: string; currency: string | null; stockUom: string; totalStock: number; totalCost: number; unpricedQty: number; costStatus: "Complete" | "Incomplete"; buckets: AgeingItem["buckets"] };
  const totals = new Map<string, Total>();
  for (const row of rows.filter((item) => item.totalStockLeft > EPS)) {
    const groupKey = JSON.stringify([row.currency, row.stockUom, row.brand ?? "Unbranded"]);
    let total = totals.get(groupKey);
    if (!total) { total = { currency: row.currency, stockUom: row.stockUom, brand: row.brand ?? "Unbranded", totalStock: 0, totalCost: 0, unpricedQty: 0, costStatus: "Complete", buckets: Object.fromEntries(AGE_BUCKETS.map((b) => [b, { qty: 0, cost: 0 }])) as AgeingItem["buckets"] }; totals.set(groupKey, total); }
    total.totalStock += row.totalStockLeft; total.totalCost += row.totalCost; total.unpricedQty += row.unpricedQty;
    if (row.costStatus === "Incomplete") total.costStatus = "Incomplete";
    for (const b of AGE_BUCKETS) { total.buckets[b].qty += row.buckets[b].qty; total.buckets[b].cost += row.buckets[b].cost; }
  }
  const grandTotals = new Map<string, Omit<Total, "brand">>();
  for (const t of totals.values()) {
    const key = JSON.stringify([t.currency, t.stockUom]);
    let sum = grandTotals.get(key);
    if (!sum) { sum = { currency: t.currency, stockUom: t.stockUom, totalStock: 0, totalCost: 0, unpricedQty: 0, costStatus: "Complete", buckets: Object.fromEntries(AGE_BUCKETS.map((b) => [b, { qty: 0, cost: 0 }])) as AgeingItem["buckets"] }; grandTotals.set(key, sum); }
    sum.totalStock += t.totalStock; sum.totalCost += t.totalCost; sum.unpricedQty += t.unpricedQty;
    if (t.costStatus === "Incomplete") sum.costStatus = "Incomplete";
    for (const b of AGE_BUCKETS) { sum.buckets[b].qty += t.buckets[b].qty; sum.buckets[b].cost += t.buckets[b].cost; }
  }
  return { reportDate: input.reportDate, items: rows, brandSummary: [...totals.values()],
    grandTotal: [...grandTotals.values()],
    reconciliation: { actualStockQty, eligibleStockQty, excludedIntercompanyQty, unallocatedStockQty, unpricedEligibleQty, discrepancies: diagnostics },
    calculationStatus: diagnostics.length || unpricedEligibleQty > EPS ? "incomplete" : "complete" };
}
