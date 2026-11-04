import { adaptLineItemsForPurchaseUi } from "@/lib/adapt-import/line-items";
import { saleBusinessLabel } from "@/lib/customer-insight/invoices";
import { FULFILLMENT_STAGE_LABELS } from "@/lib/fulfillment-stage-display";
import { getProductItemStatusMeta } from "@/lib/product-item-status";
import { formatIsoDateTime } from "@/lib/reports/csv";
import { readStoredSupplementLines } from "@/lib/vault-supplement-import/invoice-merge";

export const MASTER_ORDER_HEADERS = [
  "ORDER ID",
  "ERP INVOICE ID",
  "SHOPIFY ORDER ID",
  "SOURCE",
  "BUSINESS",
  "SALES LOCATION",
  "COMPANY",
  "POS PROFILE",
  "POS WAREHOUSE",
  "CREATED AT",
  "CREATED BY",
  "CUSTOMER NAME",
  "CUSTOMER PHONE",
  "SHIPPING PHONE",
  "CUSTOMER EMAIL",
  "SHIPPING ADDRESS",
  "BILLING ADDRESS",
  "POST CODE",
  "DISTRICT",
  "CONTACT NAME",
  "CONTACT PHONES",
  "CONTACT EMAILS",
  "CUSTOMER TYPE",
  "CALL CATEGORY",
  "CONTACT DISTRICT",
  "ZONE",
  "AREA",
  "TOWN",
  "CITY",
  "ADDRESS",
  "COUNTRY",
  "GENDER",
  "LANGUAGE",
  "OCCUPATION",
  "WORK PLACE",
  "ASSIGNED MERCHANT",
  "RECENT MERCHANT",
  "CONTACT SOURCE",
  "ORIGIN",
  "WHATSAPP ALLOWED",
  "LOYALTY TIER",
  "LOYALTY OUTREACH",
  "CONTACT REMARKS",
  "SUBTOTAL",
  "DISCOUNTS",
  "TAX",
  "SHIPPING",
  "GRAND TOTAL",
  "CURRENCY",
  "ITEM COUNT",
  "COUPON",
  "MERCHANT",
  "PROMO CODE OWNER",
  "PROMO DESCRIPTION",
  "PAYMENT METHOD",
  "PAYMENT STATUS",
  "KOKO REF",
  "KOKO LINK AT",
  "KOKO CONFIRMED BY",
  "KOKO CONFIRMED AT",
  "FULFILLMENT STAGE",
  "STAGE ENTERED AT",
  "WEBSITE STATUS",
  "DELIVERY RESULT",
  "SAMPLE ADDED BY",
  "SAMPLE ADDED AT",
  "SAMPLE COMPLETE BY",
  "SAMPLE COMPLETE AT",
  "SAMPLE SEND LATER DATE",
  "PRINT COUNT",
  "PRINTED BY",
  "PRINTED AT",
  "PICK LIST AT",
  "HOLD REASON",
  "ON HOLD AT",
  "PROCESS BY",
  "PROCESS AT",
  "DISPATCH BY",
  "DISPATCH AT",
  "SHIPPING SERVICE",
  "SHIPPING RULE",
  "WAYBILL NO",
  "RIDER STATUS",
  "LATEST RIDER UPDATE AT",
  "DELIVERY COMPLETE BY",
  "DELIVERY COMPLETE AT",
  "COLLECTED AMOUNT",
  "COLLECTION METHOD",
  "INVOICE COMPLETE BY",
  "INVOICE COMPLETE AT",
  "REVERTED AT",
  "REVERTED BY",
  "CANCELLED AT",
  "CANCELLED BY",
  "CANCEL REASON",
  "CANCEL KIND",
  "REPLACED BY ORDER",
  "RETURN STATUS",
  "RETURN DATE",
  "RETURN REMARK",
  "EXCHANGE STATUS",
  "EXCHANGE REASON",
  "CALL CENTER NOTE",
  "CUSTOMER NOTE",
  "MERCHANT REVIEW STATUS",
  "MERCHANT REVIEW NOTE",
  "ERP SYNC STATUS",
  "ERP SYNC ERROR",
  "OGF SYNCED AT",
  "OGF BATCH",
  "OGF ERROR",
] as const;

export const MASTER_ITEM_HEADERS = [
  "ORDER ID",
  "ERP INVOICE ID",
  "BUSINESS",
  "ITEM CODE",
  "BARCODE",
  "ITEM NAME",
  "BRAND",
  "CATEGORY",
  "FOCUS/NON FOCUS",
  "TAX STATUS",
  "QTY",
  "UNIT PRICE",
  "DISCOUNT PERCENT",
  "LINE TOTAL",
] as const;

export type MasterOrderHeader = (typeof MASTER_ORDER_HEADERS)[number];
export type MasterItemHeader = (typeof MASTER_ITEM_HEADERS)[number];
export type MasterOrderRow = Record<MasterOrderHeader, string>;
export type MasterItemRow = Record<MasterItemHeader, string>;

export type MasterDumpRemark = {
  stage: string;
  type: string;
  content: string;
  createdAt: Date;
};

export type MasterDumpLine = {
  sku: string | null;
  barcode: string | null;
  productTitle: string;
  quantity: number;
  unitPrice: string;
  discountPercent: string;
  lineTotal: string;
  brand: string | null;
  categoryName: string | null;
  itemStatusCategory: string | null;
  itemStatusLabel: string | null;
  erp1ProductPriority: string | null;
  erp2ProductPriority: string | null;
  taxStatus: string | null;
};

export type MasterOrderReportInput = {
  orderId: string;
  erpInvoiceId: string;
  shopifyOrderId: string;
  sourceName: string;
  business: string;
  salesLocation: string;
  company: string;
  posProfile: string;
  posWarehouse: string;
  createdAt: Date;
  createdBy: string;
  customerName: string;
  customerPhone: string;
  shippingPhone: string;
  customerEmail: string;
  shippingAddress: string;
  billingAddress: string;
  postCode: string;
  district: string;
  contactName: string;
  contactPhones: string;
  contactEmails: string;
  customerType: string;
  callCategory: string;
  contactDistrict: string;
  zone: string;
  area: string;
  town: string;
  city: string;
  address: string;
  country: string;
  gender: string;
  language: string;
  occupation: string;
  workPlace: string;
  assignedMerchant: string;
  recentMerchant: string;
  contactSource: string;
  origin: string;
  whatsappAllowed: string;
  loyaltyTier: string;
  loyaltyOutreach: string;
  contactRemarks: string;
  subtotal: string;
  discounts: string;
  tax: string;
  shipping: string;
  grandTotal: string;
  currency: string;
  itemCount: string;
  coupon: string;
  merchant: string;
  promoCodeOwner: string;
  discountApplications: unknown;
  paymentMethod: string;
  paymentStatus: string;
  kokoRef: string;
  kokoLinkAt: Date | null;
  kokoConfirmedBy: string;
  kokoConfirmedAt: Date | null;
  fulfillmentStage: string;
  stageEnteredAt: Date | null;
  websiteStatus: string;
  deliveryResult: string;
  sampleAddedBy: string;
  sampleAddedAt: Date | null;
  sampleCompleteBy: string;
  sampleCompleteAt: Date | null;
  sampleSendLaterAt: Date | null;
  printCount: string;
  printedBy: string;
  printedAt: Date | null;
  pickListAt: Date | null;
  holdReason: string;
  onHoldAt: Date | null;
  processBy: string;
  processAt: Date | null;
  dispatchBy: string;
  dispatchAt: Date | null;
  shippingService: string;
  shippingRule: string;
  waybillNo: string;
  riderStatus: string;
  latestRiderUpdateAt: Date | null;
  deliveryCompleteBy: string;
  deliveryCompleteAt: Date | null;
  collectedAmount: string;
  collectionMethod: string;
  invoiceCompleteBy: string;
  invoiceCompleteAt: Date | null;
  revertedAt: Date | null;
  revertedBy: string;
  cancelledAt: Date | null;
  cancelledBy: string;
  cancelReason: string;
  cancelKind: string;
  replacedByOrder: string;
  returnStatus: string;
  returnDate: Date | null;
  returnRemark: string;
  exchangeStatus: string;
  exchangeReason: string;
  remarks: MasterDumpRemark[];
  customerNote: string;
  merchantReviewStatus: string;
  merchantReviewNote: string;
  erpSyncStatus: string;
  erpSyncError: string;
  ogfSyncedAt: Date | null;
  ogfBatch: string;
  ogfError: string;
};

function clean(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function at(value: Date | null | undefined) {
  return formatIsoDateTime(value);
}

function joinUnique(values: string[]) {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const value of values) {
    const text = value.trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(text);
  }
  return parts.join(" | ");
}

export function masterDumpSourceName(sourceName: string) {
  switch (sourceName) {
    case "web":
      return "Shopify";
    case "manual":
      return "Manual";
    case "erpnext":
      return "ERPNext";
    case "erpnext-pos":
      return "ERPNext POS";
    default:
      return sourceName;
  }
}

export function masterDumpShippingService(input: {
  sourceName: string;
  locationName: string;
  dispatchedToCustomer: boolean;
  riderName: string;
  courierName: string;
}) {
  if (input.dispatchedToCustomer) return "Customer pickup";
  const rider = clean(input.riderName);
  if (rider) return rider;
  const courier = clean(input.courierName);
  if (courier) return courier;
  const source = input.sourceName.toLowerCase();
  if (source === "pos" || source === "erpnext-pos") return clean(input.locationName);
  return "";
}

export function masterDumpDeliveryResult(input: {
  deliveryOutcome: string | null;
  deliveryFailedReason: string | null;
  riderFailureReason: string | null;
  deliveryCompleteAt: Date | null;
}) {
  const outcome = input.deliveryOutcome?.toLowerCase() ?? "";
  if (outcome === "failed") {
    const reason = clean(input.deliveryFailedReason) || clean(input.riderFailureReason);
    return reason ? `Failed: ${reason}` : "Failed";
  }
  if (outcome === "delivered" || input.deliveryCompleteAt) return "Delivered";
  if (outcome === "pending") return "Pending";
  return "";
}

export function masterDumpFocusStatus(line: Pick<
  MasterDumpLine,
  "itemStatusCategory" | "itemStatusLabel" | "erp1ProductPriority" | "erp2ProductPriority"
>) {
  const label = clean(line.itemStatusLabel);
  if (label) return label;
  const meta = getProductItemStatusMeta(line.itemStatusCategory);
  if (meta.category !== "UNCATEGORIZED") return meta.label;
  return clean(line.erp1ProductPriority) || clean(line.erp2ProductPriority);
}

export function masterDumpPromoDescription(discountApplications: unknown) {
  if (!Array.isArray(discountApplications)) return "";
  const parts: string[] = [];
  for (const row of discountApplications) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const description = typeof record.description === "string" ? record.description.trim() : "";
    const title = typeof record.title === "string" ? record.title.trim() : "";
    const text = description || title;
    if (text) parts.push(text);
  }
  return joinUnique(parts);
}

function stageLabel(stage: string) {
  return FULFILLMENT_STAGE_LABELS[stage] ?? stage;
}

function callCenterNote(remarks: MasterDumpRemark[]) {
  return remarks
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((remark) => {
      const content = remark.content.trim();
      if (!content) return "";
      return `${stageLabel(remark.stage)}: ${content}`;
    })
    .filter(Boolean)
    .join(" | ");
}

function customerNote(remarks: MasterDumpRemark[], fallback: string) {
  const external = remarks
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .filter((remark) => remark.type === "external")
    .map((remark) => remark.content.trim())
    .filter(Boolean);
  return joinUnique([...external, fallback]);
}

export function createMasterOrderRow(input: MasterOrderReportInput): MasterOrderRow {
  return {
    "ORDER ID": input.orderId,
    "ERP INVOICE ID": input.erpInvoiceId,
    "SHOPIFY ORDER ID": input.shopifyOrderId,
    SOURCE: masterDumpSourceName(input.sourceName),
    BUSINESS: input.business,
    "SALES LOCATION": input.salesLocation,
    COMPANY: input.company,
    "POS PROFILE": input.posProfile,
    "POS WAREHOUSE": input.posWarehouse,
    "CREATED AT": at(input.createdAt),
    "CREATED BY": input.createdBy,
    "CUSTOMER NAME": input.customerName,
    "CUSTOMER PHONE": input.customerPhone,
    "SHIPPING PHONE": input.shippingPhone,
    "CUSTOMER EMAIL": input.customerEmail,
    "SHIPPING ADDRESS": input.shippingAddress,
    "BILLING ADDRESS": input.billingAddress,
    "POST CODE": input.postCode,
    DISTRICT: input.district,
    "CONTACT NAME": input.contactName,
    "CONTACT PHONES": input.contactPhones,
    "CONTACT EMAILS": input.contactEmails,
    "CUSTOMER TYPE": input.customerType,
    "CALL CATEGORY": input.callCategory,
    "CONTACT DISTRICT": input.contactDistrict,
    ZONE: input.zone,
    AREA: input.area,
    TOWN: input.town,
    CITY: input.city,
    ADDRESS: input.address,
    COUNTRY: input.country,
    GENDER: input.gender,
    LANGUAGE: input.language,
    OCCUPATION: input.occupation,
    "WORK PLACE": input.workPlace,
    "ASSIGNED MERCHANT": input.assignedMerchant,
    "RECENT MERCHANT": input.recentMerchant,
    "CONTACT SOURCE": input.contactSource,
    ORIGIN: input.origin,
    "WHATSAPP ALLOWED": input.whatsappAllowed,
    "LOYALTY TIER": input.loyaltyTier,
    "LOYALTY OUTREACH": input.loyaltyOutreach,
    "CONTACT REMARKS": input.contactRemarks,
    SUBTOTAL: input.subtotal,
    DISCOUNTS: input.discounts,
    TAX: input.tax,
    SHIPPING: input.shipping,
    "GRAND TOTAL": input.grandTotal,
    CURRENCY: input.currency,
    "ITEM COUNT": input.itemCount,
    COUPON: input.coupon,
    MERCHANT: input.merchant,
    "PROMO CODE OWNER": input.promoCodeOwner,
    "PROMO DESCRIPTION": masterDumpPromoDescription(input.discountApplications),
    "PAYMENT METHOD": input.paymentMethod,
    "PAYMENT STATUS": input.paymentStatus,
    "KOKO REF": input.kokoRef,
    "KOKO LINK AT": at(input.kokoLinkAt),
    "KOKO CONFIRMED BY": input.kokoConfirmedBy,
    "KOKO CONFIRMED AT": at(input.kokoConfirmedAt),
    "FULFILLMENT STAGE": stageLabel(input.fulfillmentStage),
    "STAGE ENTERED AT": at(input.stageEnteredAt),
    "WEBSITE STATUS": input.websiteStatus,
    "DELIVERY RESULT": input.deliveryResult,
    "SAMPLE ADDED BY": input.sampleAddedBy,
    "SAMPLE ADDED AT": at(input.sampleAddedAt),
    "SAMPLE COMPLETE BY": input.sampleCompleteBy,
    "SAMPLE COMPLETE AT": at(input.sampleCompleteAt),
    "SAMPLE SEND LATER DATE": at(input.sampleSendLaterAt),
    "PRINT COUNT": input.printCount,
    "PRINTED BY": input.printedBy,
    "PRINTED AT": at(input.printedAt),
    "PICK LIST AT": at(input.pickListAt),
    "HOLD REASON": input.holdReason,
    "ON HOLD AT": at(input.onHoldAt),
    "PROCESS BY": input.processBy,
    "PROCESS AT": at(input.processAt),
    "DISPATCH BY": input.dispatchBy,
    "DISPATCH AT": at(input.dispatchAt),
    "SHIPPING SERVICE": input.shippingService,
    "SHIPPING RULE": input.shippingRule,
    "WAYBILL NO": input.waybillNo,
    "RIDER STATUS": input.riderStatus,
    "LATEST RIDER UPDATE AT": at(input.latestRiderUpdateAt),
    "DELIVERY COMPLETE BY": input.deliveryCompleteBy,
    "DELIVERY COMPLETE AT": at(input.deliveryCompleteAt),
    "COLLECTED AMOUNT": input.collectedAmount,
    "COLLECTION METHOD": input.collectionMethod,
    "INVOICE COMPLETE BY": input.invoiceCompleteBy,
    "INVOICE COMPLETE AT": at(input.invoiceCompleteAt),
    "REVERTED AT": at(input.revertedAt),
    "REVERTED BY": input.revertedBy,
    "CANCELLED AT": at(input.cancelledAt),
    "CANCELLED BY": input.cancelledBy,
    "CANCEL REASON": input.cancelReason,
    "CANCEL KIND": input.cancelKind,
    "REPLACED BY ORDER": input.replacedByOrder,
    "RETURN STATUS": input.returnStatus,
    "RETURN DATE": at(input.returnDate),
    "RETURN REMARK": input.returnRemark,
    "EXCHANGE STATUS": input.exchangeStatus,
    "EXCHANGE REASON": input.exchangeReason,
    "CALL CENTER NOTE": callCenterNote(input.remarks),
    "CUSTOMER NOTE": customerNote(input.remarks, input.customerNote),
    "MERCHANT REVIEW STATUS": input.merchantReviewStatus,
    "MERCHANT REVIEW NOTE": input.merchantReviewNote,
    "ERP SYNC STATUS": input.erpSyncStatus,
    "ERP SYNC ERROR": input.erpSyncError,
    "OGF SYNCED AT": at(input.ogfSyncedAt),
    "OGF BATCH": input.ogfBatch,
    "OGF ERROR": input.ogfError,
  };
}

export const MASTER_DUMP_VAULT_SOURCE = "Vault OS";
export const MASTER_DUMP_COSMETICS_BUSINESS = "Cosmetics";

export function masterDumpBusinessLabel(
  origin?: string | null,
  importBatchId?: string | null,
) {
  return saleBusinessLabel(origin, importBatchId);
}

export type MasterDumpCatalogItem = {
  sku: string | null;
  barcode: string | null;
  brand: string | null;
  categoryName: string | null;
  itemStatusCategory: string | null;
  itemStatusLabel: string | null;
  erp1ProductPriority: string | null;
  erp2ProductPriority: string | null;
  taxStatus: string | null;
};

export type MasterHistoryContact = {
  name: string;
  phoneNumber: string | null;
  email: string | null;
  extraPhones: string[];
  extraEmails: string[];
  customerType: string | null;
  callCategory: string | null;
  district: string | null;
  zone: string | null;
  area: string | null;
  town: string | null;
  city: string | null;
  address: string | null;
  country: string | null;
  gender: string | null;
  language: string | null;
  occupation: string | null;
  workPlace: string | null;
  assignedMerchant: string | null;
  recentMerchant: string | null;
  source: string | null;
  origin: string | null;
  whatsappAllowed: boolean | null;
  loyaltyTier: string | null;
  loyaltyOutreach: string | null;
  remarks: string | null;
};

export type MasterHistoryInvoice = {
  salesInvoiceNo: string;
  salesInvoiceMasterId: string | null;
  invoiceDate: Date;
  ttlAmount: string;
  currency: string | null;
  locationName: string | null;
  companyName: string;
  paymentMethod: string | null;
  financialStatus: string | null;
  merchantKnownName: string | null;
  origin: string | null;
  importBatchId: string | null;
  rawPaymentContext: unknown;
  lineItems: unknown;
  contact: MasterHistoryContact | null;
};

function moneyText(quantity: number, unitPrice: string, lineAmount?: string) {
  const stored = clean(lineAmount);
  if (stored) return stored;
  const price = Number(unitPrice);
  if (!Number.isFinite(price)) return "";
  return (price * quantity).toFixed(2);
}

export function masterDumpHistoryLines(raw: unknown): MasterDumpLine[] {
  const supplement = readStoredSupplementLines(raw);
  if (supplement.length > 0) {
    return supplement.map((line) => ({
      sku: line.itemCode,
      barcode: null,
      productTitle: line.itemName,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountPercent: "",
      lineTotal: moneyText(line.quantity, line.unitPrice, line.lineAmount),
      brand: null,
      categoryName: null,
      itemStatusCategory: null,
      itemStatusLabel: null,
      erp1ProductPriority: null,
      erp2ProductPriority: null,
      taxStatus: null,
    }));
  }
  return adaptLineItemsForPurchaseUi(raw).map((line) => ({
    sku: line.sku,
    barcode: null,
    productTitle: line.productTitle,
    quantity: line.quantity,
    unitPrice: line.price,
    discountPercent: "",
    lineTotal: moneyText(line.quantity, line.price),
    brand: null,
    categoryName: null,
    itemStatusCategory: null,
    itemStatusLabel: null,
    erp1ProductPriority: null,
    erp2ProductPriority: null,
    taxStatus: null,
  }));
}

export function enrichMasterDumpHistoryLine(
  line: MasterDumpLine,
  catalog: Map<string, MasterDumpCatalogItem>,
): MasterDumpLine {
  const sku = line.sku?.trim().toLowerCase();
  if (!sku) return line;
  const hit = catalog.get(sku);
  if (!hit) return line;
  return {
    ...line,
    barcode: clean(line.barcode) || hit.barcode,
    brand: clean(line.brand) || hit.brand,
    categoryName: clean(line.categoryName) || hit.categoryName,
    itemStatusCategory: line.itemStatusCategory || hit.itemStatusCategory,
    itemStatusLabel: line.itemStatusLabel || hit.itemStatusLabel,
    erp1ProductPriority: line.erp1ProductPriority || hit.erp1ProductPriority,
    erp2ProductPriority: line.erp2ProductPriority || hit.erp2ProductPriority,
    taxStatus: clean(line.taxStatus) || hit.taxStatus,
  };
}

function historyPaymentMethod(paymentMethod: string | null, rawPaymentContext: unknown) {
  const stored = clean(paymentMethod);
  if (stored) return stored;
  if (!rawPaymentContext || typeof rawPaymentContext !== "object" || Array.isArray(rawPaymentContext)) {
    return "";
  }
  const row = rawPaymentContext as Record<string, unknown>;
  const parts: string[] = [];
  if (row.cash) parts.push("Cash");
  if (row.card) parts.push("Card");
  return joinUnique(parts);
}

function yesNo(value: boolean | null | undefined) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "";
}

export function createMasterHistoryOrderRow(input: MasterHistoryInvoice): MasterOrderRow {
  const contact = input.contact;
  const phones = joinUnique([
    contact?.phoneNumber ?? "",
    ...(contact?.extraPhones ?? []),
  ]);
  const emails = joinUnique([
    contact?.email ?? "",
    ...(contact?.extraEmails ?? []),
  ]);
  const lines = masterDumpHistoryLines(input.lineItems);
  return createMasterOrderRow({
    orderId: clean(input.salesInvoiceNo),
    erpInvoiceId: clean(input.salesInvoiceMasterId),
    shopifyOrderId: "",
    sourceName: MASTER_DUMP_VAULT_SOURCE,
    business: masterDumpBusinessLabel(input.origin, input.importBatchId),
    salesLocation: clean(input.locationName),
    company: input.companyName,
    posProfile: "",
    posWarehouse: "",
    createdAt: input.invoiceDate,
    createdBy: "",
    customerName: clean(contact?.name),
    customerPhone: clean(contact?.phoneNumber),
    shippingPhone: "",
    customerEmail: clean(contact?.email),
    shippingAddress: clean(contact?.address),
    billingAddress: "",
    postCode: "",
    district: clean(contact?.district),
    contactName: clean(contact?.name),
    contactPhones: phones,
    contactEmails: emails,
    customerType: clean(contact?.customerType),
    callCategory: clean(contact?.callCategory),
    contactDistrict: clean(contact?.district),
    zone: clean(contact?.zone),
    area: clean(contact?.area),
    town: clean(contact?.town),
    city: clean(contact?.city),
    address: clean(contact?.address),
    country: clean(contact?.country),
    gender: clean(contact?.gender),
    language: clean(contact?.language),
    occupation: clean(contact?.occupation),
    workPlace: clean(contact?.workPlace),
    assignedMerchant: clean(contact?.assignedMerchant),
    recentMerchant: clean(contact?.recentMerchant) || clean(input.merchantKnownName),
    contactSource: clean(contact?.source),
    origin: clean(contact?.origin),
    whatsappAllowed: yesNo(contact?.whatsappAllowed),
    loyaltyTier: clean(contact?.loyaltyTier),
    loyaltyOutreach: clean(contact?.loyaltyOutreach),
    contactRemarks: clean(contact?.remarks),
    subtotal: "",
    discounts: "",
    tax: "",
    shipping: "",
    grandTotal: input.ttlAmount,
    currency: clean(input.currency) || "LKR",
    itemCount: String(lines.length),
    coupon: "",
    merchant: clean(input.merchantKnownName),
    promoCodeOwner: "",
    discountApplications: null,
    paymentMethod: historyPaymentMethod(input.paymentMethod, input.rawPaymentContext),
    paymentStatus: clean(input.financialStatus) || "Imported",
    kokoRef: "",
    kokoLinkAt: null,
    kokoConfirmedBy: "",
    kokoConfirmedAt: null,
    fulfillmentStage: "",
    stageEnteredAt: null,
    websiteStatus: "",
    deliveryResult: "",
    sampleAddedBy: "",
    sampleAddedAt: null,
    sampleCompleteBy: "",
    sampleCompleteAt: null,
    sampleSendLaterAt: null,
    printCount: "",
    printedBy: "",
    printedAt: null,
    pickListAt: null,
    holdReason: "",
    onHoldAt: null,
    processBy: "",
    processAt: null,
    dispatchBy: "",
    dispatchAt: null,
    shippingService: "",
    shippingRule: "",
    waybillNo: "",
    riderStatus: "",
    latestRiderUpdateAt: null,
    deliveryCompleteBy: "",
    deliveryCompleteAt: null,
    collectedAmount: "",
    collectionMethod: "",
    invoiceCompleteBy: "",
    invoiceCompleteAt: null,
    revertedAt: null,
    revertedBy: "",
    cancelledAt: null,
    cancelledBy: "",
    cancelReason: "",
    cancelKind: "",
    replacedByOrder: "",
    returnStatus: "",
    returnDate: null,
    returnRemark: "",
    exchangeStatus: "",
    exchangeReason: "",
    remarks: [],
    customerNote: "",
    merchantReviewStatus: "",
    merchantReviewNote: "",
    erpSyncStatus: "",
    erpSyncError: "",
    ogfSyncedAt: null,
    ogfBatch: "",
    ogfError: "",
  });
}

function blankHistoryLine(invoiceTotal: string): MasterDumpLine {
  return {
    sku: null,
    barcode: null,
    productTitle: "",
    quantity: 0,
    unitPrice: "",
    discountPercent: "",
    lineTotal: invoiceTotal,
    brand: null,
    categoryName: null,
    itemStatusCategory: null,
    itemStatusLabel: null,
    erp1ProductPriority: null,
    erp2ProductPriority: null,
    taxStatus: null,
  };
}

export function masterDumpHistoryItemLines(
  raw: unknown,
  catalog: Map<string, MasterDumpCatalogItem>,
  invoiceTotal: string,
): MasterDumpLine[] {
  const lines = masterDumpHistoryLines(raw).map((line) => enrichMasterDumpHistoryLine(line, catalog));
  return lines.length > 0 ? lines : [blankHistoryLine(invoiceTotal)];
}

export function createMasterItemRows(input: {
  orderId: string;
  erpInvoiceId: string;
  business: string;
  lines: MasterDumpLine[];
}): MasterItemRow[] {
  return input.lines.map((line) => ({
    "ORDER ID": input.orderId,
    "ERP INVOICE ID": input.erpInvoiceId,
    BUSINESS: input.business,
    "ITEM CODE": clean(line.sku),
    BARCODE: clean(line.barcode),
    "ITEM NAME": line.productTitle,
    BRAND: clean(line.brand),
    CATEGORY: clean(line.categoryName),
    "FOCUS/NON FOCUS": masterDumpFocusStatus(line),
    "TAX STATUS": clean(line.taxStatus),
    QTY: String(line.quantity),
    "UNIT PRICE": line.unitPrice,
    "DISCOUNT PERCENT": line.discountPercent,
    "LINE TOTAL": line.lineTotal,
  }));
}
