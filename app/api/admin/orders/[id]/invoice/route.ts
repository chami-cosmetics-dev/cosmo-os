import { NextRequest, NextResponse } from "next/server";

import { findMatchingContacts } from "@/lib/contact-identifiers";
import { resolveErpApiCreds } from "@/lib/erpnext-customer-display-name";
import { formatInvoiceOrderReference } from "@/lib/fulfillment-order-reference";
import { getOrderPaymentGatewayColumnState } from "@/lib/order-payment-gateway-compat";
import { resolveOrderDiscountCouponForOrder, resolveOrderMerchantCouponForOrder } from "@/lib/order-discount-coupon";
import { resolveOrderShippingDisplayForOrder } from "@/lib/order-shipping-display";
import { buildPhoneLookupVariants } from "@/lib/phone-lookup";
import { formatPickListBarcode, resolvePickListBarcode } from "@/lib/product-item-barcode";
import { loadBarcodeLookupBySku } from "@/lib/product-item-barcode.server";
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
  const barcodeBySku = await loadBarcodeLookupBySku(companyId, lineItemSkus, { erpConfig });

  const showWatermark = order.printCount > 0;
  const printedAt = new Date();
  if (shouldIncrementPrint) {
    const userId = auth.context!.user!.id;
    const stage = order.fulfillmentStage;
    const printStageUpdate =
      stage === "order_received" || stage === "sample_free_issue"
        ? orderStageUpdate("print", printedAt)
        : stage === "print"
          ? orderStageUpdate("ready_to_dispatch", printedAt)
          : {};
    await prisma.order.update({
      where: { id: order.id },
      data: {
        printCount: { increment: 1 },
        lastPrintedAt: printedAt,
        lastPrintedById: userId,
        ...printStageUpdate,
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

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${escapeHtml(invoiceNumber)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11px;
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
      font-size: 13px;
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
      font-size: 14px;
      font-weight: 700;
      line-height: 1.2;
    }
    .brand-fallback.visible {
      display: block;
      margin-top: 4px;
    }
    h1 {
      font-size: 20px;
      line-height: 1.2;
      margin: 0 0 16px 0;
      font-weight: 800;
    }
    .invoice-details {
      display: grid;
      grid-template-columns: 104px 10px 1fr;
      gap: 4px 8px;
      margin-bottom: 34px;
      font-size: 10px;
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
      font-size: 14px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .address-block p {
      font-size: 13px;
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
      font-size: 12px;
    }
    th, td {
      padding: 10px 8px;
      text-align: left;
      vertical-align: top;
    }
    thead th {
      color: #000;
      font-weight: 800;
      font-size: 11px;
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
      font-size: 11px;
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
      font-size: 13px;
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
      font-size: 16px;
      font-weight: 800;
    }
    .notes-box {
      margin-top: 14px;
      width: 330px;
      min-height: 60px;
      border: 1px dashed #bdbdbd;
      padding: 9px 11px;
      font-size: 12px;
    }
    .notes-box .label {
      display: block;
      margin-bottom: 8px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
    }
    .help-line {
      margin-top: 56px;
      text-align: center;
      font-size: 10px;
    }
    .help-line strong { font-weight: 800; }
    .invoice-policy-notes {
      margin-top: 10px;
      font-size: 9px;
      text-align: center;
      line-height: 1.6;
    }
    .invoice-policy-notes p { margin: 6px 0; }
    @media screen and (max-width: 600px) {
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
        ${pickupDeliveryLabel ? `<p><strong>Delivery:</strong> ${escapeHtml(pickupDeliveryLabel)}</p>` : ""}
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
              const barcode = formatPickListBarcode(
                resolvePickListBarcode(li.productItem.barcode, li.productItem.sku, barcodeBySku),
              );
              return `
          <tr>
            <td class="text-center">${index + 1}</td>
            <td class="sku">${escapeHtml(li.productItem.sku ?? "-")}</td>
            <td>${barcode ? `<span class="barcode">${escapeHtml(barcode)}</span>` : "-"}</td>
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
        <p><strong>Coupon Code</strong> <span style="display:inline-block;width:22px;text-align:center;">:</span> ${escapeHtml(discountCouponCode ?? "-")}</p>
        ${merchantCouponCode ? `<p><strong>Mer Coupon</strong> <span style="display:inline-block;width:22px;text-align:center;">:</span> ${escapeHtml(merchantCouponCode)}</p>` : ""}
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
