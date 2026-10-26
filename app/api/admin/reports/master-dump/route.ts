import { PassThrough, Readable } from "node:stream";

import { Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";

import { loadKokoRefNumbersForOrders } from "@/lib/approval-koko-list";
import { isVaultOsDeployment } from "@/lib/falcon-waybill-brand";
import { normalizeContactEmail } from "@/lib/contact-identifiers";
import {
  applyMerchantGroup,
  buildCouponToMerchantMap,
  getMerchantGroupUserMap,
} from "@/lib/merchant-groups";
import { getOrderDiscountCouponCode } from "@/lib/order-discount-coupon";
import { getMerchantCouponCode } from "@/lib/order-merchant-coupon";
import {
  getPaymentMethodInfo,
  orderAlreadyPaidByCardCheckout,
} from "@/lib/payment-method-label";
import { buildPhoneLookupVariants } from "@/lib/phone-lookup";
import { prisma } from "@/lib/prisma";
import { logReportDownload } from "@/lib/report-download-log";
import { REPORT_DUMP_PERMISSIONS } from "@/lib/report-permissions";
import {
  formatAddress,
  getAddressField,
  getCustomerName,
  isPlaceholderErpInvoiceId,
} from "@/lib/reports/csv";
import { dumpInvoiceShippingRuleFromStored } from "@/lib/reports/dump-invoice-shipping";
import {
  createMasterHistoryOrderRow,
  createMasterItemRows,
  createMasterOrderRow,
  masterDumpBusinessLabel,
  masterDumpHistoryItemLines,
  masterDumpHistoryLines,
  MASTER_DUMP_COSMETICS_BUSINESS,
  MASTER_ITEM_HEADERS,
  MASTER_ORDER_HEADERS,
  masterDumpDeliveryResult,
  masterDumpShippingService,
  type MasterDumpCatalogItem,
  type MasterDumpLine,
  type MasterHistoryContact,
} from "@/lib/reports/master-dump";
import { resolveStoredCancelReason } from "@/lib/order-cancel-reason";
import { joinDumpCouponCodes, summarizePaymentGateway } from "@/lib/reports/order-dump";
import { resolveCustomerPhone, resolveShippingPhone } from "@/lib/order-sms-resolvers";
import { normalizeShippingRuleLabelKey } from "@/lib/rider-delivery-charge";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const TEXT_COLUMNS = new Set([
  "ORDER ID",
  "ERP INVOICE ID",
  "SHOPIFY ORDER ID",
  "CUSTOMER PHONE",
  "SHIPPING PHONE",
  "CONTACT PHONES",
  "POST CODE",
  "KOKO REF",
  "WAYBILL NO",
  "ITEM CODE",
  "BARCODE",
]);

const PAGE_SIZE = 40;
const HISTORY_PAGE_SIZE = 80;

const HISTORY_ORDER_BY = [
  { invoiceDate: "desc" as const },
  { id: "desc" as const },
];

const HISTORY_SELECT = {
  id: true,
  salesInvoiceNo: true,
  salesInvoiceMasterId: true,
  invoiceDate: true,
  ttlAmount: true,
  currency: true,
  locationName: true,
  paymentMethod: true,
  financialStatus: true,
  merchantKnownName: true,
  origin: true,
  importBatchId: true,
  rawPaymentContext: true,
  lineItems: true,
  companyLocation: {
    select: {
      name: true,
      erpnextCompany: true,
      company: { select: { name: true } },
    },
  },
  contact: {
    select: {
      name: true,
      phoneNumber: true,
      email: true,
      customerType: true,
      category: true,
      district: true,
      zone: true,
      area: true,
      town: true,
      city: true,
      address: true,
      country: true,
      gender: true,
      language: true,
      occupation: true,
      workPlace: true,
      assignedMerchant: true,
      recentMerchant: true,
      source: true,
      origin: true,
      whatsappAllowed: true,
      loyaltyAssignedTier: true,
      loyaltyOutreachStatus: true,
      remarks: true,
      phones: { select: { phoneNumber: true } },
      emails: { select: { email: true } },
    },
  },
} satisfies Prisma.AdaptPurchaseHistorySelect;

type HistoryRow = Prisma.AdaptPurchaseHistoryGetPayload<{ select: typeof HISTORY_SELECT }>;
const ORDER_BY = [
  { createdAt: "desc" as const },
  { updatedAt: "desc" as const },
  { id: "desc" as const },
];

const USER_NAME = { knownName: true, name: true, email: true } as const;

const ORDER_SELECT = {
  id: true,
  sourceName: true,
  name: true,
  orderNumber: true,
  shopifyOrderId: true,
  shopifyUserId: true,
  erpnextInvoiceId: true,
  createdAt: true,
  financialStatus: true,
  fulfillmentStatus: true,
  fulfillmentStage: true,
  fulfillmentStageEnteredAt: true,
  paymentGatewayNames: true,
  paymentGatewayPrimary: true,
  customerEmail: true,
  customerPhone: true,
  erpnextCustomerId: true,
  district: true,
  shippingAddress: true,
  billingAddress: true,
  discountCodes: true,
  discountApplications: true,
  shippingLines: true,
  rawPayload: true,
  currency: true,
  subtotalPrice: true,
  totalDiscounts: true,
  totalTax: true,
  totalShipping: true,
  totalPrice: true,
  printCount: true,
  posProfile: true,
  erpnextWarehouse: true,
  packageReadyAt: true,
  packageOnHoldAt: true,
  lastPrintedAt: true,
  dispatchedAt: true,
  dispatchedToCustomer: true,
  deliveryCompleteAt: true,
  deliveryOutcome: true,
  deliveryFailedReason: true,
  invoiceCompleteAt: true,
  lastRiderUpdateAt: true,
  revertedFromInvoiceCompleteAt: true,
  cancelledAt: true,
  cancelReason: true,
  cancelKind: true,
  sampleFreeIssueCompleteAt: true,
  sampleFreeIssueSendLaterDate: true,
  kokoLinkGeneratedAt: true,
  kokoLinkTimeConfirmedAt: true,
  erpnextSyncError: true,
  ogfSyncError: true,
  ogfSyncedAt: true,
  ogfSyncBatchCode: true,
  companyLocation: {
    select: {
      name: true,
      erpnextCompany: true,
      company: { select: { name: true } },
    },
  },
  assignedMerchant: { select: { id: true, ...USER_NAME, couponCodes: true } },
  dispatchedBy: { select: USER_NAME },
  dispatchedByRider: { select: { ...USER_NAME, mobile: true } },
  dispatchedByCourierService: { select: { name: true } },
  lastPrintedBy: { select: USER_NAME },
  invoiceCompleteBy: { select: USER_NAME },
  deliveryCompleteBy: { select: USER_NAME },
  packageReadyBy: { select: USER_NAME },
  cancelledBy: { select: USER_NAME },
  revertedFromInvoiceCompleteBy: { select: USER_NAME },
  sampleFreeIssueCompleteBy: { select: USER_NAME },
  kokoLinkTimeConfirmedBy: { select: USER_NAME },
  packageHoldReason: { select: { name: true } },
  replacedByOrder: {
    select: { name: true, orderNumber: true, erpnextInvoiceId: true, shopifyOrderId: true },
  },
  _count: { select: { lineItems: true } },
  remarks: {
    orderBy: { createdAt: "asc" as const },
    select: { stage: true, type: true, content: true, createdAt: true },
  },
  sampleFreeIssues: {
    orderBy: { createdAt: "asc" as const },
    select: { createdAt: true, addedBy: { select: USER_NAME } },
  },
  paymentEntries: { select: { modeOfPayment: true, paymentType: true } },
  waybills: { orderBy: { createdAt: "desc" as const }, select: { waybillNo: true } },
  returns: {
    orderBy: { returnDate: "desc" as const },
    take: 1,
    select: { actionStatus: true, returnDate: true, returnRemark: true, cancelRemark: true },
  },
  exchangesAsOriginal: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: { status: true, reason: true, createdAt: true },
  },
  exchangesAsReplacement: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: { status: true, reason: true, createdAt: true },
  },
  pickListGroupOrders: {
    select: { pickListGroup: { select: { createdAt: true } } },
  },
  riderDeliveryTask: { select: { status: true, failureReason: true } },
  deliveryPayment: {
    select: {
      collectedAmount: true,
      paymentMethod: true,
      lines: { select: { paymentMethod: true } },
    },
  },
  merchantReview: { select: { reviewStatus: true, merchantNotes: true, customerFeedback: true } },
} satisfies Prisma.OrderSelect;

const ITEM_SELECT = {
  id: true,
  name: true,
  orderNumber: true,
  shopifyOrderId: true,
  erpnextInvoiceId: true,
  lineItems: {
    orderBy: { id: "asc" as const },
    select: {
      quantity: true,
      price: true,
      discountPercent: true,
      productItem: {
        select: {
          sku: true,
          barcode: true,
          productTitle: true,
          itemStatusCategory: true,
          itemStatusLabel: true,
          erp1ProductPriority: true,
          erp2ProductPriority: true,
          erp1TaxStatus: true,
          erp2TaxStatus: true,
          vendor: { select: { name: true } },
          category: { select: { name: true } },
        },
      },
    },
  },
} satisfies Prisma.OrderSelect;

type MasterOrder = Prisma.OrderGetPayload<{ select: typeof ORDER_SELECT }>;
type ItemOrder = Prisma.OrderGetPayload<{ select: typeof ITEM_SELECT }>;

type ContactBits = {
  name: string;
  phones: string;
  emails: string;
  customerType: string;
  callCategory: string;
  district: string;
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
  source: string;
  origin: string;
  whatsappAllowed: string;
  loyaltyTier: string;
  loyaltyOutreach: string;
  remarks: string;
};

const COLLECTION_LABEL: Record<string, string> = {
  cod: "Cash",
  bank_transfer: "Bank Transfer",
  card: "Card",
  already_paid: "Already Paid",
};

const RIDER_STATUS: Record<string, string> = {
  assigned: "Assigned",
  accepted: "Accepted",
  arrived: "Arrived",
  completed: "Completed",
  failed: "Failed",
};

const CANCEL_KIND: Record<string, string> = {
  customer_cancel: "Customer cancel",
  replacement: "Replacement",
};

const EXCHANGE_REASON: Record<string, string> = {
  damaged_item: "Damaged item",
  wrong_item: "Wrong item",
  other: "Other",
};

const SIMPLE_STATUS: Record<string, string> = {
  pending: "Pending",
  solved: "Solved",
};

function displayName(user: {
  knownName?: string | null;
  name?: string | null;
  email?: string | null;
  mobile?: string | null;
} | null | undefined) {
  return user?.knownName?.trim() || user?.name?.trim() || user?.email?.trim() || user?.mobile?.trim() || "";
}

function money(value: Prisma.Decimal | null | undefined) {
  return value ? value.toDecimalPlaces(2).toString() : "";
}

function lineMoney(price: Prisma.Decimal, quantity: number, discountPercent: Prisma.Decimal | null) {
  let total = price.mul(quantity);
  if (discountPercent && discountPercent.gt(0)) {
    total = total.mul(new Prisma.Decimal(1).minus(discountPercent.div(100)));
  }
  return money(total);
}

function joinUnique(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const value of values) {
    const text = value?.trim() ?? "";
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(text);
  }
  return parts.join(" | ");
}

function labelOf(map: Record<string, string>, value: string | null | undefined) {
  const key = value?.trim() ?? "";
  if (!key) return "";
  return map[key] ?? key;
}

function orderLabel(order: {
  name: string | null;
  orderNumber: string | null;
  shopifyOrderId: string;
}) {
  return order.name?.trim() || order.orderNumber?.trim() || order.shopifyOrderId;
}

function erpInvoiceId(value: string | null | undefined) {
  return isPlaceholderErpInvoiceId(value) ? "" : value!.trim();
}

function payloadString(rawPayload: Prisma.JsonValue | null, keys: string[]) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return "";
  const top = rawPayload as Record<string, unknown>;
  const data = top.data;
  const nested = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : null;
  for (const key of keys) {
    const value = top[key] ?? nested?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function yesNo(value: boolean | null | undefined) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "";
}

function paymentMethod(order: MasterOrder) {
  const modes = joinUnique(order.paymentEntries.map((entry) => entry.modeOfPayment));
  if (modes) return modes;
  const types = joinUnique(order.paymentEntries.map((entry) => entry.paymentType));
  if (types) return types;
  return summarizePaymentGateway(order.paymentGatewayPrimary ?? order.paymentGatewayNames[0] ?? "");
}

function collectionMethod(order: MasterOrder) {
  const payment = order.deliveryPayment;
  if (!payment) return "";
  const methods = payment.lines.length > 0
    ? payment.lines.map((line) => line.paymentMethod)
    : [payment.paymentMethod];
  return joinUnique(methods.map((method) => COLLECTION_LABEL[method] ?? method));
}

function latestExchange(order: MasterOrder) {
  const original = order.exchangesAsOriginal[0];
  const replacement = order.exchangesAsReplacement[0];
  if (!original) return replacement ?? null;
  if (!replacement) return original;
  return original.createdAt >= replacement.createdAt ? original : replacement;
}

function pickListAt(order: MasterOrder) {
  let latest: Date | null = null;
  for (const row of order.pickListGroupOrders) {
    const at = row.pickListGroup.createdAt;
    if (!latest || at > latest) latest = at;
  }
  return latest;
}

function merchantName(input: {
  couponCode: string | null;
  couponToMerchant: Map<string, { id: string | null; name: string }>;
  assignedMerchant: MasterOrder["assignedMerchant"];
  userToGroup: Map<string, { id: string; name: string }>;
}) {
  for (const coupon of (input.couponCode ?? "").split(",")) {
    const merchant = input.couponToMerchant.get(coupon.trim().toLowerCase());
    if (merchant?.name) return merchant.name;
  }
  const assigned = displayName(input.assignedMerchant);
  if (!assigned) return "";
  return applyMerchantGroup(
    { id: input.assignedMerchant?.id ?? null, name: assigned },
    input.userToGroup,
  ).name;
}

function promoOwner(coupon: string | null, couponToMerchant: Map<string, { name: string }>) {
  return joinUnique((coupon ?? "").split(",").map((part) => couponToMerchant.get(part.trim().toLowerCase())?.name));
}

function erpSyncStatus(order: MasterOrder) {
  if (order.erpnextSyncError?.trim()) return "Failed";
  if (!isPlaceholderErpInvoiceId(order.erpnextInvoiceId)) return "Synced";
  return "";
}

function historyContact(contact: HistoryRow["contact"]): MasterHistoryContact | null {
  if (!contact) return null;
  return {
    name: contact.name,
    phoneNumber: contact.phoneNumber,
    email: contact.email,
    extraPhones: contact.phones.map((phone) => phone.phoneNumber),
    extraEmails: contact.emails.map((email) => email.email),
    customerType: contact.customerType,
    callCategory: contact.category,
    district: contact.district,
    zone: contact.zone,
    area: contact.area,
    town: contact.town,
    city: contact.city,
    address: contact.address,
    country: contact.country,
    gender: contact.gender,
    language: contact.language,
    occupation: contact.occupation,
    workPlace: contact.workPlace,
    assignedMerchant: contact.assignedMerchant,
    recentMerchant: contact.recentMerchant,
    source: contact.source,
    origin: contact.origin,
    whatsappAllowed: contact.whatsappAllowed,
    loyaltyTier: contact.loyaltyAssignedTier,
    loyaltyOutreach: contact.loyaltyOutreachStatus,
    remarks: contact.remarks,
  };
}

function historyCompanyName(row: HistoryRow) {
  return row.companyLocation?.erpnextCompany?.trim()
    || row.companyLocation?.company.name
    || row.companyLocation?.name
    || "";
}

async function loadHistoryCatalog(companyId: string, rows: HistoryRow[]) {
  const skus = new Set<string>();
  for (const row of rows) {
    for (const line of masterDumpHistoryLines(row.lineItems)) {
      const sku = line.sku?.trim();
      if (sku) skus.add(sku);
    }
  }
  const catalog = new Map<string, MasterDumpCatalogItem>();
  if (skus.size === 0) return catalog;
  const items = await prisma.productItem.findMany({
    where: { companyId, sku: { in: [...skus] } },
    select: {
      sku: true,
      barcode: true,
      itemStatusCategory: true,
      itemStatusLabel: true,
      erp1ProductPriority: true,
      erp2ProductPriority: true,
      erp1TaxStatus: true,
      erp2TaxStatus: true,
      vendor: { select: { name: true } },
      category: { select: { name: true } },
    },
  });
  for (const item of items) {
    const key = item.sku?.trim().toLowerCase();
    if (!key || catalog.has(key)) continue;
    catalog.set(key, {
      sku: item.sku,
      barcode: item.barcode,
      brand: item.vendor?.name ?? null,
      categoryName: item.category?.name ?? null,
      itemStatusCategory: item.itemStatusCategory,
      itemStatusLabel: item.itemStatusLabel,
      erp1ProductPriority: item.erp1ProductPriority,
      erp2ProductPriority: item.erp2ProductPriority,
      taxStatus: item.erp1TaxStatus?.trim() || item.erp2TaxStatus?.trim() || null,
    });
  }
  return catalog;
}

function toItemLine(item: ItemOrder["lineItems"][number]): MasterDumpLine {
  return {
    sku: item.productItem.sku,
    barcode: item.productItem.barcode,
    productTitle: item.productItem.productTitle,
    quantity: item.quantity,
    unitPrice: money(item.price),
    discountPercent: item.discountPercent ? item.discountPercent.toString() : "",
    lineTotal: lineMoney(item.price, item.quantity, item.discountPercent),
    brand: item.productItem.vendor?.name ?? null,
    categoryName: item.productItem.category?.name ?? null,
    itemStatusCategory: item.productItem.itemStatusCategory,
    itemStatusLabel: item.productItem.itemStatusLabel,
    erp1ProductPriority: item.productItem.erp1ProductPriority,
    erp2ProductPriority: item.productItem.erp2ProductPriority,
    taxStatus: item.productItem.erp1TaxStatus?.trim() || item.productItem.erp2TaxStatus?.trim() || null,
  };
}

function emptyContact(): ContactBits {
  return {
    name: "",
    phones: "",
    emails: "",
    customerType: "",
    callCategory: "",
    district: "",
    zone: "",
    area: "",
    town: "",
    city: "",
    address: "",
    country: "",
    gender: "",
    language: "",
    occupation: "",
    workPlace: "",
    assignedMerchant: "",
    recentMerchant: "",
    source: "",
    origin: "",
    whatsappAllowed: "",
    loyaltyTier: "",
    loyaltyOutreach: "",
    remarks: "",
  };
}

function preferContact(current: ContactBits | undefined, next: ContactBits) {
  if (!current) return next;
  const merged = { ...current };
  for (const key of Object.keys(merged) as Array<keyof ContactBits>) {
    if (!merged[key]) merged[key] = next[key];
  }
  return merged;
}

async function loadContacts(companyId: string, orders: MasterOrder[]) {
  const byPhone = new Map<string, ContactBits>();
  const byEmail = new Map<string, ContactBits>();
  const phones = new Set<string>();
  const emails = new Set<string>();
  for (const order of orders) {
    const phone = resolveCustomerPhone(order);
    if (phone) {
      for (const variant of buildPhoneLookupVariants(phone)) phones.add(variant);
    }
    const email = normalizeContactEmail(order.customerEmail);
    if (email) emails.add(email);
  }
  if (phones.size === 0 && emails.size === 0) return { byPhone, byEmail };

  const phoneList = [...phones];
  const emailList = [...emails];
  const contacts = await prisma.contactMaster.findMany({
    where: {
      companyId,
      OR: [
        ...(phoneList.length > 0 ? [{ phoneNumber: { in: phoneList } }] : []),
        ...(emailList.length > 0 ? [{ email: { in: emailList, mode: "insensitive" as const } }] : []),
        ...(phoneList.length > 0 ? [{ phones: { some: { phoneNumber: { in: phoneList } } } }] : []),
        ...(emailList.length > 0 ? [{ emails: { some: { email: { in: emailList, mode: "insensitive" as const } } } }] : []),
      ],
    },
    select: {
      name: true,
      phoneNumber: true,
      email: true,
      customerType: true,
      category: true,
      district: true,
      zone: true,
      area: true,
      town: true,
      city: true,
      address: true,
      country: true,
      gender: true,
      language: true,
      occupation: true,
      workPlace: true,
      assignedMerchant: true,
      recentMerchant: true,
      source: true,
      origin: true,
      whatsappAllowed: true,
      loyaltyAssignedTier: true,
      loyaltyOutreachStatus: true,
      remarks: true,
      phones: { select: { phoneNumber: true } },
      emails: { select: { email: true } },
    },
  });

  for (const contact of contacts) {
    const bits: ContactBits = {
      name: contact.name?.trim() ?? "",
      phones: joinUnique([contact.phoneNumber, ...contact.phones.map((phone) => phone.phoneNumber)]),
      emails: joinUnique([contact.email, ...contact.emails.map((email) => email.email)]),
      customerType: contact.customerType?.trim() ?? "",
      callCategory: contact.category?.trim() ?? "",
      district: contact.district?.trim() ?? "",
      zone: contact.zone?.trim() ?? "",
      area: contact.area?.trim() ?? "",
      town: contact.town?.trim() ?? "",
      city: contact.city?.trim() ?? "",
      address: contact.address?.trim() ?? "",
      country: contact.country?.trim() ?? "",
      gender: contact.gender?.trim() ?? "",
      language: contact.language?.trim() ?? "",
      occupation: contact.occupation?.trim() ?? "",
      workPlace: contact.workPlace?.trim() ?? "",
      assignedMerchant: contact.assignedMerchant?.trim() ?? "",
      recentMerchant: contact.recentMerchant?.trim() ?? "",
      source: contact.source?.trim() ?? "",
      origin: contact.origin?.trim() ?? "",
      whatsappAllowed: yesNo(contact.whatsappAllowed),
      loyaltyTier: contact.loyaltyAssignedTier?.trim() ?? "",
      loyaltyOutreach: contact.loyaltyOutreachStatus?.trim() ?? "",
      remarks: contact.remarks?.trim() ?? "",
    };
    for (const phone of [contact.phoneNumber, ...contact.phones.map((row) => row.phoneNumber)]) {
      if (!phone) continue;
      for (const variant of buildPhoneLookupVariants(phone)) {
        byPhone.set(variant, preferContact(byPhone.get(variant), bits));
      }
    }
    for (const email of [contact.email, ...contact.emails.map((row) => row.email)]) {
      const key = normalizeContactEmail(email);
      if (!key) continue;
      byEmail.set(key, preferContact(byEmail.get(key), bits));
    }
  }

  return { byPhone, byEmail };
}

function contactForOrder(
  order: MasterOrder,
  contacts: { byPhone: Map<string, ContactBits>; byEmail: Map<string, ContactBits> },
) {
  let hit: ContactBits | undefined;
  const phone = resolveCustomerPhone(order);
  if (phone) {
    for (const variant of buildPhoneLookupVariants(phone)) {
      hit = preferContact(hit, contacts.byPhone.get(variant) ?? emptyContact());
      if (contacts.byPhone.has(variant)) break;
    }
  }
  const email = normalizeContactEmail(order.customerEmail);
  if (email && contacts.byEmail.has(email)) hit = preferContact(hit, contacts.byEmail.get(email)!);
  return hit ?? emptyContact();
}

function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

async function loadManualCreatorEmails(companyId: string, orderIds: string[]) {
  const orderIdToEmail = new Map<string, string>();
  if (orderIds.length === 0) return orderIdToEmail;
  const logs = await prisma.auditLog.findMany({
    where: {
      companyId,
      action: "manual_order_created",
      entityType: "Order",
      entityId: { in: orderIds },
    },
    orderBy: { createdAt: "asc" },
    select: { entityId: true, actorUser: { select: { email: true } } },
  });
  for (const log of logs) {
    const email = log.actorUser?.email?.trim();
    if (log.entityId && email && !orderIdToEmail.has(log.entityId)) orderIdToEmail.set(log.entityId, email);
  }
  return orderIdToEmail;
}

function createdByEmail(input: {
  order: MasterOrder;
  auditEmail: string | null;
  shopifyUserIdToEmail: Map<string, string>;
  erpnextUsernameToEmail: Map<string, string>;
}) {
  if (input.auditEmail) return input.auditEmail;
  if (input.order.shopifyUserId) {
    const email = input.shopifyUserIdToEmail.get(input.order.shopifyUserId.trim());
    if (email) return email;
  }
  const source = input.order.sourceName.toLowerCase();
  if ((source === "pos" || source === "manual") && input.order.assignedMerchant?.email?.trim()) {
    return input.order.assignedMerchant.email.trim();
  }
  const owner = payloadString(input.order.rawPayload, ["owner"]);
  if (owner) {
    if (looksLikeEmail(owner)) return owner;
    const email = input.erpnextUsernameToEmail.get(owner.toLowerCase());
    if (email) return email;
  }
  return "";
}

export async function GET(request: NextRequest) {
  const report = request.nextUrl.searchParams.get("report");
  if (report !== "order" && report !== "item") {
    return NextResponse.json({ error: "Use report=order or report=item" }, { status: 400 });
  }

  const auth = await requirePermission(REPORT_DUMP_PERMISSIONS.master);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const companyId = auth.context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const orderWhere = { companyId };
  const fileName = report === "item" ? "master-item.xlsx" : "master-order.xlsx";
  const reportLabel = report === "item" ? "Master Item Report" : "Master Order Report";
  const headers = report === "item" ? MASTER_ITEM_HEADERS : MASTER_ORDER_HEADERS;

  const [merchantUsers, userToGroup, zoneMembers, creatorUsers] = await Promise.all([
    prisma.user.findMany({
      where: { companyId, couponCodes: { isEmpty: false } },
      select: { id: true, knownName: true, name: true, email: true, couponCodes: true },
    }),
    getMerchantGroupUserMap(companyId),
    prisma.riderDeliveryZoneMember.findMany({ select: { districtLabelKey: true, zoneLabel: true } }),
    report === "order"
      ? prisma.user.findMany({
          where: { companyId, OR: [{ shopifyUserIds: { isEmpty: false } }, { erpnextUsername: { not: null } }] },
          select: { email: true, shopifyUserIds: true, erpnextUsername: true },
        })
      : Promise.resolve([]),
  ]);

  const couponToMerchant = buildCouponToMerchantMap(merchantUsers, userToGroup);
  const zoneByDistrict = new Map<string, string>();
  for (const member of zoneMembers) {
    if (!zoneByDistrict.has(member.districtLabelKey)) {
      zoneByDistrict.set(member.districtLabelKey, member.zoneLabel);
    }
  }
  const shopifyUserIdToEmail = new Map<string, string>();
  const erpnextUsernameToEmail = new Map<string, string>();
  for (const user of creatorUsers) {
    const email = user.email?.trim();
    if (!email) continue;
    for (const shopifyUserId of user.shopifyUserIds) {
      const key = shopifyUserId.trim();
      if (key && !shopifyUserIdToEmail.has(key)) shopifyUserIdToEmail.set(key, email);
    }
    const username = user.erpnextUsername?.trim().toLowerCase();
    if (username && !erpnextUsernameToEmail.has(username)) erpnextUsernameToEmail.set(username, email);
  }

  const pass = new PassThrough();
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: pass, useStyles: true });
  const sheet = workbook.addWorksheet(report === "item" ? "Items" : "Orders", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  headers.forEach((header, index) => {
    const column = sheet.getColumn(index + 1);
    column.width = Math.min(40, Math.max(14, header.length + 2));
    if (TEXT_COLUMNS.has(header)) column.numFmt = "@";
  });
  const headerRow = sheet.addRow([...headers]);
  headerRow.font = { name: "Arial", bold: true, size: 11 };
  headerRow.commit();
  let writtenRows = 1;

  const writeRow = (values: string[]) => {
    sheet.addRow(values).commit();
    writtenRows += 1;
  };

  const vaultOs = isVaultOsDeployment();

  void (async () => {
    try {
        if (!vaultOs) {
        let cursorId: string | undefined;
        for (;;) {
          if (request.signal.aborted) break;
          if (report === "item") {
            const orders = await prisma.order.findMany({
              where: orderWhere,
              orderBy: ORDER_BY,
              take: PAGE_SIZE,
              ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
              select: ITEM_SELECT,
            });
            if (orders.length === 0) break;
            for (const order of orders) {
              if (order.lineItems.length === 0) continue;
              const rows = createMasterItemRows({
                orderId: orderLabel(order),
                erpInvoiceId: erpInvoiceId(order.erpnextInvoiceId),
                business: MASTER_DUMP_COSMETICS_BUSINESS,
                lines: order.lineItems.map(toItemLine),
              });
              for (const row of rows) writeRow(MASTER_ITEM_HEADERS.map((header) => row[header] ?? ""));
            }
            cursorId = orders[orders.length - 1]!.id;
            if (orders.length < PAGE_SIZE) break;
            continue;
          }

          const orders = await prisma.order.findMany({
            where: orderWhere,
            orderBy: ORDER_BY,
            take: PAGE_SIZE,
            ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
            select: ORDER_SELECT,
          });
          if (orders.length === 0) break;
          const orderIds = orders.map((order) => order.id);
          const [contacts, kokoRefs, creatorEmails] = await Promise.all([
            loadContacts(companyId, orders),
            loadKokoRefNumbersForOrders(companyId, orderIds),
            loadManualCreatorEmails(companyId, orderIds),
          ]);

          for (const order of orders) {
            const contact = contactForOrder(order, contacts);
            const districtKey = normalizeShippingRuleLabelKey(order.district);
            const shippingAddress = formatAddress(order.shippingAddress);
            const merchantCoupon = getMerchantCouponCode({
              sourceName: order.sourceName,
              discountCodes: order.discountCodes,
              rawPayload: order.rawPayload,
              assignedMerchantCouponCodes: order.assignedMerchant?.couponCodes ?? null,
            });
            const discountCoupon = getOrderDiscountCouponCode({
              sourceName: order.sourceName,
              discountCodes: order.discountCodes,
              rawPayload: order.rawPayload,
            });
            const exchange = latestExchange(order);
            const orderReturn = order.returns[0];
            const latestSample = order.sampleFreeIssues.at(-1);
            const row = createMasterOrderRow({
              orderId: orderLabel(order),
              erpInvoiceId: erpInvoiceId(order.erpnextInvoiceId),
              shopifyOrderId: order.shopifyOrderId,
              sourceName: order.sourceName,
              business: MASTER_DUMP_COSMETICS_BUSINESS,
              salesLocation: order.companyLocation.name,
              company: order.companyLocation.erpnextCompany?.trim() || order.companyLocation.company.name,
              posProfile: order.posProfile?.trim() ?? "",
              posWarehouse: order.erpnextWarehouse?.trim() ?? "",
              createdAt: order.createdAt,
              createdBy: createdByEmail({
                order,
                auditEmail: creatorEmails.get(order.id) ?? null,
                shopifyUserIdToEmail,
                erpnextUsernameToEmail,
              }),
              customerName: getCustomerName(order.shippingAddress) || getCustomerName(order.billingAddress) || order.customerEmail || "",
              customerPhone: resolveCustomerPhone(order) ?? "",
              shippingPhone: resolveShippingPhone(order) ?? "",
              customerEmail: order.customerEmail?.trim() ?? "",
              shippingAddress,
              billingAddress: formatAddress(order.billingAddress),
              postCode: getAddressField(order.shippingAddress, "zip") || getAddressField(order.billingAddress, "zip"),
              district: order.district?.trim() ?? "",
              contactName: contact.name,
              contactPhones: contact.phones,
              contactEmails: contact.emails,
              customerType: contact.customerType,
              callCategory: contact.callCategory,
              contactDistrict: contact.district,
              zone: contact.zone || (districtKey ? zoneByDistrict.get(districtKey) ?? "" : ""),
              area: contact.area,
              town: contact.town,
              city: contact.city,
              address: contact.address,
              country: contact.country,
              gender: contact.gender,
              language: contact.language,
              occupation: contact.occupation,
              workPlace: contact.workPlace,
              assignedMerchant: contact.assignedMerchant,
              recentMerchant: contact.recentMerchant,
              contactSource: contact.source,
              origin: contact.origin,
              whatsappAllowed: contact.whatsappAllowed,
              loyaltyTier: contact.loyaltyTier,
              loyaltyOutreach: contact.loyaltyOutreach,
              contactRemarks: contact.remarks,
              subtotal: money(order.subtotalPrice),
              discounts: money(order.totalDiscounts),
              tax: money(order.totalTax),
              shipping: money(order.totalShipping),
              grandTotal: money(order.totalPrice),
              currency: order.currency?.trim() ?? "",
              itemCount: String(order._count.lineItems),
              coupon: joinDumpCouponCodes(merchantCoupon, discountCoupon),
              merchant: merchantName({
                couponCode: merchantCoupon,
                couponToMerchant,
                assignedMerchant: order.assignedMerchant,
                userToGroup,
              }),
              promoCodeOwner: promoOwner(discountCoupon, couponToMerchant),
              discountApplications: order.discountApplications,
              paymentMethod: paymentMethod(order),
              paymentStatus: order.financialStatus?.trim() ?? "",
              kokoRef: kokoRefs.get(order.id) ?? "",
              kokoLinkAt: order.kokoLinkGeneratedAt,
              kokoConfirmedBy: displayName(order.kokoLinkTimeConfirmedBy),
              kokoConfirmedAt: order.kokoLinkTimeConfirmedAt,
              fulfillmentStage: order.fulfillmentStage,
              stageEnteredAt: order.fulfillmentStageEnteredAt,
              websiteStatus: order.fulfillmentStatus?.trim() ?? "",
              deliveryResult: masterDumpDeliveryResult({
                deliveryOutcome: order.deliveryOutcome,
                deliveryFailedReason: order.deliveryFailedReason,
                riderFailureReason: order.riderDeliveryTask?.failureReason ?? null,
                deliveryCompleteAt: order.deliveryCompleteAt,
              }),
              sampleAddedBy: joinUnique(order.sampleFreeIssues.map((sample) => displayName(sample.addedBy))),
              sampleAddedAt: latestSample?.createdAt ?? null,
              sampleCompleteBy: displayName(order.sampleFreeIssueCompleteBy),
              sampleCompleteAt: order.sampleFreeIssueCompleteAt,
              sampleSendLaterAt: order.sampleFreeIssueSendLaterDate,
              printCount: String(order.printCount),
              printedBy: displayName(order.lastPrintedBy),
              printedAt: order.lastPrintedAt,
              pickListAt: pickListAt(order),
              holdReason: order.packageHoldReason?.name?.trim() ?? "",
              onHoldAt: order.packageOnHoldAt,
              processBy: displayName(order.packageReadyBy),
              processAt: order.packageReadyAt,
              dispatchBy: displayName(order.dispatchedBy),
              dispatchAt: order.dispatchedAt,
              shippingService: masterDumpShippingService({
                sourceName: order.sourceName,
                locationName: order.companyLocation.name,
                dispatchedToCustomer: order.dispatchedToCustomer,
                riderName: displayName(order.dispatchedByRider),
                courierName: order.dispatchedByCourierService?.name ?? "",
              }),
              shippingRule: dumpInvoiceShippingRuleFromStored({
                totalShipping: order.totalShipping?.toString() ?? null,
                shippingLines: order.shippingLines,
                rawPayload: order.rawPayload,
                sourceName: order.sourceName,
                discountCodes: order.discountCodes,
                dispatchedToCustomer: order.dispatchedToCustomer,
                shippingAddress,
              }),
              waybillNo: joinUnique(order.waybills.map((waybill) => waybill.waybillNo)),
              riderStatus: labelOf(RIDER_STATUS, order.riderDeliveryTask?.status),
              latestRiderUpdateAt: order.lastRiderUpdateAt,
              deliveryCompleteBy: displayName(order.deliveryCompleteBy),
              deliveryCompleteAt: order.deliveryCompleteAt,
              collectedAmount: money(order.deliveryPayment?.collectedAmount),
              collectionMethod: collectionMethod(order),
              invoiceCompleteBy: orderAlreadyPaidByCardCheckout(order)
                ? getPaymentMethodInfo(order).label
                : displayName(order.invoiceCompleteBy),
              invoiceCompleteAt: order.invoiceCompleteAt,
              revertedAt: order.revertedFromInvoiceCompleteAt,
              revertedBy: displayName(order.revertedFromInvoiceCompleteBy),
              cancelledAt: order.cancelledAt,
              cancelledBy: displayName(order.cancelledBy),
              cancelReason: resolveStoredCancelReason({
                cancelReason: order.cancelReason,
                returnCancelRemark: orderReturn?.cancelRemark,
                returnRemark: orderReturn?.returnRemark,
              }),
              cancelKind: labelOf(CANCEL_KIND, order.cancelKind),
              replacedByOrder: order.replacedByOrder ? orderLabel(order.replacedByOrder) : "",
              returnStatus: labelOf(SIMPLE_STATUS, orderReturn?.actionStatus),
              returnDate: orderReturn?.returnDate ?? null,
              returnRemark: orderReturn?.returnRemark?.trim() ?? "",
              exchangeStatus: labelOf(SIMPLE_STATUS, exchange?.status),
              exchangeReason: labelOf(EXCHANGE_REASON, exchange?.reason),
              remarks: order.remarks,
              customerNote: payloadString(order.rawPayload, ["note", "customer_note", "special_note"]),
              merchantReviewStatus: order.merchantReview?.reviewStatus?.trim() ?? "",
              merchantReviewNote: order.merchantReview?.merchantNotes?.trim() || order.merchantReview?.customerFeedback?.trim() || "",
              erpSyncStatus: erpSyncStatus(order),
              erpSyncError: order.erpnextSyncError?.trim() ?? "",
              ogfSyncedAt: order.ogfSyncedAt,
              ogfBatch: order.ogfSyncBatchCode?.trim() ?? "",
              ogfError: order.ogfSyncError?.trim() ?? "",
            });
            writeRow(MASTER_ORDER_HEADERS.map((header) => row[header] ?? ""));
          }
          cursorId = orders[orders.length - 1]!.id;
          if (orders.length < PAGE_SIZE) break;
        }
        }

        if (vaultOs) {
        let historyCursorId: string | undefined;
        for (;;) {
          if (request.signal.aborted) break;
          const historyRows = await prisma.adaptPurchaseHistory.findMany({
            where: { companyId },
            orderBy: HISTORY_ORDER_BY,
            take: HISTORY_PAGE_SIZE,
            ...(historyCursorId ? { skip: 1, cursor: { id: historyCursorId } } : {}),
            select: HISTORY_SELECT,
          });
          if (historyRows.length === 0) break;
          const catalog = await loadHistoryCatalog(companyId, historyRows);
          for (const history of historyRows) {
            const business = masterDumpBusinessLabel(history.origin, history.importBatchId);
            if (report === "item") {
              const rows = createMasterItemRows({
                orderId: history.salesInvoiceNo.trim() || history.id,
                erpInvoiceId: history.salesInvoiceMasterId?.trim() ?? "",
                business,
                lines: masterDumpHistoryItemLines(
                  history.lineItems,
                  catalog,
                  money(history.ttlAmount),
                ),
              });
              for (const row of rows) writeRow(MASTER_ITEM_HEADERS.map((header) => row[header] ?? ""));
              continue;
            }
            const row = createMasterHistoryOrderRow({
              salesInvoiceNo: history.salesInvoiceNo,
              salesInvoiceMasterId: history.salesInvoiceMasterId,
              invoiceDate: history.invoiceDate,
              ttlAmount: money(history.ttlAmount),
              currency: history.currency,
              locationName: history.locationName ?? history.companyLocation?.name ?? null,
              companyName: historyCompanyName(history),
              paymentMethod: history.paymentMethod,
              financialStatus: history.financialStatus,
              merchantKnownName: history.merchantKnownName,
              origin: history.origin,
              importBatchId: history.importBatchId,
              rawPaymentContext: history.rawPaymentContext,
              lineItems: history.lineItems,
              contact: historyContact(history.contact),
            });
            writeRow(MASTER_ORDER_HEADERS.map((header) => row[header] ?? ""));
          }
          historyCursorId = historyRows[historyRows.length - 1]!.id;
          if (historyRows.length < HISTORY_PAGE_SIZE) break;
        }
        }

        if (!request.signal.aborted) {
          sheet.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: writtenRows, column: headers.length },
          };
          await logReportDownload({
            companyId,
            userId: auth.context?.user?.id,
            reportKey: `orders:master:${report}`,
            reportLabel,
            filters: "range=all",
            fileName,
          });
          sheet.commit();
          await workbook.commit();
        } else {
          pass.destroy();
        }
      } catch (error) {
        pass.destroy(error instanceof Error ? error : new Error("Master report failed"));
      }
  })();

  return new NextResponse(Readable.toWeb(pass) as ReadableStream<Uint8Array>, {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
