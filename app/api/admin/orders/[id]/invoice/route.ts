import { NextRequest, NextResponse } from "next/server";

import { findMatchingContacts } from "@/lib/contact-identifiers";
import { resolveErpApiCreds } from "@/lib/erpnext-customer-display-name";
import { getOrderPaymentGatewayColumnState } from "@/lib/order-payment-gateway-compat";
import { getMerchantCouponCode } from "@/lib/order-merchant-coupon";
import { eligibleMerchantUserWhere } from "@/lib/merchant-eligibility";
import { buildPhoneLookupVariants } from "@/lib/phone-lookup";
import { formatPickListBarcode, resolvePickListBarcode } from "@/lib/product-item-barcode";
import { loadBarcodeLookupBySku } from "@/lib/product-item-barcode.server";
import { formatInvoiceOrderReference } from "@/lib/fulfillment-order-reference";
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
  return typeof a.city === "string" ? a.city.trim() : "";
}

function isMeaningfulInvoiceValue(value: string | null | undefined): boolean {
  const trimmed = value?.trim();
  return Boolean(trimmed && trimmed !== "—" && trimmed.toLowerCase() !== "none");
}

function unwrapOrderRawPayload(rawPayload: unknown): Record<string, unknown> | null {
  if (!rawPayload || typeof rawPayload !== "object") return null;
  const top = rawPayload as Record<string, unknown>;
  if (top.data != null && typeof top.data === "object" && !Array.isArray(top.data)) {
    return top.data as Record<string, unknown>;
  }
  return top;
}

function extractPayloadText(rawPayload: unknown, keys: string[]): string {
  const payload = unwrapOrderRawPayload(rawPayload);
  if (!payload) return "";
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && isMeaningfulInvoiceValue(value)) {
      return value.trim();
    }
  }
  return "";
}

function joinRemarkContents(
  remarks: Array<{ type: string; content: string; showOnInvoice: boolean }>,
  type: "external" | "internal",
  preferOnInvoice: boolean,
): string {
  const filtered = remarks.filter((r) => r.type === type);
  const onInvoice = filtered.filter((r) => r.showOnInvoice).map((r) => r.content.trim()).filter(Boolean);
  if (preferOnInvoice && onInvoice.length > 0) return onInvoice.join("; ");
  const all = filtered.map((r) => r.content.trim()).filter(Boolean);
  return all.join("; ");
}

function invoiceDetailLine(label: string, value: string | null | undefined, escape: (s: string) => string): string {
  const display = isMeaningfulInvoiceValue(value) ? value!.trim() : "—";
  return `<p><strong>${label}:</strong> ${escape(display)}</p>`;
}

function normalizeCompareText(value: string | null | undefined): string {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
}

function formatUserDisplayName(user: {
  name?: string | null;
  knownName?: string | null;
  email?: string | null;
} | null | undefined): string {
  if (!user) return "";
  return user.knownName?.trim() || user.name?.trim() || user.email?.trim() || "";
}

async function resolveMerchantByCoupon(companyId: string, couponCode: string) {
  const couponLower = couponCode.toLowerCase().trim();
  if (!couponLower) return null;
  const merchants = await prisma.user.findMany({
    where: eligibleMerchantUserWhere(companyId),
    select: { name: true, knownName: true, email: true, couponCodes: true },
  });
  return (
    merchants.find((merchant) =>
      merchant.couponCodes.some((code) => code.toLowerCase().trim() === couponLower),
    ) ?? null
  );
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
        company: { select: { name: true, address: true } },
        companyLocation: { include: { erpnextInstance: true } },
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

  const paymentGatewayPrimary = gatewayColumns.hasPaymentGatewayPrimary
    ? ((order as unknown as Record<string, unknown>)?.paymentGatewayPrimary as string | null ?? null)
    : null;

  if (!order) {
    return new NextResponse("Order not found", { status: 404 });
  }

  const erpConfig = resolveErpApiCreds(order.companyLocation.erpnextInstance);
  const lineItemSkus = order.lineItems
    .map((li) => li.productItem.sku)
    .filter((sku): sku is string => Boolean(sku?.trim()));
  const barcodeBySku = await loadBarcodeLookupBySku(companyId, lineItemSkus, {
    erpConfig,
  });

  const showWatermark = order.printCount > 0;
  const printedAt = new Date();
  if (shouldIncrementPrint) {
    const userId = auth.context!.user!.id;
    const advanceToDispatch = order.fulfillmentStage === "print";
    await prisma.order.update({
      where: { id: order.id },
      data: {
        printCount: { increment: 1 },
        lastPrintedAt: printedAt,
        lastPrintedById: userId,
        ...(advanceToDispatch ? { fulfillmentStage: "ready_to_dispatch" } : {}),
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
  const billingAddrRaw = formatAddress(order.billingAddress);
  const shippingAddr = formatAddress(order.shippingAddress);
  const billingAddr = billingAddrRaw || shippingAddr;
  const shippingCity = getCity(order.shippingAddress);
  const customerPhones = await getInvoiceCustomerPhones({
    companyId,
    email: order.customerEmail,
    phoneNumber: order.customerPhone,
  });
  const customerPhoneDisplay = customerPhones.join(", ");

  const merchantCouponCode = getMerchantCouponCode({
    sourceName: order.sourceName,
    discountCodes: order.discountCodes,
    rawPayload: order.rawPayload,
    assignedMerchantCouponCodes: order.assignedMerchant?.couponCodes,
  });

  let merchantName = formatUserDisplayName(order.assignedMerchant);

  if (!merchantName && merchantCouponCode) {
    const merchantFromCoupon = await resolveMerchantByCoupon(companyId, merchantCouponCode);
    merchantName = formatUserDisplayName(merchantFromCoupon);
  }

  if (!merchantName) {
    const erpOwner = extractPayloadText(order.rawPayload, ["owner"]);
    if (erpOwner) {
      const erpUser = await prisma.user.findUnique({
        where: { erpnextUsername: erpOwner },
        select: { name: true, knownName: true, email: true },
      });
      merchantName = formatUserDisplayName(erpUser) || erpOwner;
    }
  }

  if (!merchantName && loc.defaultMerchantUserId) {
    const defaultMerchant = await prisma.user.findUnique({
      where: { id: loc.defaultMerchantUserId },
      select: { name: true, knownName: true, email: true },
    });
    merchantName = formatUserDisplayName(defaultMerchant);
  }

  const customerNotes =
    joinRemarkContents(order.remarks, "external", true) ||
    extractPayloadText(order.rawPayload, ["note", "customer_note", "customer_notes", "remarks"]);
  const callCenterNotes = joinRemarkContents(order.remarks, "internal", true);

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
  const showCompanyName =
    isMeaningfulInvoiceValue(companyName) &&
    normalizeCompareText(companyName) !== normalizeCompareText(loc.invoiceHeader);
  const paymentMethod = getPaymentMethod(order.financialStatus, paymentGatewayPrimary);
  const paymentDescription = getPaymentDescription(order.financialStatus, paymentGatewayPrimary);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${escapeHtml(invoiceNumber)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      font-size: 11px;
      line-height: 1.5;
      color: #1a1a1a;
      max-width: 820px;
      margin: 0 auto;
      padding: 28px;
      background: #fff;
    }
    .copy-banner {
      text-align: center;
      padding: 7px 20px;
      background: #fffbeb;
      border: 1.5px solid #f59e0b;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.25em;
      color: #92400e;
      margin-bottom: 20px;
    }
    @media print {
      .copy-banner { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    .top-accent {
      height: 4px;
      background: linear-gradient(90deg, #1e3a5f 0%, #2d5a87 100%);
      margin: -28px -28px 24px -28px;
      border-radius: 0;
    }
    .invoice-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 28px;
      flex-wrap: wrap;
      gap: 20px;
    }
    .invoice-meta {
      padding: 16px 20px;
      background: #f8fafc;
      border-left: 4px solid #1e3a5f;
      border-radius: 0 6px 6px 0;
    }
    .invoice-meta .inv-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
      margin-bottom: 4px;
    }
    .invoice-meta .inv-number {
      font-size: 20px;
      font-weight: 700;
      color: #1e3a5f;
      margin-bottom: 8px;
    }
    .invoice-meta p {
      font-size: 11px;
      color: #475569;
      margin: 2px 0;
    }
    .company-info {
      text-align: right;
      max-width: 280px;
    }
    .company-info .company-logo {
      max-height: 64px;
      max-width: 180px;
      width: auto;
      height: auto;
      object-fit: contain;
      margin-bottom: 12px;
      display: block;
      margin-left: auto;
    }
    .company-info .brand {
      font-size: 18px;
      font-weight: 700;
      color: #1e3a5f;
      margin: 0 0 2px 0;
      letter-spacing: -0.02em;
    }
    .company-info .tagline {
      font-size: 11px;
      color: #64748b;
      margin: 0 0 12px 0;
      font-weight: 500;
    }
    .company-info p {
      font-size: 11px;
      color: #475569;
      margin: 2px 0;
      line-height: 1.5;
    }
    .addresses {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 28px;
      margin-bottom: 24px;
      padding: 20px;
      background: #fafbfc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
    }
    @media (max-width: 600px) { .addresses { grid-template-columns: 1fr; } }
    .address-block h3 {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #64748b;
      margin-bottom: 10px;
      padding-bottom: 6px;
      border-bottom: 1px solid #e2e8f0;
    }
    .address-block p {
      font-size: 11px;
      color: #334155;
      margin: 4px 0;
      line-height: 1.5;
    }
    .table-wrap {
      overflow-x: auto;
      margin-bottom: 20px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
    }
    th, td {
      padding: 10px 14px;
      text-align: left;
      border-bottom: 1px solid #e2e8f0;
    }
    thead th {
      background: #1e3a5f;
      color: #fff;
      font-weight: 600;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border: none;
    }
    thead th:first-child { border-radius: 8px 0 0 0; }
    thead th:last-child { border-radius: 0 8px 0 0; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    tbody tr:hover { background: #f1f5f9; }
    tbody tr:last-child td { border-bottom: none; }
    .text-right { text-align: right; }
    .grand-total-container { text-align: right; margin-top: 16px; margin-bottom: 8px; }
    .grand-total-wrap {
      display: inline-block;
      text-align: right;
      padding: 16px 28px;
      background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%);
      color: #fff;
      border-radius: 8px;
    }
    .grand-total-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      opacity: 0.9;
      margin-bottom: 4px;
    }
    .grand-total-amount {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .payment-section {
      margin-top: 24px;
      padding: 20px 24px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px 32px;
    }
    @media (max-width: 600px) { .payment-section { grid-template-columns: 1fr; } }
    .payment-section p {
      margin: 0;
      font-size: 11px;
      color: #334155;
    }
    .payment-section strong {
      display: inline-block;
      min-width: 130px;
      color: #64748b;
      font-weight: 600;
    }
    .footer-section {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 2px solid #e2e8f0;
      text-align: center;
    }
    .footer-section .brand {
      font-size: 13px;
      font-weight: 700;
      color: #1e3a5f;
      margin-bottom: 8px;
    }
    .footer-section .contact {
      font-size: 10px;
      color: #64748b;
      margin-bottom: 12px;
    }
    .footer-section .policy {
      font-size: 10px;
      color: #64748b;
      line-height: 1.6;
      max-width: 640px;
      margin: 0 auto;
    }
    .invoice-policy-notes {
      margin-top: 28px;
      padding-top: 16px;
      border-top: 1px solid #e2e8f0;
      font-size: 10px;
      color: #1a1a1a;
      line-height: 1.7;
    }
    .invoice-policy-notes p {
      margin: 6px 0;
    }
    .invoice-policy-notes .return-policy {
      text-align: center;
      font-weight: 700;
    }
    @media print {
      body { padding: 16px; }
      .top-accent { margin: -16px -16px 20px -16px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .invoice-meta { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      thead th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .grand-total-wrap { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      tbody tr:nth-child(even) { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      tbody tr:hover { background: none !important; }
    }
  </style>
</head>
<body>
  <div class="content">
    <div class="top-accent"></div>
    ${showWatermark ? '<div class="copy-banner">COPY</div>' : ""}
    <div class="invoice-header">
      <div class="invoice-meta">
        <div class="inv-label">Invoice</div>
        <div class="inv-number">${escapeHtml(invoiceNumber)}</div>
        ${merchantName ? `<p><strong>Merchant:</strong> ${escapeHtml(merchantName)}</p>` : ""}
        <p><strong>Invoice Date:</strong> ${invoiceDate}</p>
        <p><strong>Printed On:</strong> ${printedOn}</p>
      </div>
      <div class="company-info">
        ${loc.logoUrl ? `<img src="${escapeHtml(loc.logoUrl)}" alt="Logo" class="company-logo" />` : ""}
        ${loc.invoiceHeader ? `<div class="brand">${escapeHtml(loc.invoiceHeader)}</div>` : ""}
        ${loc.invoiceSubHeader ? `<div class="tagline">${escapeHtml(loc.invoiceSubHeader)}</div>` : ""}
        ${showCompanyName ? `<p>${escapeHtml(companyName)}</p>` : ""}
        ${companyAddress ? `<p>${escapeHtml(companyAddress)}</p>` : ""}
        ${loc.invoiceEmail ? `<p>${escapeHtml(loc.invoiceEmail)}</p>` : ""}
        ${loc.invoicePhone ? `<p>Tel ${escapeHtml(loc.invoicePhone)}</p>` : ""}
      </div>
    </div>

    <div class="addresses">
      <div class="address-block">
        <h3>Bill To</h3>
        <p><strong>Customer Name:</strong> ${escapeHtml(customerName || "—")}</p>
        <p><strong>Contact Number:</strong> ${escapeHtml(customerPhoneDisplay || "—")}</p>
        <p><strong>Address:</strong> ${escapeHtml(billingAddr || "—")}</p>
      </div>
      <div class="address-block">
        <h3>Shipping To</h3>
        <p><strong>Customer Name:</strong> ${escapeHtml(customerName || "—")}</p>
        <p><strong>Address:</strong> ${escapeHtml(shippingAddr || "—")}</p>
        <p><strong>City:</strong> ${escapeHtml(shippingCity || "—")}</p>
      </div>
    </div>

    <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>CODE</th>
          <th>BARCODE</th>
          <th>PRODUCT</th>
          <th class="text-right">QTY</th>
          <th class="text-right">REGULAR PRICE</th>
          <th class="text-right">SALES PRICE</th>
          <th class="text-right">DISC %</th>
          <th class="text-right">TOTAL</th>
        </tr>
      </thead>
      <tbody>
        ${order.lineItems
          .map(
            (li) => {
              const regPrice = li.productItem.compareAtPrice ?? li.productItem.price;
              const discPct =
                li.discountPercent != null && Number(li.discountPercent) !== 0
                  ? String(li.discountPercent)
                  : "—";
              const productName = [li.productItem.productTitle, li.productItem.variantTitle].filter(Boolean).join(" - ");
              const barcode = formatPickListBarcode(
                resolvePickListBarcode(li.productItem.barcode, li.productItem.sku, barcodeBySku),
              );
              return `
        <tr>
          <td>${escapeHtml(li.productItem.sku ?? "—")}</td>
          <td>${escapeHtml(barcode)}</td>
          <td>${escapeHtml(productName)}</td>
          <td class="text-right">${li.quantity}</td>
          <td class="text-right">${formatPrice(regPrice.toString(), order.currency)}</td>
          <td class="text-right">${formatPrice(li.price.toString(), order.currency)}</td>
          <td class="text-right">${escapeHtml(discPct)}</td>
          <td class="text-right">${formatPrice(Number(li.price) * li.quantity, order.currency)}</td>
        </tr>`;
            }
          )
          .join("")}
        ${order.sampleFreeIssues
          .map(
            (s) => `
        <tr>
          <td>—</td>
          <td>—</td>
          <td>${escapeHtml(s.sampleFreeIssueItem.name)} <em>(${s.sampleFreeIssueItem.type})</em></td>
          <td class="text-right">${s.quantity}</td>
          <td class="text-right">—</td>
          <td class="text-right">—</td>
          <td class="text-right">—</td>
          <td class="text-right">—</td>
        </tr>`
          )
          .join("")}
        ${order.totalDiscounts && Number(order.totalDiscounts) !== 0
          ? `
        <tr>
          <td colspan="2">—</td>
          <td>Discount${merchantCouponCode ? ` (${escapeHtml(merchantCouponCode)})` : ""}</td>
          <td class="text-right">—</td>
          <td class="text-right">—</td>
          <td class="text-right">—</td>
          <td class="text-right">—</td>
          <td class="text-right">-${formatPrice(order.totalDiscounts.toString(), order.currency)}</td>
        </tr>`
          : ""}
        ${order.totalShipping && Number(order.totalShipping) !== 0
          ? `
        <tr>
          <td colspan="2">—</td>
          <td>Shipping + Bag Fee</td>
          <td class="text-right">—</td>
          <td class="text-right">—</td>
          <td class="text-right">—</td>
          <td class="text-right">—</td>
          <td class="text-right">${formatPrice(order.totalShipping.toString(), order.currency)}</td>
        </tr>`
          : ""}
      </tbody>
    </table>
    </div>

    <div class="grand-total-container">
    <div class="grand-total-wrap">
      <div class="grand-total-label">Total (${currency})</div>
      <div class="grand-total-amount">${formatPrice(order.totalPrice.toString(), null)}</div>
    </div>
    </div>

    <div class="payment-section">
      ${invoiceDetailLine("Payment Method", paymentMethod, escapeHtml)}
      ${invoiceDetailLine("Coupon Code", merchantCouponCode, escapeHtml)}
      ${invoiceDetailLine("Merchant", merchantName, escapeHtml)}
      ${invoiceDetailLine("Customer Notes", customerNotes, escapeHtml)}
      ${invoiceDetailLine("Call Center Notes", callCenterNotes, escapeHtml)}
      ${invoiceDetailLine("Original Del Date", invoiceDate, escapeHtml)}
      ${invoiceDetailLine("Payment Description", paymentDescription, escapeHtml)}
    </div>

    <div class="invoice-policy-notes">
      <p>• NOTE- Please check and confirm product(s) with the invoice at the time of receiving and in case of an exchange should be within 3 days of the delivery, complains receiving afterward will not be accepted</p>
      <p class="return-policy">• Return Policy is applied. For more info please visit : https://cosmetics.lk/pages/return-policy</p>
    </div>

    ${loc.invoiceFooter ? `
    <div class="footer-section">
      ${(loc.invoicePhone || loc.invoiceEmail) ? `<div class="contact">${[loc.invoicePhone ? `Tel ${escapeHtml(loc.invoicePhone)}` : "", loc.invoiceEmail ? escapeHtml(loc.invoiceEmail) : ""].filter(Boolean).join(" · ")}</div>` : ""}
      <div class="policy">${escapeHtml(loc.invoiceFooter)}</div>
    </div>` : ""}
  </div>
  <script>
    if (${JSON.stringify(!!printParam)}) {
      window.onload = function() { window.print(); };
    }
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
