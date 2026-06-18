import { NextRequest, NextResponse } from "next/server";

import { findMatchingContacts } from "@/lib/contact-identifiers";
import { getOrderPaymentGatewayColumnState } from "@/lib/order-payment-gateway-compat";
import { getMerchantCouponCode } from "@/lib/order-merchant-coupon";
import { buildPhoneLookupVariants } from "@/lib/phone-lookup";
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
        companyLocation: true,
        assignedMerchant: { select: { name: true } },
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
  const billingAddr = formatAddress(order.billingAddress);
  const shippingAddr = formatAddress(order.shippingAddress);
  const shippingCity = getCity(order.shippingAddress);
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

  const merchantCouponCode = getMerchantCouponCode({
    sourceName: order.sourceName,
    discountCodes: order.discountCodes,
    rawPayload: order.rawPayload,
  });

  function escapeHtml(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  const invoiceNumber = order.name ?? order.orderNumber ?? order.shopifyOrderId ?? "";
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

  function renderBrandMark(input: { logoUrl: string | null; label: string; showLabel?: boolean }) {
    const label = escapeHtml(input.label || "");
    const fallbackClass = input.showLabel ? "brand-fallback visible" : "brand-fallback";
    const fallback = label ? `<span class="${fallbackClass}">${label}</span>` : "";
    if (!input.logoUrl) return fallback;
    return `
      ${fallback}
      <img
        src="${escapeHtml(input.logoUrl)}"
        alt="${label}"
        class="brand-logo"
        referrerpolicy="no-referrer"
        onerror="this.style.display='none';var fallback=this.previousElementSibling;if(fallback){fallback.style.display='block';}"
      />`;
  }

  let html = `<!DOCTYPE html>
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
    <div class="invoice-header">
      <div class="invoice-meta">
        <div class="inv-label">Invoice</div>
        <div class="inv-number">${escapeHtml(invoiceNumber)}</div>
        <p><strong>Invoice Date:</strong> ${invoiceDate}</p>
        <p><strong>Printed On:</strong> ${printedOn}</p>
      </div>
      <div class="company-info">
        ${loc.logoUrl ? `<img src="${escapeHtml(loc.logoUrl)}" alt="Logo" class="company-logo" />` : ""}
        ${loc.invoiceHeader ? `<div class="brand">${escapeHtml(loc.invoiceHeader)}</div>` : ""}
        ${loc.invoiceSubHeader ? `<div class="tagline">${escapeHtml(loc.invoiceSubHeader)}</div>` : ""}
        ${companyName ? `<p>${escapeHtml(companyName)}</p>` : ""}
        ${companyAddress ? `<p>${escapeHtml(companyAddress)}</p>` : ""}
        ${loc.invoiceEmail ? `<p>${escapeHtml(loc.invoiceEmail)}</p>` : ""}
        ${loc.invoicePhone ? `<p>Tel ${escapeHtml(loc.invoicePhone)}</p>` : ""}
      </div>
    </div>

    <div class="addresses">
      <div class="address-block">
        <h3>Bill To</h3>
        <p><strong>Customer Name:</strong> ${escapeHtml(customerName)}</p>
        ${customerPhoneDisplay ? `<p><strong>Contact Number:</strong> ${escapeHtml(customerPhoneDisplay)}</p>` : ""}
        ${billingAddr ? `<p><strong>Address:</strong> ${escapeHtml(billingAddr)}</p>` : ""}
      </div>
      <div class="address-block">
        <h3>Shipping To</h3>
        <p><strong>Customer Name:</strong> ${escapeHtml(customerName)}</p>
        ${shippingAddr ? `<p><strong>Address:</strong> ${escapeHtml(shippingAddr)}</p>` : ""}
        ${shippingCity ? `<p><strong>City:</strong> ${escapeHtml(shippingCity)}</p>` : ""}
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
              return `
        <tr>
          <td>${escapeHtml(li.productItem.sku ?? "—")}</td>
          <td>${escapeHtml(li.productItem.barcode ?? "—")}</td>
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
      <p><strong>Payment Method:</strong> ${escapeHtml(getPaymentMethod(order.financialStatus, paymentGatewayPrimary))}</p>
      ${merchantCouponCode ? `<p><strong>Coupon Code:</strong> ${escapeHtml(merchantCouponCode)}</p>` : ""}
      <p><strong>Merchant:</strong> ${escapeHtml(order.assignedMerchant?.name ?? "—")}</p>
      <p><strong>Customer Notes:</strong> ${externalRemarks.length > 0 ? escapeHtml(externalRemarks.join("; ")) : "—"}</p>
      <p><strong>Call Center Notes:</strong> ${internalRemarks.length > 0 ? escapeHtml(internalRemarks.join("; ")) : "—"}</p>
      <p><strong>Original Del Date:</strong> ${invoiceDate}</p>
      <p><strong>Payment Description:</strong> ${escapeHtml(getPaymentDescription(order.financialStatus, paymentGatewayPrimary))}</p>
    </div>

    <div class="invoice-policy-notes">
      <p>• NOTE- Please check and confirm product(s) with the invoice at the time of receiving and in case of an exchange should be within 3 days of the delivery, complains receiving afterward will not be accepted</p>
      <p class="return-policy">• Return Policy is applied. For more info please visit : https://cosmetics.lk/pages/return-policy</p>
    </div>

    ${loc.invoiceFooter || loc.invoiceHeader ? `
    <div class="footer-section">
      ${loc.invoiceHeader ? `<div class="brand">${escapeHtml(loc.invoiceHeader)}</div>` : ""}
      ${(loc.invoicePhone || loc.invoiceEmail) ? `<div class="contact">${[loc.invoicePhone ? `Tel ${escapeHtml(loc.invoicePhone)}` : "", loc.invoiceEmail ? escapeHtml(loc.invoiceEmail) : ""].filter(Boolean).join(" · ")}</div>` : ""}
      ${loc.invoiceFooter ? `<div class="policy">${escapeHtml(loc.invoiceFooter)}</div>` : ""}
    </div>` : ""}
  </div>
  <script>
    if (${JSON.stringify(!!printParam)}) {
      window.onload = function() { window.print(); };
    }
  </script>
</body>
</html>`;

  html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${escapeHtml(invoiceNumber)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10px;
      line-height: 1.5;
      color: #000;
      max-width: 760px;
      margin: 0 auto;
      padding: 42px 48px;
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
    .invoice-brands {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 24px;
      min-height: 58px;
      padding-bottom: 12px;
      border-bottom: 1.5px solid #000;
      margin-bottom: 22px;
    }
    .brand-block {
      display: flex;
      align-items: center;
      min-width: 0;
      width: 45%;
    }
    .brand-block.right {
      justify-content: flex-end;
      text-align: right;
      margin-left: auto;
    }
    .brand-logo {
      max-height: 52px;
      max-width: 205px;
      width: auto;
      height: auto;
      object-fit: contain;
    }
    .brand-fallback {
      display: none;
      font-size: 13px;
      font-weight: 700;
      line-height: 1.2;
    }
    .brand-fallback.visible {
      display: block;
      margin-top: 4px;
    }
    h1 {
      font-size: 18px;
      line-height: 1.2;
      margin: 0 0 16px 0;
      font-weight: 800;
    }
    .invoice-details {
      display: grid;
      grid-template-columns: 104px 10px 1fr;
      gap: 4px 8px;
      margin-bottom: 34px;
      font-size: 9px;
      max-width: 310px;
    }
    .invoice-details dt { font-weight: 700; }
    .invoice-details dd { margin: 0; }
    .addresses {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 56px;
      margin-bottom: 34px;
    }
    .address-block h3 {
      font-size: 10px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .address-block p {
      font-size: 9px;
      margin: 2px 0;
      line-height: 1.45;
    }
    .table-wrap {
      margin-bottom: 28px;
      border-top: 1.5px solid #000;
      border-bottom: 1.5px solid #000;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8px;
    }
    th, td {
      padding: 10px 8px;
      text-align: left;
      vertical-align: top;
    }
    thead th {
      color: #000;
      font-weight: 800;
      font-size: 7px;
      border-bottom: 1px solid #000;
    }
    tbody td {
      padding-top: 12px;
      padding-bottom: 12px;
    }
    .sku {
      font-weight: 800;
      white-space: nowrap;
    }
    .barcode {
      display: inline-block;
      max-width: 78px;
      padding: 2px 4px;
      border: 1px solid #d8d8d8;
      border-radius: 2px;
      color: #666;
      font-size: 7px;
      overflow-wrap: anywhere;
    }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .summary {
      display: grid;
      grid-template-columns: 1fr 260px;
      gap: 28px;
      margin-bottom: 20px;
    }
    .summary-left,
    .summary-right {
      font-size: 9px;
    }
    .summary-left p,
    .summary-right p {
      margin: 0 0 12px 0;
    }
    .summary-row {
      display: grid;
      grid-template-columns: 1fr 120px;
      gap: 16px;
      align-items: baseline;
      margin-bottom: 12px;
    }
    .summary-row.line {
      padding-bottom: 8px;
      border-bottom: 1px solid #000;
    }
    .grand {
      font-size: 11px;
      font-weight: 800;
    }
    .notes-box {
      margin-top: 14px;
      width: 330px;
      min-height: 60px;
      border: 1px dashed #bdbdbd;
      padding: 9px 11px;
      font-size: 8px;
    }
    .notes-box .label {
      display: block;
      margin-bottom: 8px;
      font-size: 7px;
      font-weight: 800;
      letter-spacing: 0.08em;
    }
    .help-line {
      margin-top: 56px;
      text-align: center;
      font-size: 9px;
    }
    .help-line strong { font-weight: 800; }
    .invoice-policy-notes {
      margin-top: 10px;
      font-size: 8px;
      text-align: center;
      line-height: 1.6;
    }
    .invoice-policy-notes p { margin: 6px 0; }
    @media (max-width: 600px) {
      body { padding: 28px; }
      .addresses,
      .summary { grid-template-columns: 1fr; }
      .notes-box { width: 100%; }
    }
    @media print {
      @page { size: A4; margin: 0; }
      body { padding: 42px 48px; max-width: none; }
      .copy-banner { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="content">
    ${showWatermark ? '<div class="copy-banner">COPY</div>' : ""}
    <div class="invoice-brands">
      <div class="brand-block left">
        ${renderBrandMark({ logoUrl: locationLogoUrl, label: locationDisplayName })}
      </div>
      <div class="brand-block right">
        ${loc.isMainCompany
          ? `<span class="brand-fallback visible">${escapeHtml(locationDisplayName)}</span>`
          : renderBrandMark({ logoUrl: brandLogoUrl, label: companyName })}
      </div>
    </div>

    <h1>Sales Invoice</h1>
    <dl class="invoice-details">
      <dt>Invoice No</dt><dd>:</dd><dd>${escapeHtml(invoiceNumber)}</dd>
      <dt>Invoice Date</dt><dd>:</dd><dd>${invoiceDate}</dd>
      <dt>Printed On</dt><dd>:</dd><dd>${printedDate}</dd>
      <dt>Payment Status</dt><dd>:</dd><dd>${escapeHtml(order.financialStatus ?? "-")}</dd>
      <dt>Payment Method</dt><dd>:</dd><dd>${escapeHtml(getPaymentMethod(order.financialStatus, paymentGatewayPrimary))}</dd>
    </dl>

    <div class="addresses">
      <div class="address-block">
        <h3>Bill to</h3>
        <p><strong>${escapeHtml(customerName || "-")}</strong></p>
        ${customerPhoneDisplay ? `<p>Contact: ${escapeHtml(customerPhoneDisplay)}</p>` : ""}
        ${billingAddr ? `<p>${escapeHtml(billingAddr)}</p>` : ""}
      </div>
      <div class="address-block">
        <h3>Ship to</h3>
        <p><strong>${escapeHtml(customerName || "-")}</strong></p>
        ${customerPhoneDisplay ? `<p>Contact: ${escapeHtml(customerPhoneDisplay)}</p>` : ""}
        ${shippingAddr ? `<p>${escapeHtml(shippingAddr)}</p>` : ""}
        ${shippingCity ? `<p>${escapeHtml(shippingCity)}</p>` : ""}
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th class="text-center">SR</th>
            <th>ITEM CODE</th>
            <th>BARCODE</th>
            <th>DESCRIPTION</th>
            <th class="text-right">QTY</th>
            <th class="text-right">PRICE</th>
            <th class="text-right">DISCOUNT</th>
            <th class="text-right">NET RATE</th>
          </tr>
        </thead>
        <tbody>
          ${order.lineItems
            .map((li, index) => {
              const regularPrice = Number(li.productItem.compareAtPrice ?? li.productItem.price);
              const linePrice = Number(li.price);
              const lineTotal = linePrice * li.quantity;
              const lineDiscount =
                li.discountPercent != null && Number(li.discountPercent) !== 0
                  ? (regularPrice * li.quantity * Number(li.discountPercent)) / 100
                  : Math.max(0, (regularPrice - linePrice) * li.quantity);
              const productName = [li.productItem.productTitle, li.productItem.variantTitle].filter(Boolean).join(" - ");
              return `
          <tr>
            <td class="text-center">${index + 1}</td>
            <td class="sku">${escapeHtml(li.productItem.sku ?? "-")}</td>
            <td>${li.productItem.barcode ? `<span class="barcode">${escapeHtml(li.productItem.barcode)}</span>` : "-"}</td>
            <td>${escapeHtml(productName)}</td>
            <td class="text-right">${li.quantity}</td>
            <td class="text-right">${formatInvoiceMoney(regularPrice)}</td>
            <td class="text-right">${formatInvoiceMoney(lineDiscount)}</td>
            <td class="text-right"><strong>${formatInvoiceMoney(lineTotal)}</strong></td>
          </tr>`;
            })
            .join("")}
          ${order.sampleFreeIssues
            .map((s, index) => `
          <tr>
            <td class="text-center">${order.lineItems.length + index + 1}</td>
            <td>-</td>
            <td>-</td>
            <td>${escapeHtml(s.sampleFreeIssueItem.name)} <em>(${s.sampleFreeIssueItem.type})</em></td>
            <td class="text-right">${s.quantity}</td>
            <td class="text-right">-</td>
            <td class="text-right">-</td>
            <td class="text-right">-</td>
          </tr>`)
            .join("")}
        </tbody>
      </table>
    </div>

    <div class="summary">
      <div class="summary-left">
        <p>Total Quantity: <strong>${totalQuantity}</strong></p>
        <p><strong>Coupon Code</strong> <span style="display:inline-block;width:22px;text-align:center;">:</span> ${escapeHtml(merchantCouponCode ?? "-")}</p>
        <div class="notes-box">
          <span class="label">SPECIAL NOTES</span>
          ${externalRemarks.length > 0 ? escapeHtml(externalRemarks.join("; ")) : "No special delivery notes applied."}
        </div>
      </div>
      <div class="summary-right">
        <div class="summary-row">
          <span>Total</span>
          <strong class="text-right">${formatInvoiceMoney(productTotal)}</strong>
        </div>
        <div class="summary-row line">
          <span>Shipping Charges</span>
          <strong class="text-right">${formatInvoiceMoney(shippingTotal)}</strong>
        </div>
        <div class="summary-row grand">
          <span>Grand Total</span>
          <span class="text-right">${formatInvoiceMoney(grandTotal)}</span>
        </div>
      </div>
    </div>

    <p class="help-line">If you have any questions, Please call <strong>${escapeHtml(loc.invoicePhone ?? "+94777555304")}</strong></p>
    <div class="invoice-policy-notes">
      <p><strong>NOTE</strong> - Please check and confirm the product(s) at the time of receiving. In case of an exchange, it must be requested within 3 days of delivery. Complaints received afterward will not be accepted.</p>
      ${loc.invoiceFooter ? `<p>${escapeHtml(loc.invoiceFooter)}</p>` : ""}
    </div>
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
