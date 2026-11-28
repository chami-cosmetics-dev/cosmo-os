import { Prisma } from "@prisma/client";

import { adaptLineItemsForPurchaseUi } from "@/lib/adapt-import/line-items";
import { normalizePurchaseOrigin } from "@/lib/customer-insight/invoices";
import { formatIsoDate } from "@/lib/reports/csv";
import {
  summarizePaymentGateway,
  type OrderInvoiceCsvRow,
  type OrderInvoiceItemCsvRow,
} from "@/lib/reports/order-dump";
import { readStoredSupplementLines } from "@/lib/vault-supplement-import/invoice-merge";

type ImportedInvoice = {
  id: string;
  salesInvoiceNo: string;
  salesInvoiceMasterId: string | null;
  invoiceDate: Date;
  ttlAmount: { toString(): string };
  locationName: string | null;
  paymentMethod: string | null;
  financialStatus: string | null;
  merchantKnownName: string | null;
  origin: string;
  importBatchId: string | null;
  rawPaymentContext: unknown;
  lineItems: unknown;
  contact: { name: string; phoneNumber: string | null; email: string | null } | null;
};

function importedPaymentGateway(invoice: ImportedInvoice) {
  const method = invoice.paymentMethod?.trim();
  if (method) return summarizePaymentGateway(method);

  const context = invoice.rawPaymentContext;
  if (!context || typeof context !== "object" || Array.isArray(context)) return "";
  const amounts = context as Record<string, unknown>;
  const methods = [];
  if (hasPaymentAmount(amounts.cash)) methods.push("Cash");
  if (hasPaymentAmount(amounts.card)) methods.push("Card Payment");
  return methods.join(", ");
}

function hasPaymentAmount(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return false;
  const amount = Number(String(value).replaceAll(",", ""));
  return Number.isFinite(amount) && amount !== 0;
}

function importedInvoiceFields(invoice: ImportedInvoice) {
  const origin = normalizePurchaseOrigin(invoice.origin, invoice.importBatchId);
  const sourceName = {
    adapt: "Adapt",
    vault_file_import: "File import",
    vault_supplement_import: "Supplement import",
  }[origin];

  return {
    invoice_no: invoice.salesInvoiceNo.trim() || invoice.id,
    erp_invoice_id: invoice.salesInvoiceMasterId?.trim() ?? "",
    source_name: sourceName,
    customer_name: invoice.contact?.name ?? "",
    customer_email: invoice.contact?.email ?? "",
    customer_phone: invoice.contact?.phoneNumber ?? "",
    invoice_date: formatIsoDate(invoice.invoiceDate),
    payment_gateway: importedPaymentGateway(invoice),
    payment_status: invoice.financialStatus ?? "",
  };
}

export function createImportedInvoiceRow(
  invoice: ImportedInvoice,
  companyName: string,
): Partial<OrderInvoiceCsvRow> {
  const fields = importedInvoiceFields(invoice);
  const month = invoice.invoiceDate.toLocaleString("en-US", {
    month: "long",
    timeZone: "Asia/Colombo",
  });

  return {
    ...fields,
    company_name: companyName,
    grand_total: invoice.ttlAmount.toString(),
    item_count: String(adaptLineItemsForPurchaseUi(invoice.lineItems).length),
    merchant: invoice.merchantKnownName ?? "",
    month: `${fields.invoice_date.slice(0, 4)} : ${month}`,
  };
}

export function createImportedInvoiceItemRows(
  invoice: ImportedInvoice,
): Partial<OrderInvoiceItemCsvRow>[] {
  const fields = importedInvoiceFields(invoice);
  const origin = normalizePurchaseOrigin(invoice.origin, invoice.importBatchId);
  const storedAmounts = origin === "adapt"
    ? new Map<string, string>()
    : new Map(readStoredSupplementLines(invoice.lineItems).map((line) => [line.id, line.lineAmount]));

  return adaptLineItemsForPurchaseUi(invoice.lineItems).map((line) => {
    const unitPrice = line.price.trim();
    const unitPriceTotal = unitPrice && Number.isFinite(Number(unitPrice))
      ? new Prisma.Decimal(unitPrice).mul(line.quantity).toDecimalPlaces(2).toString()
      : "";
    const storedAmount = storedAmounts.get(line.id);
    return {
      ...fields,
      location_name: invoice.locationName ?? "",
      merchant_name: invoice.merchantKnownName ?? "",
      sku: line.sku ?? "",
      product_title: line.productTitle,
      quantity: String(line.quantity),
      unit_price: line.price,
      unit_price_total: unitPriceTotal,
      after_discount_total: storedAmount ?? "",
      grand_total: storedAmount ?? unitPriceTotal,
    };
  });
}
