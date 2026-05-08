import { buildCsv, formatIsoDate, formatIsoDateTime } from "@/lib/reports/csv";

export type OrderInvoiceCsvRow = {
  invoice_id: string;
  invoice_no: string;
  order_number: string;
  source_name: string;
  invoice_date: string;
  location_name: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  billing_address: string;
  shipping_address: string;
  payment_status: string;
  fulfillment_status: string;
  payment_gateway: string;
  merchant_name: string;
  subtotal: string;
  discounts: string;
  shipping_total: string;
  tax_total: string;
  grand_total: string;
  currency: string;
  item_count: string;
  invoice_completed_at: string;
  updated_at: string;
};

export type OrderInvoiceItemCsvRow = {
  invoice_id: string;
  invoice_no: string;
  order_number: string;
  source_name: string;
  invoice_date: string;
  location_name: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  sku: string;
  barcode: string;
  product_title: string;
  variant_title: string;
  quantity: string;
  unit_price: string;
  line_discount_percent: string;
  line_total: string;
  currency: string;
  payment_status: string;
  fulfillment_status: string;
  payment_gateway: string;
  merchant_name: string;
};

const ORDER_INVOICE_HEADERS = [
  "invoice_id",
  "invoice_no",
  "order_number",
  "source_name",
  "invoice_date",
  "location_name",
  "customer_name",
  "customer_email",
  "customer_phone",
  "billing_address",
  "shipping_address",
  "payment_status",
  "fulfillment_status",
  "payment_gateway",
  "merchant_name",
  "subtotal",
  "discounts",
  "shipping_total",
  "tax_total",
  "grand_total",
  "currency",
  "item_count",
  "invoice_completed_at",
  "updated_at",
] as const;

const ORDER_INVOICE_ITEM_HEADERS = [
  "invoice_id",
  "invoice_no",
  "order_number",
  "source_name",
  "invoice_date",
  "location_name",
  "customer_name",
  "customer_email",
  "customer_phone",
  "sku",
  "barcode",
  "product_title",
  "variant_title",
  "quantity",
  "unit_price",
  "line_discount_percent",
  "line_total",
  "currency",
  "payment_status",
  "fulfillment_status",
  "payment_gateway",
  "merchant_name",
] as const;

export function buildOrderInvoiceCsv(rows: OrderInvoiceCsvRow[]) {
  return buildCsv(ORDER_INVOICE_HEADERS, rows);
}

export function buildOrderInvoiceItemCsv(rows: OrderInvoiceItemCsvRow[]) {
  return buildCsv(ORDER_INVOICE_ITEM_HEADERS, rows);
}

export function createOrderInvoiceRow(input: {
  invoiceId: string;
  invoiceNo: string;
  orderNumber: string | null;
  sourceName: string;
  createdAt: Date;
  locationName: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  billingAddress: string;
  shippingAddress: string;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  paymentGateway: string;
  merchantName: string;
  subtotalPrice: string | null;
  discounts: string | null;
  shippingTotal: string | null;
  taxTotal: string | null;
  grandTotal: string;
  currency: string | null;
  itemCount: number;
  invoiceCompleteAt: Date | null;
  updatedAt: Date;
}): OrderInvoiceCsvRow {
  return {
    invoice_id: input.invoiceId,
    invoice_no: input.invoiceNo,
    order_number: input.orderNumber ?? "",
    source_name: input.sourceName,
    invoice_date: formatIsoDate(input.createdAt),
    location_name: input.locationName,
    customer_name: input.customerName,
    customer_email: input.customerEmail ?? "",
    customer_phone: input.customerPhone ?? "",
    billing_address: input.billingAddress,
    shipping_address: input.shippingAddress,
    payment_status: input.financialStatus ?? "",
    fulfillment_status: input.fulfillmentStatus ?? "",
    payment_gateway: input.paymentGateway,
    merchant_name: input.merchantName,
    subtotal: input.subtotalPrice ?? "",
    discounts: input.discounts ?? "",
    shipping_total: input.shippingTotal ?? "",
    tax_total: input.taxTotal ?? "",
    grand_total: input.grandTotal,
    currency: input.currency ?? "",
    item_count: String(input.itemCount),
    invoice_completed_at: formatIsoDateTime(input.invoiceCompleteAt),
    updated_at: formatIsoDateTime(input.updatedAt),
  };
}

export function createOrderInvoiceItemRow(input: {
  invoiceId: string;
  invoiceNo: string;
  orderNumber: string | null;
  sourceName: string;
  createdAt: Date;
  locationName: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  sku: string | null;
  barcode: string | null;
  productTitle: string;
  variantTitle: string | null;
  quantity: number;
  unitPrice: string;
  lineDiscountPercent: string | null;
  lineTotal: string;
  currency: string | null;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  paymentGateway: string;
  merchantName: string;
}): OrderInvoiceItemCsvRow {
  return {
    invoice_id: input.invoiceId,
    invoice_no: input.invoiceNo,
    order_number: input.orderNumber ?? "",
    source_name: input.sourceName,
    invoice_date: formatIsoDate(input.createdAt),
    location_name: input.locationName,
    customer_name: input.customerName,
    customer_email: input.customerEmail ?? "",
    customer_phone: input.customerPhone ?? "",
    sku: input.sku ?? "",
    barcode: input.barcode ?? "",
    product_title: input.productTitle,
    variant_title: input.variantTitle ?? "",
    quantity: String(input.quantity),
    unit_price: input.unitPrice,
    line_discount_percent: input.lineDiscountPercent ?? "",
    line_total: input.lineTotal,
    currency: input.currency ?? "",
    payment_status: input.financialStatus ?? "",
    fulfillment_status: input.fulfillmentStatus ?? "",
    payment_gateway: input.paymentGateway,
    merchant_name: input.merchantName,
  };
}
