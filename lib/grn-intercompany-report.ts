export type IntercompanyPurchaseReceipt = {
  name: string;
  companyName: string;
  counterpartyCompanyName: string | null;
  date: Date | null;
  cancelled: boolean;
  linkedStockReturnNames: string[];
};

export type IntercompanyStockReturn = {
  name: string;
  companyName: string;
  counterpartyCompanyName: string | null;
  date: Date | null;
  cancelled: boolean;
  linkedPurchaseReceiptNames: string[];
};

export type IntercompanyInvoiceItem = {
  id: string;
  itemCode: string;
  itemName: string | null;
  qty: number;
  rate: number;
  amount: number;
  purchaseReceipt: string | null;
  supplierStockReturn: string | null;
};

export type IntercompanyInvoice = {
  name: string;
  postingDate: Date | null;
  isReturn: number | null;
  purchaseReceiptName: string | null;
  supplierStockReturnName: string | null;
  billNo: string | null;
  items: IntercompanyInvoiceItem[];
};

export type IntercompanyReportLine = {
  company: string;
  companyLabel: string;
  counterparty: string;
  counterpartyLabel: string;
  side: "PR PI" | "SSR PI Return";
  status: "Linked PI" | "No linked PI";
  purchaseInvoice: string;
  reference: string;
  postingDate: Date | null;
  itemCode: string;
  itemName: string | null;
  qty: number;
  rate: number;
  amount: number;
};

export type IntercompanyReportMatrix = {
  companies: { name: string; label: string }[];
  values: Map<string, number>;
  rowTotals: Map<string, number>;
  columnTotals: Map<string, number>;
  grandTotal: number;
};

export type IntercompanyTallyDifference = {
  receivingCompany: string;
  receivingCompanyLabel: string;
  supplierCompany: string;
  supplierCompanyLabel: string;
  prLinkedPiValue: number;
  ssrLinkedPiReturnValue: number;
  difference: number;
  status: "Matched" | "Difference";
};

type BuildIntercompanyReportInput = {
  purchaseReceipts: IntercompanyPurchaseReceipt[];
  stockReturns: IntercompanyStockReturn[];
  invoices: IntercompanyInvoice[];
  companyLabels?: ReadonlyMap<string, string>;
  from?: Date | null;
  to?: Date | null;
};

export function isCancelledIntercompanyDocument(row: {
  docstatus: number | null;
  status?: string | null;
  amendedFrom?: string | null;
}) {
  const status = row.status?.trim().toLowerCase();
  return row.docstatus === 2 || status === "cancelled" || status === "canceled";
}

function documentKey(value: string | null | undefined) {
  return value?.trim().toUpperCase() ?? "";
}

export function companyKey(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isInRange(value: Date | null, from?: Date | null, to?: Date | null) {
  if (!value) return !from && !to;
  if (from && value < from) return false;
  if (to && value > to) return false;
  return true;
}

function stockReturnNameFromBillNo(value: string | null) {
  const trimmed = value?.trim() ?? "";
  return /^SSR-/i.test(trimmed) ? trimmed.slice(4).trim() : null;
}

function itemValue(item: IntercompanyInvoiceItem) {
  const amount = Math.abs(Number(item.amount));
  if (Number.isFinite(amount) && amount !== 0) return amount;
  const fallback = Math.abs(Number(item.qty) * Number(item.rate));
  return Number.isFinite(fallback) ? fallback : 0;
}

function uniqueCompanies(values: Iterable<string>) {
  const byKey = new Map<string, string>();
  for (const value of values) {
    const key = companyKey(value);
    if (key && !byKey.has(key)) byKey.set(key, value.trim());
  }
  return [...byKey.values()];
}

function reportLabel(name: string, labels?: ReadonlyMap<string, string>) {
  return labels?.get(companyKey(name))?.trim() || name.trim();
}

function matrixKey(company: string, counterparty: string) {
  return `${companyKey(company)}\u0000${companyKey(counterparty)}`;
}

export function buildIntercompanyReport(input: BuildIntercompanyReportInput) {
  const purchaseReceipts = new Map(
    input.purchaseReceipts
      .filter((row) => !row.cancelled)
      .map((row) => [documentKey(row.name), row]),
  );
  const stockReturns = new Map(
    input.stockReturns
      .filter((row) => !row.cancelled)
      .map((row) => [documentKey(row.name), row]),
  );

  const selectedPurchaseReceiptNames = new Set(
    [...purchaseReceipts]
      .filter(([, row]) => row.counterpartyCompanyName && isInRange(row.date, input.from, input.to))
      .map(([name]) => name),
  );
  const selectedStockReturnNames = new Set(
    [...stockReturns]
      .filter(([, row]) => row.counterpartyCompanyName && isInRange(row.date, input.from, input.to))
      .map(([name]) => name),
  );

  const lines: IntercompanyReportLine[] = [];
  const seenInvoiceItems = new Set<string>();
  const receiptsWithInvoice = new Set<string>();
  const returnsWithInvoice = new Set<string>();
  for (const invoice of input.invoices) {
    for (const item of invoice.items) {
      const invoiceItemKey = `${documentKey(invoice.name)}\u0000${item.id}`;
      if (seenInvoiceItems.has(invoiceItemKey)) continue;
      seenInvoiceItems.add(invoiceItemKey);

      const returnSide =
        invoice.isReturn === 1 ||
        Boolean(item.supplierStockReturn) ||
        Boolean(invoice.supplierStockReturnName) ||
        Boolean(stockReturnNameFromBillNo(invoice.billNo));
      const value = itemValue(item);

      if (returnSide) {
        const references = [
          item.supplierStockReturn,
          invoice.supplierStockReturnName,
          stockReturnNameFromBillNo(invoice.billNo),
        ].map(documentKey).filter((name) => name && selectedStockReturnNames.has(name));
        const referencedReturns = [...new Set(references)]
          .map((name) => stockReturns.get(name))
          .filter((row): row is NonNullable<typeof row> => Boolean(row));
        const sourceCompanies = uniqueCompanies(referencedReturns.map((row) => row.companyName));
        const destinationCompanies = uniqueCompanies(
          referencedReturns.map((row) => row.counterpartyCompanyName ?? ""),
        );
        if (sourceCompanies.length !== 1 || destinationCompanies.length !== 1) continue;
        const [company] = sourceCompanies;
        const [counterparty] = destinationCompanies;
        if (companyKey(company) === companyKey(counterparty)) continue;
        for (const name of references) returnsWithInvoice.add(name);
        lines.push({
          company,
          companyLabel: reportLabel(company, input.companyLabels),
          counterparty,
          counterpartyLabel: reportLabel(counterparty, input.companyLabels),
          side: "SSR PI Return",
          status: "Linked PI",
          purchaseInvoice: invoice.name,
          reference: referencedReturns.map((row) => row.name).join(", "),
          postingDate: invoice.postingDate,
          itemCode: item.itemCode,
          itemName: item.itemName,
          qty: item.qty,
          rate: item.rate,
          amount: roundMoney(-value),
        });
        continue;
      }

      const references = [item.purchaseReceipt, invoice.purchaseReceiptName]
        .map(documentKey)
        .filter((name) => name && selectedPurchaseReceiptNames.has(name));
      const referencedReceipts = [...new Set(references)]
        .map((name) => purchaseReceipts.get(name))
        .filter((row): row is NonNullable<typeof row> => Boolean(row));
      const destinationCompanies = uniqueCompanies(referencedReceipts.map((row) => row.companyName));
      const sourceCompanies = uniqueCompanies(
        referencedReceipts.map((row) => row.counterpartyCompanyName ?? ""),
      );
      if (sourceCompanies.length !== 1 || destinationCompanies.length !== 1) continue;
      const [counterparty] = sourceCompanies;
      const [company] = destinationCompanies;
      if (companyKey(company) === companyKey(counterparty)) continue;
      for (const name of references) receiptsWithInvoice.add(name);
      lines.push({
        company,
        companyLabel: reportLabel(company, input.companyLabels),
        counterparty,
        counterpartyLabel: reportLabel(counterparty, input.companyLabels),
        side: "PR PI",
        status: "Linked PI",
        purchaseInvoice: invoice.name,
        reference: referencedReceipts.map((row) => row.name).join(", "),
        postingDate: invoice.postingDate,
        itemCode: item.itemCode,
        itemName: item.itemName,
        qty: item.qty,
        rate: item.rate,
        amount: roundMoney(value),
      });
    }
  }

  for (const name of selectedPurchaseReceiptNames) {
    if (receiptsWithInvoice.has(name)) continue;
    const receipt = purchaseReceipts.get(name);
    if (!receipt?.counterpartyCompanyName) continue;
    lines.push({
      company: receipt.companyName,
      companyLabel: reportLabel(receipt.companyName, input.companyLabels),
      counterparty: receipt.counterpartyCompanyName,
      counterpartyLabel: reportLabel(receipt.counterpartyCompanyName, input.companyLabels),
      side: "PR PI",
      status: "No linked PI",
      purchaseInvoice: "",
      reference: receipt.name,
      postingDate: receipt.date,
      itemCode: "",
      itemName: null,
      qty: 0,
      rate: 0,
      amount: 0,
    });
  }
  for (const name of selectedStockReturnNames) {
    if (returnsWithInvoice.has(name)) continue;
    const stockReturn = stockReturns.get(name);
    if (!stockReturn?.counterpartyCompanyName) continue;
    lines.push({
      company: stockReturn.companyName,
      companyLabel: reportLabel(stockReturn.companyName, input.companyLabels),
      counterparty: stockReturn.counterpartyCompanyName,
      counterpartyLabel: reportLabel(stockReturn.counterpartyCompanyName, input.companyLabels),
      side: "SSR PI Return",
      status: "No linked PI",
      purchaseInvoice: "",
      reference: stockReturn.name,
      postingDate: stockReturn.date,
      itemCode: "",
      itemName: null,
      qty: 0,
      rate: 0,
      amount: 0,
    });
  }

  const companiesByKey = new Map<string, { name: string; label: string }>();
  for (const line of lines) {
    companiesByKey.set(companyKey(line.company), { name: line.company, label: line.companyLabel });
    companiesByKey.set(companyKey(line.counterparty), {
      name: line.counterparty,
      label: line.counterpartyLabel,
    });
  }
  const companies = [...companiesByKey.values()].sort((a, b) => a.label.localeCompare(b.label));
  const values = new Map<string, number>();
  const rowTotals = new Map<string, number>();
  const columnTotals = new Map<string, number>();
  let grandTotal = 0;
  for (const line of lines) {
    const key = matrixKey(line.company, line.counterparty);
    values.set(key, roundMoney((values.get(key) ?? 0) + line.amount));
    const rowKey = companyKey(line.company);
    const columnKey = companyKey(line.counterparty);
    rowTotals.set(rowKey, roundMoney((rowTotals.get(rowKey) ?? 0) + line.amount));
    columnTotals.set(columnKey, roundMoney((columnTotals.get(columnKey) ?? 0) + line.amount));
    grandTotal = roundMoney(grandTotal + line.amount);
  }

  const matrix: IntercompanyReportMatrix = {
    companies,
    values,
    rowTotals,
    columnTotals,
    grandTotal,
  };
  return { lines, matrix };
}

export function intercompanyMatrixValue(
  matrix: IntercompanyReportMatrix,
  company: string,
  counterparty: string,
) {
  return matrix.values.get(matrixKey(company, counterparty)) ?? 0;
}

export function buildIntercompanyTallyDifferences(lines: IntercompanyReportLine[]) {
  const differences = new Map<string, IntercompanyTallyDifference>();

  for (const line of lines) {
    if (line.status !== "Linked PI") continue;
    const isPurchaseReceipt = line.side === "PR PI";
    const receivingCompany = isPurchaseReceipt ? line.company : line.counterparty;
    const receivingCompanyLabel = isPurchaseReceipt ? line.companyLabel : line.counterpartyLabel;
    const supplierCompany = isPurchaseReceipt ? line.counterparty : line.company;
    const supplierCompanyLabel = isPurchaseReceipt ? line.counterpartyLabel : line.companyLabel;
    const key = matrixKey(receivingCompany, supplierCompany);
    const existing: IntercompanyTallyDifference = differences.get(key) ?? {
      receivingCompany,
      receivingCompanyLabel,
      supplierCompany,
      supplierCompanyLabel,
      prLinkedPiValue: 0,
      ssrLinkedPiReturnValue: 0,
      difference: 0,
      status: "Matched",
    };
    if (isPurchaseReceipt) {
      existing.prLinkedPiValue = roundMoney(existing.prLinkedPiValue + Math.abs(line.amount));
    } else {
      existing.ssrLinkedPiReturnValue = roundMoney(
        existing.ssrLinkedPiReturnValue + Math.abs(line.amount),
      );
    }
    existing.difference = roundMoney(existing.prLinkedPiValue - existing.ssrLinkedPiReturnValue);
    existing.status = Math.abs(existing.difference) < 0.01 ? "Matched" : "Difference";
    differences.set(key, existing);
  }

  return [...differences.values()].sort(
    (first, second) =>
      first.receivingCompanyLabel.localeCompare(second.receivingCompanyLabel) ||
      first.supplierCompanyLabel.localeCompare(second.supplierCompanyLabel),
  );
}
