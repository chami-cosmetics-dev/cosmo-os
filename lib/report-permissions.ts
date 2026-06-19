export const REPORT_DUMP_PERMISSIONS = {
  contactListPart1: "reports.dumps.contact_list.part_1",
  contactListPart1_1: "reports.dumps.contact_list.part_1_1",
  contactListPart2: "reports.dumps.contact_list.part_2",
  contactListAll: "reports.dumps.contact_list.all",
  invoice90: "reports.dumps.invoice.last_90",
  invoiceItem90: "reports.dumps.invoice_item.last_90",
  utilityInvoice90: "reports.utility_dumps.invoice.last_90",
  utilityInvoiceItem90: "reports.utility_dumps.invoice_item.last_90",
  contactLastPurchased: "reports.dumps.contacts.last_purchased",
  contactLog: "reports.dumps.contacts.log",
  loyaltyCustomers: "reports.dumps.contacts.loyalty",
  warehouseInvoice: "reports.dumps.invoice.warehouse_360",
  warehouseInvoiceItem: "reports.dumps.invoice_item.warehouse_360",
  historicalInvoice: "reports.dumps.invoice.historical",
  historicalInvoiceItem: "reports.dumps.invoice_item.historical",
} as const;

export const UTILITY_REPORT_DUMP_PERMISSIONS = [
  REPORT_DUMP_PERMISSIONS.utilityInvoice90,
  REPORT_DUMP_PERMISSIONS.utilityInvoiceItem90,
] as const;

export const ALL_REPORT_DUMP_PERMISSIONS = Object.values(REPORT_DUMP_PERMISSIONS).filter(
  (permission) => !(UTILITY_REPORT_DUMP_PERMISSIONS as readonly string[]).includes(permission)
);

export function getContactDumpPermission(part: string) {
  if (part === "1_1") return REPORT_DUMP_PERMISSIONS.contactListPart1_1;
  if (part === "2") return REPORT_DUMP_PERMISSIONS.contactListPart2;
  if (part === "all") return REPORT_DUMP_PERMISSIONS.contactListAll;
  return REPORT_DUMP_PERMISSIONS.contactListPart1;
}

export function getOrderDumpPermission(report: string, range: string) {
  if (range === "historical-year") {
    return report === "invoice-item"
      ? REPORT_DUMP_PERMISSIONS.historicalInvoiceItem
      : REPORT_DUMP_PERMISSIONS.historicalInvoice;
  }

  if (range === "warehouse-360") {
    return report === "invoice-item"
      ? REPORT_DUMP_PERMISSIONS.warehouseInvoiceItem
      : REPORT_DUMP_PERMISSIONS.warehouseInvoice;
  }

  return report === "invoice-item"
    ? REPORT_DUMP_PERMISSIONS.invoiceItem90
    : REPORT_DUMP_PERMISSIONS.invoice90;
}

export function getUtilityOrderDumpPermission(report: string) {
  return report === "invoice-item"
    ? REPORT_DUMP_PERMISSIONS.utilityInvoiceItem90
    : REPORT_DUMP_PERMISSIONS.utilityInvoice90;
}

export function getContactReportPermission(report: string) {
  if (report === "log") return REPORT_DUMP_PERMISSIONS.contactLog;
  if (report === "loyalty") return REPORT_DUMP_PERMISSIONS.loyaltyCustomers;
  return REPORT_DUMP_PERMISSIONS.contactLastPurchased;
}
