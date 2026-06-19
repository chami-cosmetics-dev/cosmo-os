import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { logReportDownload } from "@/lib/report-download-log";
import {
  addDays,
  endOfDay,
  formatAddress,
  getCustomerName,
  startOfDay,
} from "@/lib/reports/csv";
import {
  buildOrderInvoiceCsv,
  buildOrderInvoiceItemCsv,
  createOrderInvoiceItemRow,
  createOrderInvoiceRow,
} from "@/lib/reports/order-dump";
import { getMerchantCouponCode } from "@/lib/order-merchant-coupon";
import { resolveCustomerPhone } from "@/lib/order-sms-resolvers";
import { getOrderDumpPermission } from "@/lib/report-permissions";
import { requirePermission } from "@/lib/rbac";

type ReportKind = "invoice" | "invoice-item";
type RangeKind = "last-90" | "warehouse-360" | "historical-year";

function parseReportKind(value: string | null): ReportKind {
  return value === "invoice-item" ? "invoice-item" : "invoice";
}

function parseRangeKind(value: string | null): RangeKind {
  if (value === "warehouse-360") return "warehouse-360";
  if (value === "historical-year") return "historical-year";
  return "last-90";
}

function getRangeBounds(range: RangeKind, year: number | null) {
  const now = new Date();
  if (range === "warehouse-360") {
    const yesterday = addDays(startOfDay(now), -1);
    const to = endOfDay(yesterday);
    const from = startOfDay(addDays(yesterday, -359));
    return { from, to, label: "warehouse-360" };
  }

  if (range === "historical-year") {
    const safeYear = year && Number.isFinite(year) ? year : now.getFullYear();
    return {
      from: new Date(Date.UTC(safeYear, 0, 1, 0, 0, 0, 0)),
      to: new Date(Date.UTC(safeYear, 11, 31, 23, 59, 59, 999)),
      label: String(safeYear),
    };
  }

  return {
    from: startOfDay(addDays(now, -89)),
    to: endOfDay(now),
    label: "last-90",
  };
}

function decimalToString(value: Prisma.Decimal | null) {
  return value ? value.toString() : "";
}

function getShippingService(order: {
  dispatchedToCustomer?: boolean | null;
  dispatchedByRider?: { name: string | null; mobile?: string | null } | null;
  dispatchedByCourierService?: { name: string } | null;
}) {
  if (order.dispatchedToCustomer) return "Customer pickup";
  if (order.dispatchedByRider) {
    return order.dispatchedByRider.name ?? order.dispatchedByRider.mobile ?? "Rider";
  }
  return order.dispatchedByCourierService?.name ?? "";
}

function getReportLabel(report: ReportKind, range: RangeKind) {
  if (report === "invoice-item") {
    if (range === "warehouse-360") return "Web-site Invoice Item Detail (Invoice Wise) [Processed Up to Last Day]";
    if (range === "historical-year") return "Historical Invoice Item Details";
    return "Web-site Invoice Item Detail (Invoice/Item Wise) [Last 90 Days]";
  }

  if (range === "warehouse-360") return "Web-site Invoice Detail (Invoice Wise 360 Days) [Processed Up to Last Day]";
  if (range === "historical-year") return "Historical Invoice Details";
  return "Web-site Invoice Detail (Invoice Wise) [Last 90 Days]";
}

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const report = parseReportKind(request.nextUrl.searchParams.get("report"));
  const range = parseRangeKind(request.nextUrl.searchParams.get("range"));
  const auth = await requirePermission(getOrderDumpPermission(report, range));
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const yearParam = request.nextUrl.searchParams.get("year");
  const parsedYear = yearParam ? Number.parseInt(yearParam, 10) : null;
  const { from, to, label } = getRangeBounds(range, parsedYear);

  const orders = await prisma.order.findMany({
    where: {
      companyId,
      createdAt: {
        gte: from,
        lte: to,
      },
    },
    orderBy: [{ createdAt: "desc" }, { updatedAt: "desc" }],
    include: {
      companyLocation: { select: { name: true } },
      assignedMerchant: { select: { name: true } },
      dispatchedByRider: { select: { name: true, mobile: true } },
      dispatchedByCourierService: { select: { name: true } },
      lineItems: {
        include: {
          productItem: {
            select: {
              sku: true,
              barcode: true,
              productTitle: true,
              variantTitle: true,
            },
          },
        },
      },
    },
  });

  const filters = range === "historical-year" ? `report=${report};range=${range};year=${label}` : `report=${report};range=${range}`;
  const reportLabel = getReportLabel(report, range);

  if (report === "invoice-item") {
    const rows = orders.flatMap((order) => {
      const customerName =
        getCustomerName(order.shippingAddress) ||
        getCustomerName(order.billingAddress) ||
        order.customerEmail ||
        "";
      const paymentGateway = order.paymentGatewayPrimary ?? order.paymentGatewayNames[0] ?? "";
      const merchantName = order.assignedMerchant?.name ?? "";
      const invoiceNo = order.name ?? order.orderNumber ?? order.shopifyOrderId;

      const merchantCouponCode = getMerchantCouponCode({
        sourceName: order.sourceName,
        discountCodes: order.discountCodes,
        rawPayload: order.rawPayload,
        joinAllDiscountCodes: true,
      });

      return order.lineItems.map((item) =>
        createOrderInvoiceItemRow({
          invoiceId: order.id,
          invoiceNo,
          erpInvoiceId: order.erpnextInvoiceId,
          orderNumber: order.orderNumber,
          sourceName: order.sourceName,
          merchantCouponCode,
          createdAt: order.createdAt,
          locationName: order.companyLocation.name,
          customerName,
          customerEmail: order.customerEmail,
          customerPhone: resolveCustomerPhone(order) ?? null,
          sku: item.productItem.sku,
          barcode: item.productItem.barcode,
          productTitle: item.productItem.productTitle,
          variantTitle: item.productItem.variantTitle,
          quantity: item.quantity,
          unitPrice: item.price.toString(),
          lineDiscountPercent: item.discountPercent?.toString() ?? null,
          lineTotal: new Prisma.Decimal(item.price).mul(item.quantity).toString(),
          currency: order.currency,
          financialStatus: order.financialStatus,
          fulfillmentStatus: order.fulfillmentStatus,
          paymentGateway,
          merchantName,
        })
      );
    });

    const csv = buildOrderInvoiceItemCsv(rows);
    const fileName = `order-invoice-item-${label}.csv`;

    await logReportDownload({
      companyId,
      userId: auth.context?.user?.id,
      reportKey: `orders:${report}:${range}`,
      reportLabel,
      filters,
      fileName,
    });

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const rows = orders.map((order) => {
    const customerName =
      getCustomerName(order.shippingAddress) ||
      getCustomerName(order.billingAddress) ||
      order.customerEmail ||
      "";
    const paymentGateway = order.paymentGatewayPrimary ?? order.paymentGatewayNames[0] ?? "";
    const merchantName = order.assignedMerchant?.name ?? "";
    const invoiceNo = order.name ?? order.orderNumber ?? order.shopifyOrderId;

    return createOrderInvoiceRow({
      invoiceId: order.id,
      invoiceNo,
      erpInvoiceId: order.erpnextInvoiceId,
      orderNumber: order.orderNumber,
      sourceName: order.sourceName,
      merchantCouponCode: getMerchantCouponCode({
        sourceName: order.sourceName,
        discountCodes: order.discountCodes,
        rawPayload: order.rawPayload,
        joinAllDiscountCodes: true,
      }),
      fulfillmentStage: order.fulfillmentStage,
      shippingService: getShippingService(order),
      createdAt: order.createdAt,
      locationName: order.companyLocation.name,
      customerName,
      customerEmail: order.customerEmail,
      customerPhone: resolveCustomerPhone(order) ?? null,
      billingAddress: formatAddress(order.billingAddress),
      shippingAddress: formatAddress(order.shippingAddress),
      financialStatus: order.financialStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      paymentGateway,
      merchantName,
      subtotalPrice: decimalToString(order.subtotalPrice),
      discounts: decimalToString(order.totalDiscounts),
      shippingTotal: decimalToString(order.totalShipping),
      taxTotal: decimalToString(order.totalTax),
      grandTotal: order.totalPrice.toString(),
      currency: order.currency,
      itemCount: order.lineItems.length,
      invoiceCompleteAt: order.invoiceCompleteAt,
      updatedAt: order.updatedAt,
    });
  });

  const csv = buildOrderInvoiceCsv(rows);
  const fileName = `order-invoice-${label}.csv`;

  await logReportDownload({
    companyId,
    userId: auth.context?.user?.id,
    reportKey: `orders:${report}:${range}`,
    reportLabel,
    filters,
    fileName,
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
