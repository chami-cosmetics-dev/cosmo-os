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
  buildOrderInvoiceCsvWithoutCustomerPhone,
  buildOrderInvoiceItemCsv,
  buildOrderInvoiceItemCsvWithoutCustomerPhone,
  createOrderInvoiceItemRow,
  createOrderInvoiceRow,
} from "@/lib/reports/order-dump";
import { getMerchantCouponCode } from "@/lib/order-merchant-coupon";
import { resolveOrderShippingDisplay } from "@/lib/order-shipping-display";
import { resolveCustomerPhone } from "@/lib/order-sms-resolvers";
import { getOrderDumpPermission, getUtilityOrderDumpPermission } from "@/lib/report-permissions";
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

function getUserDisplayName(user: {
  knownName?: string | null;
  name?: string | null;
  email?: string | null;
} | null | undefined) {
  return user?.knownName?.trim() || user?.name?.trim() || user?.email?.trim() || "";
}

function getShippingService(order: {
  sourceName: string;
  locationName: string;
  dispatchedToCustomer?: boolean | null;
  dispatchedByRider?: { knownName?: string | null; name: string | null; mobile?: string | null } | null;
  dispatchedByCourierService?: { name: string } | null;
}) {
  const source = order.sourceName.toLowerCase();
  if (source.includes("erpnext-pos") || source.includes("erpnext pos")) return order.locationName;
  if (order.dispatchedToCustomer) return "Customer pickup";
  if (order.dispatchedByRider) {
    return getUserDisplayName(order.dispatchedByRider) || order.dispatchedByRider.mobile || "Rider";
  }
  return order.dispatchedByCourierService?.name ?? "";
}

function buildCouponToMerchantMap(
  users: Array<{ knownName: string | null; name: string | null; email: string | null; couponCodes: string[] }>
) {
  const couponToMerchant = new Map<string, string>();
  for (const user of users) {
    const merchantName = getUserDisplayName(user);
    if (!merchantName) continue;
    for (const coupon of user.couponCodes) {
      const normalized = coupon.trim().toLowerCase();
      if (normalized && !couponToMerchant.has(normalized)) {
        couponToMerchant.set(normalized, merchantName);
      }
    }
  }
  return couponToMerchant;
}

function buildShopifyUserIdToEmailMap(
  users: Array<{ email: string | null; shopifyUserIds: string[] }>
) {
  const shopifyUserIdToEmail = new Map<string, string>();
  for (const user of users) {
    const email = user.email?.trim();
    if (!email) continue;
    for (const shopifyUserId of user.shopifyUserIds) {
      const normalized = shopifyUserId.trim();
      if (normalized && !shopifyUserIdToEmail.has(normalized)) {
        shopifyUserIdToEmail.set(normalized, email);
      }
    }
  }
  return shopifyUserIdToEmail;
}

function buildErpnextUsernameToEmailMap(
  users: Array<{ email: string | null; erpnextUsername: string | null }>
) {
  const erpnextUsernameToEmail = new Map<string, string>();
  for (const user of users) {
    const email = user.email?.trim();
    const username = user.erpnextUsername?.trim().toLowerCase();
    if (email && username && !erpnextUsernameToEmail.has(username)) {
      erpnextUsernameToEmail.set(username, email);
    }
  }
  return erpnextUsernameToEmail;
}

function getRawPayloadString(rawPayload: Prisma.JsonValue | null | undefined, key: string) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return null;
  const top = rawPayload as Record<string, unknown>;
  const data = top.data;
  const value =
    top[key] ??
    (data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)[key]
      : undefined);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function resolveOrderCreatedByEmail(input: {
  sourceName: string;
  shopifyUserId: string | null;
  customerEmail: string | null;
  assignedMerchantEmail: string | null;
  rawPayload: Prisma.JsonValue | null;
  auditLogEmail: string | null;
  shopifyUserIdToEmail: Map<string, string>;
  erpnextUsernameToEmail: Map<string, string>;
}) {
  if (input.auditLogEmail?.trim()) return input.auditLogEmail.trim();

  if (input.shopifyUserId) {
    const email = input.shopifyUserIdToEmail.get(input.shopifyUserId.trim());
    if (email) return email;
  }

  const sourceName = input.sourceName.toLowerCase();
  if ((sourceName === "pos" || sourceName === "manual") && input.assignedMerchantEmail?.trim()) {
    return input.assignedMerchantEmail.trim();
  }

  const owner = getRawPayloadString(input.rawPayload, "owner");
  if (owner) {
    if (looksLikeEmail(owner)) return owner;
    const email = input.erpnextUsernameToEmail.get(owner.toLowerCase());
    if (email) return email;
  }

  if ((sourceName === "web" || sourceName === "shopify") && input.customerEmail?.trim()) {
    return input.customerEmail.trim();
  }

  return "";
}

function resolveMerchantName(input: {
  couponCode: string | null;
  couponToMerchant: Map<string, string>;
  assignedMerchant: { knownName: string | null; name: string | null; email: string | null } | null;
}) {
  const coupons = (input.couponCode ?? "")
    .split(",")
    .map((coupon) => coupon.trim().toLowerCase())
    .filter(Boolean);

  for (const coupon of coupons) {
    const merchant = input.couponToMerchant.get(coupon);
    if (merchant) return merchant;
  }

  return getUserDisplayName(input.assignedMerchant);
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
  const omitCustomerPhone = request.nextUrl.searchParams.get("omit_customer_phone") === "1";
  if (omitCustomerPhone && range !== "last-90") {
    return NextResponse.json({ error: "Utility dumps are only available for last-90 reports" }, { status: 400 });
  }
  const permission = omitCustomerPhone
    ? getUtilityOrderDumpPermission(report)
    : getOrderDumpPermission(report, range);
  const auth = await requirePermission(permission);
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
      companyLocation: { select: { name: true, erpnextCompany: true } },
      assignedMerchant: { select: { knownName: true, name: true, email: true, couponCodes: true } },
      dispatchedBy: { select: { knownName: true, name: true, email: true } },
      dispatchedByRider: { select: { knownName: true, name: true, mobile: true } },
      dispatchedByCourierService: { select: { name: true } },
      lastPrintedBy: { select: { knownName: true, name: true, email: true } },
      deliveryCompleteBy: { select: { knownName: true, name: true, email: true } },
      invoiceCompleteBy: { select: { knownName: true, name: true, email: true } },
      lineItems: {
        include: {
          productItem: {
            select: {
              sku: true,
              barcode: true,
              productTitle: true,
              vendor: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  const merchantUsers = await prisma.user.findMany({
    where: {
      companyId,
      couponCodes: { isEmpty: false },
    },
    select: {
      knownName: true,
      name: true,
      email: true,
      couponCodes: true,
    },
  });
  const couponToMerchant = buildCouponToMerchantMap(merchantUsers);
  const creatorUsers = await prisma.user.findMany({
    where: {
      companyId,
      OR: [
        { shopifyUserIds: { isEmpty: false } },
        { erpnextUsername: { not: null } },
      ],
    },
    select: {
      email: true,
      shopifyUserIds: true,
      erpnextUsername: true,
    },
  });
  const shopifyUserIdToEmail = buildShopifyUserIdToEmailMap(creatorUsers);
  const erpnextUsernameToEmail = buildErpnextUsernameToEmailMap(creatorUsers);
  const manualOrderCreatedLogs = await prisma.auditLog.findMany({
    where: {
      companyId,
      action: "manual_order_created",
      entityType: "Order",
      entityId: { in: orders.map((order) => order.id) },
    },
    orderBy: { createdAt: "asc" },
    select: {
      entityId: true,
      actorUser: { select: { email: true } },
    },
  });
  const orderIdToManualCreatorEmail = new Map<string, string>();
  for (const log of manualOrderCreatedLogs) {
    const email = log.actorUser?.email?.trim();
    if (log.entityId && email && !orderIdToManualCreatorEmail.has(log.entityId)) {
      orderIdToManualCreatorEmail.set(log.entityId, email);
    }
  }

  const filterParts = [`report=${report}`, `range=${range}`];
  if (range === "historical-year") filterParts.push(`year=${label}`);
  if (omitCustomerPhone) filterParts.push("omit_customer_phone=1");
  const filters = filterParts.join(";");
  const baseReportLabel = getReportLabel(report, range);
  const reportLabel = omitCustomerPhone ? `Utility ${baseReportLabel}` : baseReportLabel;

  if (report === "invoice-item") {
    const rows = orders.flatMap((order) => {
      const customerName =
        getCustomerName(order.shippingAddress) ||
        getCustomerName(order.billingAddress) ||
        order.customerEmail ||
        "";
      const paymentGateway = order.paymentGatewayPrimary ?? order.paymentGatewayNames[0] ?? "";
      const invoiceNo = order.name ?? order.orderNumber ?? order.shopifyOrderId;
      const createdBy = resolveOrderCreatedByEmail({
        sourceName: order.sourceName,
        shopifyUserId: order.shopifyUserId,
        customerEmail: order.customerEmail,
        assignedMerchantEmail: order.assignedMerchant?.email ?? null,
        rawPayload: order.rawPayload,
        auditLogEmail: orderIdToManualCreatorEmail.get(order.id) ?? null,
        shopifyUserIdToEmail,
        erpnextUsernameToEmail,
      });

      const merchantCouponCode = getMerchantCouponCode({
        sourceName: order.sourceName,
        discountCodes: order.discountCodes,
        rawPayload: order.rawPayload,
        assignedMerchantCouponCodes: order.assignedMerchant?.couponCodes ?? null,
        joinAllDiscountCodes: true,
      });
      const merchantName = resolveMerchantName({
        couponCode: merchantCouponCode,
        couponToMerchant,
        assignedMerchant: order.assignedMerchant,
      });

      return order.lineItems.map((item) =>
        createOrderInvoiceItemRow({
          invoiceNo,
          erpInvoiceId: order.erpnextInvoiceId,
          sourceName: order.sourceName,
          merchantCouponCode,
          createdAt: order.createdAt,
          locationName: order.companyLocation.name,
          customerName,
          customerEmail: order.customerEmail,
          customerPhone: resolveCustomerPhone(order) ?? null,
          sku: item.productItem.sku,
          barcode: item.productItem.barcode,
          brand: item.productItem.vendor?.name ?? null,
          productTitle: item.productItem.productTitle,
          quantity: item.quantity,
          unitPrice: item.price.toString(),
          lineDiscountPercent: item.discountPercent?.toString() ?? null,
          lineTotal: new Prisma.Decimal(item.price).mul(item.quantity).toString(),
          fulfillmentStage: order.fulfillmentStage,
          financialStatus: order.financialStatus,
          fulfillmentStatus: order.fulfillmentStatus,
          paymentGateway,
          merchantName,
          createdBy,
        })
      );
    });

    const csv = omitCustomerPhone
      ? buildOrderInvoiceItemCsvWithoutCustomerPhone(rows)
      : buildOrderInvoiceItemCsv(rows);
    const fileName = omitCustomerPhone
      ? `utility-order-invoice-item-${label}.csv`
      : `order-invoice-item-${label}.csv`;

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
    const merchantCouponCode = getMerchantCouponCode({
      sourceName: order.sourceName,
      discountCodes: order.discountCodes,
      rawPayload: order.rawPayload,
      assignedMerchantCouponCodes: order.assignedMerchant?.couponCodes ?? null,
      joinAllDiscountCodes: true,
    });
    const merchantName = resolveMerchantName({
      couponCode: merchantCouponCode,
      couponToMerchant,
      assignedMerchant: order.assignedMerchant,
    });
    const invoiceNo = order.name ?? order.orderNumber ?? order.shopifyOrderId;
    const createdBy = resolveOrderCreatedByEmail({
      sourceName: order.sourceName,
      shopifyUserId: order.shopifyUserId,
      customerEmail: order.customerEmail,
      assignedMerchantEmail: order.assignedMerchant?.email ?? null,
      rawPayload: order.rawPayload,
      auditLogEmail: orderIdToManualCreatorEmail.get(order.id) ?? null,
      shopifyUserIdToEmail,
      erpnextUsernameToEmail,
    });
    const shippingRule = resolveOrderShippingDisplay({
      totalShipping: decimalToString(order.totalShipping),
      shippingLines: order.shippingLines,
      rawPayload: order.rawPayload,
      sourceName: order.sourceName,
    }).label;

    return createOrderInvoiceRow({
      invoiceNo,
      erpInvoiceId: order.erpnextInvoiceId,
      sourceName: order.sourceName,
      merchantCouponCode,
      merchantName,
      fulfillmentStage: order.fulfillmentStage,
      shippingService: getShippingService({
        ...order,
        locationName: order.companyLocation.name,
      }),
      createdAt: order.createdAt,
      companyName: order.companyLocation.erpnextCompany ?? order.companyLocation.name,
      posProfile: order.posProfile ?? null,
      posWarehouse: order.erpnextWarehouse ?? null,
      customerName,
      customerEmail: order.customerEmail,
      customerPhone: resolveCustomerPhone(order) ?? null,
      billingAddress: formatAddress(order.billingAddress),
      shippingAddress: formatAddress(order.shippingAddress),
      financialStatus: order.financialStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      paymentGateway,
      subtotalPrice: decimalToString(order.subtotalPrice),
      discounts: decimalToString(order.totalDiscounts),
      shippingTotal: decimalToString(order.totalShipping),
      grandTotal: order.totalPrice.toString(),
      itemCount: order.lineItems.length,
      printCount: order.printCount,
      packageReadyAt: order.packageReadyAt,
      dispatchedAt: order.dispatchedAt,
      dispatchedBy: getUserDisplayName(order.dispatchedBy),
      lastPrintedAt: order.lastPrintedAt,
      lastPrintedBy: getUserDisplayName(order.lastPrintedBy),
      revertedFromInvoiceCompleteAt: order.revertedFromInvoiceCompleteAt,
      deliveryCompleteAt: order.deliveryCompleteAt,
      deliveryCompleteBy: getUserDisplayName(order.deliveryCompleteBy),
      invoiceCompleteAt: order.invoiceCompleteAt,
      invoiceCompleteBy: getUserDisplayName(order.invoiceCompleteBy),
      shippingRule,
      createdBy,
    });
  });

  const csv = omitCustomerPhone
    ? buildOrderInvoiceCsvWithoutCustomerPhone(rows)
    : buildOrderInvoiceCsv(rows);
  const fileName = omitCustomerPhone
    ? `utility-order-invoice-${label}.csv`
    : `order-invoice-${label}.csv`;

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
