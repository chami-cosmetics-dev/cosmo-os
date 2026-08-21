import "server-only";

import { findMatchingContacts } from "@/lib/contact-identifiers";
import { resolveErpApiCreds } from "@/lib/erpnext-customer-display-name";
import { formatInvoiceOrderReference } from "@/lib/fulfillment-order-reference";
import { getFinancePaymentApprovalBlockReason } from "@/lib/approval-workflow";
import { resolveInvoicePrintPhones, withAddressPhone } from "@/lib/invoice-print-contact";
import { getOrderPaymentGatewayColumnState } from "@/lib/order-payment-gateway-compat";
import { resolveOrderDiscountCouponForOrder, resolveOrderMerchantCouponForOrder } from "@/lib/order-discount-coupon";
import { resolveOrderErpSpecialRemarksForOrder } from "@/lib/order-erp-special-remarks";
import {
  resolveOrderDiscountTotal,
  resolveOrderLineItemsPricing,
  sumOriginalTotals,
} from "@/lib/order-line-item-pricing";
import { resolveOrderShippingDisplayForOrder } from "@/lib/order-shipping-display";
import { getPaymentMethodInfo } from "@/lib/payment-method-label";
import { buildPhoneLookupVariants } from "@/lib/phone-lookup";
import { formatPickListBarcode, resolvePickListBarcode } from "@/lib/product-item-barcode";
import { loadBarcodeLookupBySku } from "@/lib/product-item-barcode.server";
import { renderPrintFormatHtml } from "@/lib/print-format-renderer";
import { orderStageUpdate } from "@/lib/order-stage-timing";
import { prisma } from "@/lib/prisma";
import { cuidSchema } from "@/lib/validation";
import { formatAppDateTime, formatAppIsoDate } from "@/lib/format-datetime";

export type RenderOrderInvoiceResult =
  | { ok: true; html: string }
  | { ok: false; status: number; message: string };

function formatAddress(addr: unknown): string {
  if (!addr || typeof addr !== "object") return "";
  const a = addr as Record<string, unknown>;
  const parts = [
    a.address1,
    a.address2,
    [a.city, a.province_code].filter(Boolean).join(", "),
    a.country,
    a.zip,
  ].filter(Boolean) as string[];
  return parts.join(", ") || "";
}

/** Shopify-style addresses: prefer `name`, then first + last. */
function getCustomerNameFromAddress(addr: unknown): string {
  if (!addr || typeof addr !== "object") return "";
  const a = addr as Record<string, unknown>;
  if (typeof a.name === "string" && a.name.trim()) return a.name.trim();
  if (typeof a.name === "number" && Number.isFinite(a.name)) return String(a.name);
  const fn = typeof a.first_name === "string" ? a.first_name.trim() : "";
  const ln = typeof a.last_name === "string" ? a.last_name.trim() : "";
  return [fn, ln].filter(Boolean).join(" ").trim();
}

/**
 * Manual orders only persist customer name in `name` (not Shopify first/last).
 * Using first/last can show numeric junk that is not a person name.
 */
function getManualCustomerNameFromAddress(addr: unknown): string {
  if (!addr || typeof addr !== "object") return "";
  const a = addr as Record<string, unknown>;
  if (typeof a.name === "string" && a.name.trim()) return a.name.trim();
  if (typeof a.name === "number" && Number.isFinite(a.name)) return String(a.name);
  return "";
}

function stripManualInvoiceNumberAsName(
  order: { sourceName: string; name: string | null; orderNumber: string | null },
  display: string
): string {
  const t = display.trim();
  if (!t || order.sourceName !== "manual") return t;
  const inv = order.orderNumber?.trim() ?? "";
  const ordName = order.name?.trim() ?? "";
  if (t === inv || t === ordName) return "";
  return t;
}

function getCity(addr: unknown): string {
  if (!addr || typeof addr !== "object") return "";
  const a = addr as Record<string, unknown>;
  return typeof a.city === "string" ? a.city : "";
}

function addUniquePhoneForInvoice(phones: string[], seenVariants: Set<string>, value?: string | null) {
  const phone = value?.trim();
  if (!phone) return;

  const variants = buildPhoneLookupVariants(phone);
  if (variants.some((variant) => seenVariants.has(variant))) return;

  phones.push(phone);
  for (const variant of variants) {
    seenVariants.add(variant);
  }
}

async function getInvoiceCustomerPhones(input: {
  companyId: string;
  email?: string | null;
  phoneNumber?: string | null;
}) {
  const phones: string[] = [];
  const seenVariants = new Set<string>();
  addUniquePhoneForInvoice(phones, seenVariants, input.phoneNumber);

  const matches = await findMatchingContacts(input.companyId, input.email ?? null, input.phoneNumber ?? null);
  const emailMatch = matches.emailMatches[0] ?? null;
  const phoneMatch = matches.phoneMatches[0] ?? null;
  if (emailMatch && phoneMatch && emailMatch.id !== phoneMatch.id) {
    return phones;
  }

  const contact = emailMatch ?? phoneMatch;
  if (!contact) return phones;

  addUniquePhoneForInvoice(phones, seenVariants, contact.phoneNumber);

  const secondaryPhones = await prisma.contactPhone.findMany({
    where: { contactId: contact.id },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: { phoneNumber: true },
  });

  for (const row of secondaryPhones) {
    addUniquePhoneForInvoice(phones, seenVariants, row.phoneNumber);
  }

  return phones;
}

function formatInvoiceMoney(val: string | number): string {
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (Number.isNaN(n)) return String(val);
  return `Rs ${n.toLocaleString("en-LK", { minimumFractionDigits: 2 })}`;
}

function toPrintContextValue(value: unknown): unknown {
  if (value == null) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => toPrintContextValue(item));
  if (typeof (value as { toJSON?: unknown }).toJSON === "function") {
    return (value as { toJSON: () => unknown }).toJSON();
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, toPrintContextValue(entry)]),
  );
}

function buildOrderDataForPrint(order: unknown): Record<string, unknown> {
  const orderData = toPrintContextValue(order) as Record<string, unknown>;
  const companyLocation = orderData.companyLocation;
  if (companyLocation && typeof companyLocation === "object") {
    const safeCompanyLocation = { ...(companyLocation as Record<string, unknown>) };
    delete safeCompanyLocation.erpnextInstance;
    orderData.companyLocation = safeCompanyLocation;
  }
  return orderData;
}

/**
 * Builds the printable invoice HTML for a single order.
 * Shared by the single-order invoice route and the bulk-print route so
 * both render identically (finance gate, print format check, printCount mutate).
 */
export async function renderOrderInvoice(input: {
  orderId: string;
  companyId: string;
  userId: string;
  shouldIncrementPrint: boolean;
  autoPrint: boolean;
}): Promise<RenderOrderInvoiceResult> {
  const { companyId, userId, shouldIncrementPrint, autoPrint } = input;

  const idResult = cuidSchema.safeParse(input.orderId);
  if (!idResult.success) {
    return { ok: false, status: 400, message: "Invalid ID" };
  }

  const [gatewayColumns, order] = await Promise.all([
    getOrderPaymentGatewayColumnState(),
    prisma.order.findFirst({
      where: { id: idResult.data, companyId },
      include: {
        company: { select: { name: true, address: true, logoUrl: true } },
        companyLocation: {
          include: {
            erpnextInstance: true,
            defaultOrderPrintFormat: {
              select: { id: true, name: true, html: true, isEnabled: true },
            },
          },
        },
        assignedMerchant: { select: { name: true, knownName: true, email: true, couponCodes: true } },
        lineItems: {
          include: {
            productItem: {
              select: {
                productTitle: true,
                variantTitle: true,
                sku: true,
                barcode: true,
                price: true,
                compareAtPrice: true,
              },
            },
          },
        },
        sampleFreeIssues: {
          include: {
            sampleFreeIssueItem: { select: { name: true, type: true } },
          },
        },
        remarks: { orderBy: { createdAt: "asc" } },
      },
    }),
  ]);

  if (!order) {
    return { ok: false, status: 404, message: "Order not found" };
  }

  const paymentGatewayPrimary = gatewayColumns.hasPaymentGatewayPrimary
    ? ((order as unknown as Record<string, unknown>)?.paymentGatewayPrimary as string | null ?? null)
    : null;
  const paymentGatewayNames = gatewayColumns.hasPaymentGatewayNames
    ? (((order as unknown as Record<string, unknown>)?.paymentGatewayNames as string[] | null) ?? [])
    : [];

  const financeBlock = await getFinancePaymentApprovalBlockReason({
    id: order.id,
    paymentGatewayPrimary,
    paymentGatewayNames,
    erpnextInvoiceId: order.erpnextInvoiceId,
  });
  // View-only (Insight / read) must still open the invoice HTML.
  // Finance gate only blocks fulfillment print increments.
  if (financeBlock && shouldIncrementPrint) {
    return { ok: false, status: 409, message: financeBlock };
  }

  const erpConfig = resolveErpApiCreds(order.companyLocation.erpnextInstance);
  const lineItemSkus = order.lineItems
    .map((li) => li.productItem.sku)
    .filter((sku): sku is string => Boolean(sku?.trim()));
  const barcodeBySku = await loadBarcodeLookupBySku(companyId, lineItemSkus, { erpConfig });

  const showWatermark = order.printCount > 0;
  const printedAt = new Date();
  if (shouldIncrementPrint) {
    const stage = order.fulfillmentStage;
    const printStageUpdate =
      stage === "order_received" || stage === "sample_free_issue"
        ? orderStageUpdate("print", printedAt)
        : stage === "print"
          ? orderStageUpdate("ready_to_dispatch", printedAt)
          : {};
    const clearLegacyPackageReady =
      stage === "print" ? { packageReadyAt: null, packageReadyById: null } : {};
    await prisma.order.update({
      where: { id: order.id },
      data: {
        printCount: { increment: 1 },
        lastPrintedAt: printedAt,
        lastPrintedById: userId,
        ...printStageUpdate,
        ...clearLegacyPackageReady,
      },
    });
  }

  const loc = order.companyLocation;
  const company = order.company;
  const pickAddrName =
    order.sourceName === "manual" ? getManualCustomerNameFromAddress : getCustomerNameFromAddress;
  const customerNameRaw =
    pickAddrName(order.shippingAddress) ||
    pickAddrName(order.billingAddress) ||
    order.customerEmail?.trim() ||
    "";
  const customerName = stripManualInvoiceNumberAsName(order, customerNameRaw);
  const billingAddr = formatAddress(order.billingAddress);
  const shippingAddr = formatAddress(order.shippingAddress);
  const billingName = stripManualInvoiceNumberAsName(order, pickAddrName(order.billingAddress));
  const shippingName = stripManualInvoiceNumberAsName(order, pickAddrName(order.shippingAddress));
  const invoicePhones = resolveInvoicePrintPhones({
    customerPhone: order.customerPhone,
    shippingAddress: order.shippingAddress,
    billingAddress: order.billingAddress,
    rawPayload: order.rawPayload,
  });
  const billingPhone = invoicePhones.billingPhone;
  const shippingPhone = invoicePhones.shippingPhone;
  const shippingCity = getCity(order.shippingAddress);
  const shippingDisplay = await resolveOrderShippingDisplayForOrder({
    totalShipping: order.totalShipping?.toString() ?? null,
    shippingLines: order.shippingLines,
    rawPayload: order.rawPayload,
    sourceName: order.sourceName,
    name: order.name,
    erpnextInvoiceId: order.erpnextInvoiceId,
    erpnextInstance: order.companyLocation.erpnextInstance,
    discountCodes: order.discountCodes,
  });
  const pickupDeliveryLabel =
    shippingDisplay.label?.toLowerCase().includes("pickup") ? shippingDisplay.label : null;
  const customerPhones = await getInvoiceCustomerPhones({
    companyId,
    email: order.customerEmail,
    phoneNumber: invoicePhones.resolvedPhone || order.customerPhone,
  });
  const customerPhoneDisplay = customerPhones.join(", ");

  const externalRemarks = order.remarks
    .filter((r) => r.type === "external" && r.showOnInvoice)
    .map((r) => r.content);
  const internalRemarks = order.remarks
    .filter((r) => r.type === "internal" && r.showOnInvoice)
    .map((r) => r.content);

  const merchantCouponCode = await resolveOrderMerchantCouponForOrder({
    sourceName: order.sourceName,
    discountCodes: order.discountCodes,
    rawPayload: order.rawPayload,
    assignedMerchantCouponCodes: order.assignedMerchant?.couponCodes,
    erpnextInvoiceId: order.erpnextInvoiceId,
    erpnextInstance: order.companyLocation.erpnextInstance,
  });
  const discountCouponCode = await resolveOrderDiscountCouponForOrder({
    sourceName: order.sourceName,
    discountCodes: order.discountCodes,
    rawPayload: order.rawPayload,
    name: order.name,
    erpnextInvoiceId: order.erpnextInvoiceId,
    erpnextInstance: order.companyLocation.erpnextInstance,
  });
  const erpSpecialRemarks = await resolveOrderErpSpecialRemarksForOrder({
    sourceName: order.sourceName,
    rawPayload: order.rawPayload,
    name: order.name,
    erpnextInvoiceId: order.erpnextInvoiceId,
    erpnextInstance: order.companyLocation.erpnextInstance,
  });

  const linePricing = await resolveOrderLineItemsPricing({
    sourceName: order.sourceName,
    rawPayload: order.rawPayload,
    name: order.name,
    erpnextInvoiceId: order.erpnextInvoiceId,
    erpnextInstance: order.companyLocation.erpnextInstance,
    lineItems: order.lineItems.map((li) => ({
      sku: li.productItem.sku,
      quantity: li.quantity,
      price: li.price.toString(),
    })),
  });
  const discountTotal = resolveOrderDiscountTotal({
    totalDiscounts: order.totalDiscounts?.toString() ?? null,
    linePricing,
    discountCouponCode: discountCouponCode ?? null,
  });
  const subtotalOriginal = sumOriginalTotals(linePricing);
  const subtotalSale =
    order.subtotalPrice?.toString() ??
    linePricing.reduce((acc, row) => acc + parseFloat(row.saleTotal), 0).toFixed(2);

  const invoiceRefs = formatInvoiceOrderReference({
    id: order.id,
    name: order.name,
    orderNumber: order.orderNumber,
    shopifyOrderId: order.shopifyOrderId,
    erpnextInvoiceId: order.erpnextInvoiceId,
    sourceName: order.sourceName,
  });
  const invoiceNumber = invoiceRefs.primary;
  const invoiceDate = formatAppIsoDate(order.createdAt);
  const printedOn = formatAppDateTime(printedAt, "");
  const companyName = company?.name ?? loc.name ?? "";
  const companyAddress = loc.address ?? company?.address ?? "";
  const currency = order.currency ?? "LKR";
  const printedDate = formatAppIsoDate(printedAt);
  const totalQuantity =
    order.lineItems.reduce((sum, item) => sum + item.quantity, 0) +
    order.sampleFreeIssues.reduce((sum, item) => sum + item.quantity, 0);
  const shippingTotal = Number(order.totalShipping ?? 0);
  const grandTotal = Number(order.totalPrice ?? 0);
  const productTotal = Math.max(0, grandTotal - shippingTotal);
  const brandLogoUrl = company?.logoUrl ?? null;
  const locationLogoUrl = loc.logoUrl ?? null;
  const locationDisplayName = loc.invoiceHeader ?? loc.name ?? "";
  const paymentInfo = getPaymentMethodInfo({
    paymentGatewayPrimary,
    paymentGatewayNames,
    financialStatus: order.financialStatus,
  });

  const [printFormat, files] = await Promise.all([
    Promise.resolve(loc.defaultOrderPrintFormat),
    prisma.file.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      select: { id: true, fileName: true, fileSize: true, mimeType: true, createdAt: true },
    }),
  ]);

  if (!printFormat?.isEnabled) {
    return {
      ok: false,
      status: 409,
      message: "No enabled default order print format is configured for this order location.",
    };
  }

  const renderedLineItems = order.lineItems.map((li, index) => {
    const pricing = linePricing[index];
    const regularPrice = pricing?.originalPrice ?? pricing?.salePrice ?? li.price.toString();
    const linePrice = pricing?.salePrice ?? li.price.toString();
    const lineTotal = pricing?.saleTotal ?? (Number(li.price) * li.quantity).toFixed(2);
    const lineDiscount = pricing?.lineDiscount ?? null;
    const productName = [li.productItem.productTitle, li.productItem.variantTitle].filter(Boolean).join(" - ");
    const barcode = formatPickListBarcode(
      resolvePickListBarcode(li.productItem.barcode, li.productItem.sku, barcodeBySku),
    );

    return {
      index: index + 1,
      sku: li.productItem.sku ?? "-",
      barcode: barcode ?? "",
      description: productName,
      productTitle: li.productItem.productTitle,
      variantTitle: li.productItem.variantTitle ?? "",
      quantity: li.quantity,
      regularPrice,
      unitPrice: linePrice,
      discount: lineDiscount ?? "0.00",
      lineTotal,
      regularPriceFormatted: formatInvoiceMoney(regularPrice),
      unitPriceFormatted: formatInvoiceMoney(linePrice),
      discountFormatted: lineDiscount ? formatInvoiceMoney(lineDiscount) : formatInvoiceMoney(0),
      lineTotalFormatted: formatInvoiceMoney(lineTotal),
      originalPrice: pricing?.originalPrice ?? null,
      originalTotal: pricing?.originalTotal ?? null,
      lineDiscount: pricing?.lineDiscount ?? null,
      originalPriceFormatted: pricing?.originalPrice ? formatInvoiceMoney(pricing.originalPrice) : "",
      originalTotalFormatted: pricing?.originalTotal ? formatInvoiceMoney(pricing.originalTotal) : "",
      lineDiscountFormatted: pricing?.lineDiscount ? formatInvoiceMoney(pricing.lineDiscount) : "",
    };
  });

  const renderedSampleFreeIssues = order.sampleFreeIssues.map((sample, index) => ({
    index: renderedLineItems.length + index + 1,
    name: sample.sampleFreeIssueItem.name,
    type: sample.sampleFreeIssueItem.type,
    quantity: sample.quantity,
  }));

  const orderData = buildOrderDataForPrint(order);
  orderData.billingAddress = withAddressPhone(orderData.billingAddress, billingPhone);
  orderData.shippingAddress = withAddressPhone(orderData.shippingAddress, shippingPhone);

  const context = {
    company: {
      name: companyName,
      address: companyAddress,
      logoUrl: brandLogoUrl ?? "",
    },
    location: {
      name: loc.name,
      displayName: locationDisplayName,
      address: loc.address ?? "",
      logoUrl: locationLogoUrl ?? "",
      invoiceHeader: loc.invoiceHeader ?? "",
      invoiceSubHeader: loc.invoiceSubHeader ?? "",
      invoiceFooter: loc.invoiceFooter ?? "",
      invoicePhone: loc.invoicePhone ?? "+94777555304",
      invoiceEmail: loc.invoiceEmail ?? "",
      isMainCompany: loc.isMainCompany,
    },
    order: {
      id: order.id,
      invoiceNumber,
      invoiceDate,
      printedOn,
      financialStatus: order.financialStatus ?? "",
      paymentMethod: paymentInfo.label,
      paymentDescription: paymentInfo.label.toUpperCase(),
      currency,
      couponCode: discountCouponCode ?? "",
      merchantCouponCode: merchantCouponCode ?? "",
      pickupDeliveryLabel: pickupDeliveryLabel ?? "",
      sourceName: order.sourceName,
      erpnextInvoiceId: order.erpnextInvoiceId ?? "",
    },
    orderData,
    customer: {
      name: customerName || "-",
      email: order.customerEmail ?? "",
      phone: invoicePhones.resolvedPhone || order.customerPhone || "",
      phones: customerPhoneDisplay,
      billingName,
      billingPhone,
      shippingName,
      shippingPhone,
      billingAddress: billingAddr,
      shippingAddress: shippingAddr,
      shippingCity,
    },
    totals: {
      totalQuantity,
      productTotal,
      shippingTotal,
      grandTotal,
      productTotalFormatted: formatInvoiceMoney(productTotal),
      shippingTotalFormatted: formatInvoiceMoney(shippingTotal),
      grandTotalFormatted: formatInvoiceMoney(grandTotal),
      subtotalOriginal: subtotalOriginal ?? "",
      subtotalSale,
      discountTotal: discountTotal ?? "",
      subtotalOriginalFormatted: subtotalOriginal ? formatInvoiceMoney(subtotalOriginal) : "",
      subtotalSaleFormatted: formatInvoiceMoney(subtotalSale),
      discountTotalFormatted: discountTotal ? formatInvoiceMoney(discountTotal) : "",
    },
    remarks: {
      external: externalRemarks,
      internal: internalRemarks,
      externalText: externalRemarks.join("; "),
      internalText: internalRemarks.join("; "),
      specialRemarks: erpSpecialRemarks ?? "",
      specialText: erpSpecialRemarks ?? "",
    },
    print: {
      isCopy: showWatermark,
      autoPrint,
      printedDate,
      printedOn,
      formatName: printFormat.name,
    },
    lineItems: renderedLineItems,
    sampleFreeIssues: renderedSampleFreeIssues,
    files: files.map((file) => ({
      id: file.id,
      fileName: file.fileName,
      fileSize: file.fileSize ?? "",
      mimeType: file.mimeType ?? "",
      url: `/api/admin/settings/files/${file.id}`,
      createdAt: file.createdAt.toISOString(),
    })),
  };

  const html = renderPrintFormatHtml(printFormat.html, context);

  return { ok: true, html };
}
