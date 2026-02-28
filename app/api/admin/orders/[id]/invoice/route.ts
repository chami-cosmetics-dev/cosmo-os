import { NextRequest, NextResponse } from "next/server";

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

function getCustomerName(addr: unknown): string {
  if (!addr || typeof addr !== "object") return "";
  const a = addr as Record<string, unknown>;
  const name = a.name ?? [a.first_name, a.last_name].filter(Boolean).join(" ").trim();
  return typeof name === "string" ? name : "";
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

function getPaymentMethod(financialStatus: string | null): string {
  if (!financialStatus) return "—";
  const s = financialStatus.toLowerCase();
  if (s.includes("pending") || s.includes("cod")) return "Cash on Delivery (COD)";
  if (s.includes("paid")) return "Paid";
  if (s.includes("refund")) return "Refunded";
  return financialStatus;
}

function getPaymentDescription(financialStatus: string | null): string {
  if (!financialStatus) return "—";
  const s = financialStatus.toLowerCase();
  if (s.includes("pending") || s.includes("cod")) return "CASH PAYMENT ON DELIVERY";
  if (s.includes("paid")) return "PAID";
  return financialStatus.toUpperCase();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const printParam = request.nextUrl.searchParams.get("print");
  const shouldIncrementPrint = printParam === "1" || printParam === "true";
  const auth = await requireAnyPermission(
    shouldIncrementPrint
      ? ["orders.read", "fulfillment.order_print.print"]
      : ["orders.read", "fulfillment.order_print.read"]
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

  const order = await prisma.order.findFirst({
    where: { id: idResult.data, companyId },
    include: {
      company: { select: { name: true, address: true } },
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
  });

  if (!order) {
    return new NextResponse("Order not found", { status: 404 });
  }

  const showWatermark = order.printCount > 0;
  const printedAt = new Date();
  if (shouldIncrementPrint) {
    const userId = auth.context!.user!.id;
    await prisma.order.update({
      where: { id: order.id },
      data: {
        printCount: { increment: 1 },
        lastPrintedAt: printedAt,
        lastPrintedById: userId,
      },
    });
  }

  const loc = order.companyLocation;
  const company = order.company;
  const customerName =
    getCustomerName(order.shippingAddress) ||
    getCustomerName(order.billingAddress) ||
    order.customerEmail ||
    "";
  const billingAddr = formatAddress(order.billingAddress);
  const shippingAddr = formatAddress(order.shippingAddress);
  const shippingCity = getCity(order.shippingAddress);

  const externalRemarks = order.remarks
    .filter((r) => r.type === "external" && r.showOnInvoice)
    .map((r) => r.content);
  const internalRemarks = order.remarks
    .filter((r) => r.type === "internal" && r.showOnInvoice)
    .map((r) => r.content);

  const discountCodes = order.discountCodes as string[] | null;
  const discountCodeStr = Array.isArray(discountCodes) ? discountCodes.join(", ") : "";

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
    .watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 140px;
      font-weight: 300;
      letter-spacing: 0.1em;
      color: rgba(0,0,0,0.06);
      pointer-events: none;
      z-index: 1;
    }
    .content { position: relative; z-index: 2; }
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
    @media print {
      body { padding: 16px; }
      .top-accent { margin: -16px -16px 20px -16px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .watermark { color: rgba(0,0,0,0.1); }
      .invoice-meta { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      thead th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .grand-total-wrap { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      tbody tr:nth-child(even) { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      tbody tr:hover { background: none !important; }
    }
  </style>
</head>
<body>
  ${showWatermark ? '<div class="watermark">COPY</div>' : ""}
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
        ${order.customerPhone ? `<p><strong>Contact Number:</strong> ${escapeHtml(order.customerPhone)}</p>` : ""}
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
          <th class="text-right">TOTAL</th>
        </tr>
      </thead>
      <tbody>
        ${order.lineItems
          .map(
            (li) => {
              const regPrice = li.productItem.compareAtPrice ?? li.price;
              const productName = [li.productItem.productTitle, li.productItem.variantTitle].filter(Boolean).join(" - ");
              return `
        <tr>
          <td>${escapeHtml(li.productItem.sku ?? "—")}</td>
          <td>${escapeHtml(li.productItem.barcode ?? "—")}</td>
          <td>${escapeHtml(productName)}</td>
          <td class="text-right">${li.quantity}</td>
          <td class="text-right">${formatPrice(regPrice.toString(), order.currency)}</td>
          <td class="text-right">${formatPrice(li.price.toString(), order.currency)}</td>
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
        </tr>`
          )
          .join("")}
        ${order.totalDiscounts && Number(order.totalDiscounts) !== 0
          ? `
        <tr>
          <td colspan="2">—</td>
          <td>Discount${discountCodeStr ? ` (${escapeHtml(discountCodeStr)})` : ""}</td>
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
      <p><strong>Payment Method:</strong> ${escapeHtml(getPaymentMethod(order.financialStatus))}</p>
      <p><strong>Merchant:</strong> ${escapeHtml(order.assignedMerchant?.name ?? "—")}</p>
      <p><strong>Customer Notes:</strong> ${externalRemarks.length > 0 ? escapeHtml(externalRemarks.join("; ")) : "—"}</p>
      <p><strong>Call Center Notes:</strong> ${internalRemarks.length > 0 ? escapeHtml(internalRemarks.join("; ")) : "—"}</p>
      <p><strong>Original Del Date:</strong> ${invoiceDate}</p>
      <p><strong>Payment Description:</strong> ${escapeHtml(getPaymentDescription(order.financialStatus))}</p>
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

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
