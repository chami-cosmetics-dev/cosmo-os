import { buildCsv, escapeCsvCell, formatIsoDate } from "@/lib/reports/csv";

function formatSourceName(sourceName: string): string {
  switch (sourceName) {
    case "web": return "Shopify";
    case "manual": return "Manual";
    case "erpnext": return "ERPNext";
    case "erpnext-pos": return "ERPNext POS";
    default: return sourceName;
  }
}

function formatIsoTime(value: Date | null | undefined) {
  if (!value) return "";
  return value.toISOString().slice(11);
}

function summarizePaymentGateway(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const normalized = trimmed.toLowerCase().replace(/[_\-\s]+/g, " ").trim();

  if (normalized.includes("koko")) return "KOKO Payment";
  if (normalized.includes("webxpay") || normalized.includes("web x pay")) return "WEBXPAY";
  if (normalized.includes("bank")) return "Bank Transfer";
  if (
    normalized.includes("card payment on delivery") ||
    normalized.includes("card on delivery") ||
    normalized === "cc" ||
    normalized.includes("credit card") ||
    normalized.includes("shopify payments") ||
    normalized.includes("visa") ||
    normalized.includes("mastercard") ||
    normalized.includes("amex") ||
    normalized.includes("card")
  ) {
    return "Card Payment";
  }
  if (normalized === "cash" || normalized === "cod" || normalized.includes("cash on delivery")) {
    return "Cash";
  }

  return trimmed;
}

export type OrderInvoiceCsvRow = {
  invoice_no: string;
  erp_invoice_id: string;
  order_number: string;
  source_name: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  billing_address: string;
  shipping_address: string;
  fulfillment_status: string;
  subtotal: string;
  discounts: string;
  shipping_total: string;
  grand_total: string;
  item_count: string;
  invoice_date: string;
  month: string;
  merchant: string;
  coupon_code: string;
  status: string;
  payment_gateway: string;
  payment_status: string;
  location_name: string;
  shipping_service: string;
  dispatched_date: string;
  dispatched_time: string;
  dispatched_by: string;
  printed_on: string;
  printed_time: string;
  printed_by: string;
  completed_date: string;
  completed_time: string;
  completed_by: string;
  pos_sale: string;
};

export type OrderInvoiceItemCsvRow = {
  invoice_id: string;
  invoice_no: string;
  erp_invoice_id: string;
  order_number: string;
  source_name: string;
  merchant_coupon_code: string;
  invoice_date: string;
  location_name: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  sku: string;
  barcode: string;
  brand: string;
  product_title: string;
  quantity: string;
  unit_price: string;
  line_discount_percent: string;
  line_total: string;
  status: string;
  payment_status: string;
  fulfillment_status: string;
  payment_gateway: string;
  merchant_name: string;
};

const ORDER_INVOICE_HEADERS = [
  "invoice_no",
  "erp_invoice_id",
  "order_number",
  "source_name",
  "customer_name",
  "customer_phone",
  "subtotal",
  "discounts",
  "shipping_total",
  "grand_total",
  "item_count",
  "customer_email",
  "invoice_date",
  "month",
  "merchant",
  "coupon_code",
  "status",
  "fulfillment_status",
  "payment_gateway",
  "payment_status",
  "location_name",
  "printed_on",
  "printed_time",
  "printed_by",
  "dispatched_date",
  "dispatched_time",
  "dispatched_by",
  "shipping_service",
  "completed_date",
  "completed_time",
  "completed_by",
  "pos_sale",
  "billing_address",
  "shipping_address",
] as const;

const ORDER_INVOICE_ITEM_HEADERS = [
  "invoice_id",
  "invoice_no",
  "erp_invoice_id",
  "order_number",
  "source_name",
  "merchant_coupon_code",
  "invoice_date",
  "location_name",
  "customer_name",
  "customer_email",
  "customer_phone",
  "sku",
  "barcode",
  "brand",
  "product_title",
  "quantity",
  "unit_price",
  "line_discount_percent",
  "line_total",
  "status",
  "fulfillment_status",
  "payment_status",
  "payment_gateway",
  "merchant_name",
] as const;

export function buildOrderInvoiceCsv(rows: OrderInvoiceCsvRow[]) {
  return buildCsvWithUppercaseHeaders(ORDER_INVOICE_HEADERS, rows);
}

export function buildOrderInvoiceItemCsv(rows: OrderInvoiceItemCsvRow[]) {
  return buildCsv(ORDER_INVOICE_ITEM_HEADERS, rows);
}

export function buildOrderInvoiceCsvWithoutCustomerPhone(rows: OrderInvoiceCsvRow[]) {
  return buildCsvWithUppercaseHeaders(
    ORDER_INVOICE_HEADERS.filter((header) => header !== "customer_phone" && header !== "customer_email"),
    rows
  );
}

export function buildOrderInvoiceItemCsvWithoutCustomerPhone(rows: OrderInvoiceItemCsvRow[]) {
  return buildCsv(
    ORDER_INVOICE_ITEM_HEADERS.filter((header) => header !== "customer_phone" && header !== "customer_email"),
    rows
  );
}

function buildCsvWithUppercaseHeaders<T extends Record<string, string | number | null | undefined>>(
  headers: readonly string[],
  rows: T[]
) {
  const lines = [
    headers.map((header) => header.toUpperCase()).join(","),
    ...rows.map((row) => headers.map((header) => escapeCsvCell(row[header])).join(",")),
  ];

  return `\uFEFF${lines.join("\r\n")}`;
}

export function createOrderInvoiceRow(input: {
  invoiceNo: string;
  erpInvoiceId: string | null;
  orderNumber: string | null;
  sourceName: string;
  merchantCouponCode: string | null;
  merchantName: string;
  fulfillmentStage: string | null;
  financialStatus: string | null;
  shippingService: string;
  createdAt: Date;
  locationName: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  billingAddress: string;
  shippingAddress: string;
  fulfillmentStatus: string | null;
  paymentGateway: string;
  subtotalPrice: string | null;
  discounts: string | null;
  shippingTotal: string | null;
  grandTotal: string;
  itemCount: number;
  dispatchedAt: Date | null;
  dispatchedBy: string;
  lastPrintedAt: Date | null;
  lastPrintedBy: string;
  invoiceCompleteAt: Date | null;
  invoiceCompleteBy: string;
}): OrderInvoiceCsvRow {
  const sourceName = formatSourceName(input.sourceName);
  const month = input.createdAt.toLocaleString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
  return {
    invoice_no: input.invoiceNo,
    erp_invoice_id: input.erpInvoiceId ?? "",
    order_number: input.orderNumber ?? "",
    source_name: sourceName,
    customer_name: input.customerName,
    customer_phone: input.customerPhone ?? "",
    customer_email: input.customerEmail ?? "",
    billing_address: input.billingAddress,
    shipping_address: input.shippingAddress,
    fulfillment_status: input.fulfillmentStatus ?? "",
    subtotal: input.subtotalPrice ?? "",
    discounts: input.discounts ?? "",
    shipping_total: input.shippingTotal ?? "",
    grand_total: input.grandTotal,
    item_count: String(input.itemCount),
    invoice_date: formatIsoDate(input.createdAt),
    month: `${input.createdAt.getUTCFullYear()} : ${month}`,
    merchant: input.merchantName,
    coupon_code: input.merchantCouponCode ?? "",
    status: input.financialStatus?.toLowerCase() === "voided" ? "voided" : (input.fulfillmentStage ?? ""),
    payment_gateway: summarizePaymentGateway(input.paymentGateway),
    payment_status: input.financialStatus ?? "",
    location_name: input.locationName,
    shipping_service: input.shippingService,
    dispatched_date: formatIsoDate(input.dispatchedAt),
    dispatched_time: formatIsoTime(input.dispatchedAt),
    dispatched_by: input.dispatchedBy,
    printed_on: formatIsoDate(input.lastPrintedAt),
    printed_time: formatIsoTime(input.lastPrintedAt),
    printed_by: input.lastPrintedBy,
    completed_date: formatIsoDate(input.invoiceCompleteAt),
    completed_time: formatIsoTime(input.invoiceCompleteAt),
    completed_by: input.invoiceCompleteBy,
    pos_sale: sourceName === "ERPNext POS" ? "1" : "0",
  };
}

export function createOrderInvoiceItemRow(input: {
  invoiceId: string;
  invoiceNo: string;
  erpInvoiceId: string | null;
  orderNumber: string | null;
  sourceName: string;
  merchantCouponCode: string | null;
  createdAt: Date;
  locationName: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  sku: string | null;
  barcode: string | null;
  brand: string | null;
  productTitle: string;
  quantity: number;
  unitPrice: string;
  lineDiscountPercent: string | null;
  lineTotal: string;
  fulfillmentStage: string | null;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  paymentGateway: string;
  merchantName: string;
}): OrderInvoiceItemCsvRow {
  return {
    invoice_id: input.invoiceId,
    invoice_no: input.invoiceNo,
    erp_invoice_id: input.erpInvoiceId ?? "",
    order_number: input.orderNumber ?? "",
    source_name: formatSourceName(input.sourceName),
    merchant_coupon_code: input.merchantCouponCode ?? "",
    invoice_date: formatIsoDate(input.createdAt),
    location_name: input.locationName,
    customer_name: input.customerName,
    customer_email: input.customerEmail ?? "",
    customer_phone: input.customerPhone ?? "",
    sku: input.sku ?? "",
    barcode: input.barcode ?? "",
    brand: input.brand ?? "",
    product_title: input.productTitle,
    quantity: String(input.quantity),
    unit_price: input.unitPrice,
    line_discount_percent: input.lineDiscountPercent ?? "",
    line_total: input.lineTotal,
    status: input.financialStatus?.toLowerCase() === "voided" ? "voided" : (input.fulfillmentStage ?? ""),
    payment_status: input.financialStatus ?? "",
    fulfillment_status: input.fulfillmentStatus ?? "",
    payment_gateway: summarizePaymentGateway(input.paymentGateway),
    merchant_name: input.merchantName,
  };
}
