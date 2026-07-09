import { NextRequest, NextResponse } from "next/server";

import { findMatchingContacts } from "@/lib/contact-identifiers";
import { resolveErpApiCreds } from "@/lib/erpnext-customer-display-name";
import { formatInvoiceOrderReference } from "@/lib/fulfillment-order-reference";
import { getFinancePaymentApprovalBlockReason } from "@/lib/approval-workflow";
import { getOrderPaymentGatewayColumnState } from "@/lib/order-payment-gateway-compat";
import { resolveOrderDiscountCouponForOrder, resolveOrderMerchantCouponForOrder } from "@/lib/order-discount-coupon";
import { resolveOrderShippingDisplayForOrder } from "@/lib/order-shipping-display";
import { buildPhoneLookupVariants } from "@/lib/phone-lookup";
import { formatPickListBarcode, resolvePickListBarcode } from "@/lib/product-item-barcode";
import { loadBarcodeLookupBySku } from "@/lib/product-item-barcode.server";
import { renderPrintFormatHtml } from "@/lib/print-format-renderer";
import { orderStageUpdate } from "@/lib/order-stage-timing";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

async function getCompanyId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  return user?.companyId ?? null;
}

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

function formatPrice(val: string | number, currency?: string | null): string {
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (Number.isNaN(n)) return String(val);
  const formatted = n.toLocaleString("en-LK", { minimumFractionDigits: 2 });
  return currency ? `${formatted} ${currency}` : formatted;
}

function getPaymentMethod(financialStatus: string | null, paymentGatewayPrimary?: string | null): string {
  const gateway = paymentGatewayPrimary?.trim().toLowerCase() ?? "";
  if (gateway.includes("bank")) return "Bank Transfer";
  if (!financialStatus) return "—";
  const s = financialStatus.toLowerCase();
  if (s.includes("pending") || s.includes("cod")) return "Cash on Delivery (COD)";
  if (s.includes("paid")) return "Paid";
  if (s.includes("refund")) return "Refunded";
  return financialStatus;
}

function getPaymentDescription(financialStatus: string | null, paymentGatewayPrimary?: string | null): string {
  const gateway = paymentGatewayPrimary?.trim().toLowerCase() ?? "";
  if (gateway.includes("bank")) return "BANK TRANSFER";
  if (!financialStatus) return "—";
  const s = financialStatus.toLowerCase();
  if (s.includes("pending") || s.includes("cod")) return "CASH PAYMENT ON DELIVERY";
  if (s.includes("paid")) return "PAID";
  return financialStatus.toUpperCase();
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const printParam = request.nextUrl.searchParams.get("print");
  const shouldIncrementPrint = printParam === "1" || printParam === "true";
  const auth = await requireAnyPermission(
    shouldIncrementPrint
      ? ["fulfillment.order_print.print"]
      : ["fulfillment.order_print.read"]
  );
  if (!auth.ok) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const companyId = await getCompanyId(auth.context!.user!.id);
  if (!companyId) {
    return new NextResponse("No company", { status: 404 });
  }

  const { id } = await params;
  const idResult = cuidSchema.safeParse(id);
  if (!idResult.success) {
    return new NextResponse("Invalid ID", { status: 400 });
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
    return new NextResponse("Order not found", { status: 404 });
  }

  const paymentGatewayPrimary = gatewayColumns.hasPaymentGatewayPrimary
    ? ((order as unknown as Record<string, unknown>)?.paymentGatewayPrimary as string | null ?? null)
    : null;
  const paymentGatewayNames = gatewayColumns.hasPaymentGatewayNames
    ? (((order as unknown as Record<string, unknown>)?.paymentGatewayNames as string[] | null) ?? [])
    : [];

  const erpConfig = resolveErpApiCreds(order.companyLocation.erpnextInstance);
  const lineItemSkus = order.lineItems
    .map((li) => li.productItem.sku)
    .filter((sku): sku is string => Boolean(sku?.trim()));
  const barcodeBySku = await loadBarcodeLookupBySku(companyId, lineItemSkus, { erpConfig });

  const showWatermark = order.printCount > 0;
  const printedAt = new Date();
  if (shouldIncrementPrint) {
    const financeBlock = await getFinancePaymentApprovalBlockReason({
      id: order.id,
      paymentGatewayPrimary,
      paymentGatewayNames,
      erpnextInvoiceId: order.erpnextInvoiceId,
    });
    if (financeBlock) {
      return new NextResponse(financeBlock, { status: 409 });
    }

    const userId = auth.context!.user!.id;
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
    phoneNumber: order.customerPhone,
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

  function escapeHtml(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  const invoiceRefs = formatInvoiceOrderReference({
    id: order.id,
    name: order.name,
    orderNumber: order.orderNumber,
    shopifyOrderId: order.shopifyOrderId,
    erpnextInvoiceId: order.erpnextInvoiceId,
    sourceName: order.sourceName,
  });
  const invoiceNumber = invoiceRefs.primary;
  const invoiceDate = new Date(order.createdAt).toISOString().slice(0, 10);
  const printedOn = printedAt.toLocaleString("en-LK", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const companyName = company?.name ?? loc.name ?? "";
  const companyAddress = loc.address ?? company?.address ?? "";
  const currency = order.currency ?? "LKR";
  const printedDate = printedAt.toISOString().slice(0, 10);
  const totalQuantity =
    order.lineItems.reduce((sum, item) => sum + item.quantity, 0) +
    order.sampleFreeIssues.reduce((sum, item) => sum + item.quantity, 0);
  const shippingTotal = Number(order.totalShipping ?? 0);
  const grandTotal = Number(order.totalPrice ?? 0);
  const productTotal = Math.max(0, grandTotal - shippingTotal);
  const brandLogoUrl = company?.logoUrl ?? null;
  const locationLogoUrl = loc.logoUrl ?? null;
  const locationDisplayName = loc.invoiceHeader ?? loc.name ?? "";

  function formatInvoiceMoney(val: string | number): string {
    const n = typeof val === "string" ? parseFloat(val) : val;
    if (Number.isNaN(n)) return String(val);
    return `Rs ${n.toLocaleString("en-LK", { minimumFractionDigits: 2 })}`;
  }

  const [printFormat, files] = await Promise.all([
    Promise.resolve(loc.defaultOrderPrintFormat),
    prisma.file.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      select: { id: true, fileName: true, fileSize: true, mimeType: true, createdAt: true },
    }),
  ]);

  if (!printFormat?.isEnabled) {
    return new NextResponse(
      "No enabled default order print format is configured for this order location.",
      { status: 409 },
    );
  }

  const renderedLineItems = order.lineItems.map((li, index) => {
    const regularPrice = Number(li.productItem.compareAtPrice ?? li.productItem.price);
    const linePrice = Number(li.price);
    const lineTotal = linePrice * li.quantity;
    const lineDiscount =
      li.discountPercent != null && Number(li.discountPercent) !== 0
        ? (regularPrice * li.quantity * Number(li.discountPercent)) / 100
        : Math.max(0, (regularPrice - linePrice) * li.quantity);
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
      discount: lineDiscount,
      lineTotal,
      regularPriceFormatted: formatInvoiceMoney(regularPrice),
      unitPriceFormatted: formatInvoiceMoney(linePrice),
      discountFormatted: formatInvoiceMoney(lineDiscount),
      lineTotalFormatted: formatInvoiceMoney(lineTotal),
    };
  });

  const renderedSampleFreeIssues = order.sampleFreeIssues.map((sample, index) => ({
    index: renderedLineItems.length + index + 1,
    name: sample.sampleFreeIssueItem.name,
    type: sample.sampleFreeIssueItem.type,
    quantity: sample.quantity,
  }));

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
      paymentMethod: getPaymentMethod(order.financialStatus, paymentGatewayPrimary),
      paymentDescription: getPaymentDescription(order.financialStatus, paymentGatewayPrimary),
      currency,
      couponCode: discountCouponCode ?? "",
      merchantCouponCode: merchantCouponCode ?? "",
      pickupDeliveryLabel: pickupDeliveryLabel ?? "",
      sourceName: order.sourceName,
      erpnextInvoiceId: order.erpnextInvoiceId ?? "",
    },
    customer: {
      name: customerName || "-",
      email: order.customerEmail ?? "",
      phone: order.customerPhone ?? "",
      phones: customerPhoneDisplay,
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
    },
    remarks: {
      external: externalRemarks,
      internal: internalRemarks,
      externalText: externalRemarks.join("; "),
      internalText: internalRemarks.join("; "),
    },
    print: {
      isCopy: showWatermark,
      autoPrint: Boolean(printParam),
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

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });

}
