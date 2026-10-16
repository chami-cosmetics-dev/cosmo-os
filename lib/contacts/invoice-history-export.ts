import { adaptLineItemsForPurchaseUi } from "@/lib/adapt-import/line-items";
import { saleBusinessLabel } from "@/lib/customer-insight/invoices";
import { formatIsoDate } from "@/lib/reports/csv";

export const INVOICE_HISTORY_HEADERS = [
  "name",
  "email",
  "phone_number",
  "business",
  "invoice_no",
  "invoice_date",
  "status",
  "item_code",
  "item_name",
  "quantity",
  "unit_price",
] as const;

export type InvoiceHistoryCsvRow = Record<(typeof INVOICE_HISTORY_HEADERS)[number], string | number>;

type HistoryContact = {
  name: string;
  email: string | null;
  phoneNumber: string | null;
};

type HistoryLine = {
  itemCode: string;
  itemName: string;
  quantity: number;
  unitPrice: string;
};

export type InvoiceHistoryAdaptInput = {
  salesInvoiceNo: string;
  invoiceDate: Date;
  financialStatus: string | null;
  paymentMethod: string | null;
  origin: string | null;
  importBatchId: string | null;
  lineItems: unknown;
};

export type InvoiceHistoryOrderInput = {
  id: string;
  orderNumber: string | null;
  name: string | null;
  erpnextInvoiceId: string | null;
  createdAt: Date;
  financialStatus: string | null;
  lineItems: Array<{
    quantity: number;
    price: { toString(): string } | string | number;
    sku: string | null;
    productTitle: string | null;
  }>;
};

function contactCells(contact: HistoryContact) {
  return {
    name: contact.name,
    email: contact.email ?? "",
    phone_number: contact.phoneNumber ?? "",
  };
}

function historyStatus(input: {
  financialStatus: string | null;
  paymentMethod: string | null;
  business: string;
}): string {
  const fileStatus = input.financialStatus?.trim() ?? "";
  if (fileStatus) return fileStatus;
  if (input.business === "File import" || input.business === "Cosmetics") {
    return input.paymentMethod?.trim() || "Imported";
  }
  return "Adapt";
}

function lineRow(
  contact: HistoryContact,
  invoice: {
    business: string;
    invoiceNo: string;
    invoiceDate: Date;
    status: string;
    line: HistoryLine | null;
  },
): InvoiceHistoryCsvRow {
  return {
    ...contactCells(contact),
    business: invoice.business,
    invoice_no: invoice.invoiceNo,
    invoice_date: formatIsoDate(invoice.invoiceDate),
    status: invoice.status,
    item_code: invoice.line?.itemCode ?? "",
    item_name: invoice.line?.itemName ?? "",
    quantity: invoice.line?.quantity ?? "",
    unit_price: invoice.line?.unitPrice ?? "",
  };
}

function orderInvoiceNo(order: InvoiceHistoryOrderInput): string {
  const erp = order.erpnextInvoiceId?.trim();
  if (erp && erp !== "pending" && erp !== "pending_approval") return erp;
  return order.orderNumber?.trim() || order.name?.trim() || order.id;
}

export function buildInvoiceHistoryRows(input: {
  contact: HistoryContact;
  adaptInvoices: InvoiceHistoryAdaptInput[];
  orders?: InvoiceHistoryOrderInput[];
}): InvoiceHistoryCsvRow[] {
  const rows: InvoiceHistoryCsvRow[] = [];

  for (const invoice of input.adaptInvoices) {
    const business = saleBusinessLabel(invoice.origin, invoice.importBatchId);
    if (business !== "Cosmetics" && business !== "File import") continue;
    const status = historyStatus({
      financialStatus: invoice.financialStatus,
      paymentMethod: invoice.paymentMethod,
      business,
    });
    const lines = adaptLineItemsForPurchaseUi(invoice.lineItems).map((line) => ({
      itemCode: line.sku?.trim() || "",
      itemName: line.productTitle,
      quantity: line.quantity,
      unitPrice: line.price,
    }));
    const invoiceNo = invoice.salesInvoiceNo?.trim() || "";
    if (lines.length === 0) {
      rows.push(
        lineRow(input.contact, {
          business,
          invoiceNo,
          invoiceDate: invoice.invoiceDate,
          status,
          line: null,
        }),
      );
      continue;
    }
    for (const line of lines) {
      rows.push(
        lineRow(input.contact, {
          business,
          invoiceNo,
          invoiceDate: invoice.invoiceDate,
          status,
          line,
        }),
      );
    }
  }

  for (const order of input.orders ?? []) {
    const status = order.financialStatus?.trim() || "";
    const invoiceNo = orderInvoiceNo(order);
    const lines = order.lineItems.map((line) => ({
      itemCode: line.sku?.trim() || "",
      itemName: line.productTitle?.trim() || "",
      quantity: line.quantity,
      unitPrice: typeof line.price === "string" ? line.price : String(line.price ?? ""),
    }));
    if (lines.length === 0) {
      rows.push(
        lineRow(input.contact, {
          business: "Supplement",
          invoiceNo,
          invoiceDate: order.createdAt,
          status,
          line: null,
        }),
      );
      continue;
    }
    for (const line of lines) {
      rows.push(
        lineRow(input.contact, {
          business: "Supplement",
          invoiceNo,
          invoiceDate: order.createdAt,
          status,
          line,
        }),
      );
    }
  }

  return rows;
}
