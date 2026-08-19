import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { logReportDownload } from "@/lib/report-download-log";
import {
  addDays,
  endOfDay,
  formatAddress,
  formatCsvDataLine,
  formatCsvHeaderLine,
  getCustomerName,
  startOfDay,
} from "@/lib/reports/csv";
import { DUMP_TOTAL_HEADER } from "@/lib/reports/dump-download";
import {
  createOrderInvoiceItemRow,
  createOrderInvoiceRow,
  getOrderInvoiceCsvHeaders,
  getOrderInvoiceItemCsvHeaders,
  joinDumpCouponCodes,
} from "@/lib/reports/order-dump";
import {
  applyMerchantGroup,
  buildCouponToMerchantMap,
  getMerchantGroupUserMap,
} from "@/lib/merchant-groups";
import { getOrderDiscountCouponCode, resolveOrderDiscountCouponForOrder } from "@/lib/order-discount-coupon";
import { getMerchantCouponCode } from "@/lib/order-merchant-coupon";
import { resolveOrderLineItemsPricing } from "@/lib/order-line-item-pricing";
import {
  normalizeZeroValueShippingLabel,
  resolveOrderShippingDisplay,
  resolveOrderShippingDisplayForOrder,
} from "@/lib/order-shipping-display";
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

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, limit), items.length);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }));

  return results;
}

async function writeOrderedConcurrentLines<T>(
  items: T[],
  write: (text: string) => void,
  mapper: (item: T, index: number) => Promise<string>,
) {
  if (items.length === 0) return;
  const pending: Array<string | undefined> = new Array(items.length);
  let next = 0;
  await mapWithConcurrency(items, 4, async (item, index) => {
    pending[index] = await mapper(item, index);
    while (next < pending.length && pending[next] != null) {
      write(pending[next]!);
      next += 1;
    }
    return pending[index]!;
  });
}

function shippingRuleFallbackFromOrder(order: { dispatchedToCustomer?: boolean | null }, shippingAddress: string): string | null {
  if (order.dispatchedToCustomer) return "Pick Up";
  return normalizeZeroValueShippingLabel(shippingAddress);
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

function getPayloadLineItems(rawPayload: Prisma.JsonValue | null | undefined): Array<Record<string, unknown>> {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return [];
  const lineItems = (rawPayload as Record<string, unknown>).line_items;
  if (!Array.isArray(lineItems)) return [];
  return lineItems.filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item));
}

function getPayloadLineItemBrand(input: {
  rawPayload: Prisma.JsonValue | null;
  shopifyLineItemId: string;
  sku: string | null;
  index: number;
}) {
  const payloadItems = getPayloadLineItems(input.rawPayload);
  const matched =
    payloadItems.find((item) => item.id != null && String(item.id) === input.shopifyLineItemId) ??
    payloadItems.find((item) => input.sku && typeof item.sku === "string" && item.sku.trim() === input.sku.trim()) ??
    payloadItems[input.index];
  const vendor = matched?.vendor;
  return typeof vendor === "string" && vendor.trim() ? vendor.trim() : null;
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
  couponToMerchant: Map<string, { id: string | null; name: string }>;
  assignedMerchant: { id: string; knownName: string | null; name: string | null; email: string | null } | null;
  userToGroup: Map<string, { id: string; name: string }>;
}) {
  const coupons = (input.couponCode ?? "")
    .split(",")
    .map((coupon) => coupon.trim().toLowerCase())
    .filter(Boolean);

  for (const coupon of coupons) {
    const merchant = input.couponToMerchant.get(coupon);
    if (merchant) return merchant.name;
  }

  const assignedName = getUserDisplayName(input.assignedMerchant);
  if (!assignedName) return "";
  return applyMerchantGroup(
    { id: input.assignedMerchant?.id ?? null, name: assignedName },
    input.userToGroup,
  ).name;
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

const ORDER_DUMP_INCLUDE = {
  companyLocation: {
    select: {
      name: true,
      erpnextCompany: true,
      erpnextInstance: { select: { baseUrl: true, apiKey: true, apiSecret: true } },
    },
  },
  assignedMerchant: { select: { id: true, knownName: true, name: true, email: true, couponCodes: true } },
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
} as const;

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
  const orderWhere = {
    companyId,
    createdAt: {
      gte: from,
      lte: to,
    },
  };

  const [totalOrders, merchantUsers, userToGroup, creatorUsers, totalLineItems] = await Promise.all([
    prisma.order.count({ where: orderWhere }),
    prisma.user.findMany({
      where: {
        companyId,
        couponCodes: { isEmpty: false },
      },
      select: {
        id: true,
        knownName: true,
        name: true,
        email: true,
        couponCodes: true,
      },
    }),
    getMerchantGroupUserMap(companyId),
    prisma.user.findMany({
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
    }),
    report === "invoice-item"
      ? prisma.orderLineItem.count({ where: { order: orderWhere } })
      : Promise.resolve(0),
  ]);
  const couponToMerchant = buildCouponToMerchantMap(merchantUsers, userToGroup);
  const shopifyUserIdToEmail = buildShopifyUserIdToEmailMap(creatorUsers);
  const erpnextUsernameToEmail = buildErpnextUsernameToEmailMap(creatorUsers);

  const filterParts = [`report=${report}`, `range=${range}`];
  if (range === "historical-year") filterParts.push(`year=${label}`);
  if (omitCustomerPhone) filterParts.push("omit_customer_phone=1");
  const filters = filterParts.join(";");
  const baseReportLabel = getReportLabel(report, range);
  const reportLabel = omitCustomerPhone ? `Utility ${baseReportLabel}` : baseReportLabel;
  const csvHeaders = report === "invoice-item"
    ? getOrderInvoiceItemCsvHeaders(omitCustomerPhone)
    : getOrderInvoiceCsvHeaders(omitCustomerPhone);
  const totalCsvRows = report === "invoice-item" ? totalLineItems : totalOrders;
  const fileName = omitCustomerPhone
    ? report === "invoice-item"
      ? `utility-order-invoice-item-${label}.csv`
      : `utility-order-invoice-${label}.csv`
    : report === "invoice-item"
      ? `order-invoice-item-${label}.csv`
      : `order-invoice-${label}.csv`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (text: string) => controller.enqueue(encoder.encode(text));
      try {
        write(formatCsvHeaderLine(csvHeaders));

        const orders = await prisma.order.findMany({
          where: orderWhere,
          orderBy: [{ createdAt: "desc" }, { updatedAt: "desc" }],
          include: ORDER_DUMP_INCLUDE,
        });
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

        if (report === "invoice-item") {
          await writeOrderedConcurrentLines(orders, write, async (order) => {
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
      });
      let couponCode = getOrderDiscountCouponCode({
        sourceName: order.sourceName,
        discountCodes: order.discountCodes,
        rawPayload: order.rawPayload,
      });
      if (!couponCode) {
        couponCode = await resolveOrderDiscountCouponForOrder({
          sourceName: order.sourceName,
          discountCodes: order.discountCodes,
          rawPayload: order.rawPayload,
          name: order.name,
          erpnextInvoiceId: order.erpnextInvoiceId,
          erpnextInstance: order.companyLocation.erpnextInstance,
        });
      }
      const merchantName = resolveMerchantName({
        couponCode: merchantCouponCode,
        couponToMerchant,
        assignedMerchant: order.assignedMerchant,
        userToGroup,
      });

      const linePricing = await resolveOrderLineItemsPricing({
        sourceName: order.sourceName,
        rawPayload: order.rawPayload,
        name: order.name,
        erpnextInvoiceId: order.erpnextInvoiceId,
        erpnextInstance: order.companyLocation.erpnextInstance,
        lineItems: order.lineItems.map((item) => ({
          sku: item.productItem.sku,
          quantity: item.quantity,
          price: item.price.toString(),
        })),
      });
      const hasLineLevelDiscount = linePricing.some(
        (pricing) => pricing.originalPrice != null || pricing.originalTotal != null,
      );
      const orderDiscount = !hasLineLevelDiscount && order.totalDiscounts?.gt(0)
        ? order.totalDiscounts
        : null;
      const orderItemSubtotal = orderDiscount
        ? linePricing.reduce(
            (sum, pricing, index) => {
              const fallbackTotal = new Prisma.Decimal(order.lineItems[index]?.price ?? 0)
                .mul(order.lineItems[index]?.quantity ?? 0);
              return sum.add(new Prisma.Decimal(pricing.originalTotal ?? pricing.saleTotal ?? fallbackTotal));
            },
            new Prisma.Decimal(0),
          )
        : new Prisma.Decimal(0);

      const itemRows = order.lineItems.map((item, index) => {
        const pricing = linePricing[index];
        const unitPrice = pricing?.originalPrice ?? pricing?.salePrice ?? item.price.toString();
        const lineTotal = pricing?.originalTotal ?? pricing?.saleTotal ?? new Prisma.Decimal(item.price).mul(item.quantity).toString();
        const hasDiscount = pricing?.originalPrice != null || pricing?.originalTotal != null;
        let discountedPrice = hasDiscount ? (pricing?.salePrice ?? item.price.toString()) : null;
        let afterDiscountTotal = hasDiscount ? (pricing?.saleTotal ?? new Prisma.Decimal(item.price).mul(item.quantity).toString()) : null;

        if (!hasDiscount && orderDiscount && orderItemSubtotal.gt(0) && item.quantity > 0) {
          const lineTotalDecimal = new Prisma.Decimal(lineTotal);
          const allocatedDiscount = Prisma.Decimal.min(
            lineTotalDecimal,
            orderDiscount.mul(lineTotalDecimal).div(orderItemSubtotal),
          );
          const allocatedTotal = Prisma.Decimal.max(
            new Prisma.Decimal(0),
            lineTotalDecimal.minus(allocatedDiscount),
          );
          afterDiscountTotal = allocatedTotal.toDecimalPlaces(2).toString();
          discountedPrice = allocatedTotal.div(item.quantity).toDecimalPlaces(2).toString();
        }

        return createOrderInvoiceItemRow({
          invoiceNo,
          erpInvoiceId: order.erpnextInvoiceId,
          sourceName: order.sourceName,
          merchantCouponCode,
          couponCode,
          createdAt: order.createdAt,
          locationName: order.companyLocation.name,
          customerName,
          customerEmail: order.customerEmail,
          customerPhone: resolveCustomerPhone(order) ?? null,
          sku: item.productItem.sku,
          barcode: item.productItem.barcode,
          brand: getPayloadLineItemBrand({
            rawPayload: order.rawPayload,
            shopifyLineItemId: item.shopifyLineItemId,
            sku: item.productItem.sku,
            index,
          }) ?? item.productItem.vendor?.name ?? null,
          productTitle: item.productItem.productTitle,
          quantity: item.quantity,
          unitPrice,
          discountedPrice,
          afterDiscountTotal,
          lineTotal,
          fulfillmentStage: order.fulfillmentStage,
          financialStatus: order.financialStatus,
          fulfillmentStatus: order.fulfillmentStatus,
          paymentGateway,
          merchantName,
          createdBy,
        });
      });
            return itemRows.map((row) => formatCsvDataLine(csvHeaders, row)).join("");
          });
        } else {
          await writeOrderedConcurrentLines(orders, write, async (order) => {
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
    let discountCoupon = getOrderDiscountCouponCode({
      sourceName: order.sourceName,
      discountCodes: order.discountCodes,
      rawPayload: order.rawPayload,
    });
    if (
      !discountCoupon &&
      order.sourceName.startsWith("erpnext") &&
      order.totalDiscounts != null &&
      order.totalDiscounts.gt(0)
    ) {
      discountCoupon = await resolveOrderDiscountCouponForOrder({
        sourceName: order.sourceName,
        discountCodes: order.discountCodes,
        rawPayload: order.rawPayload,
        name: order.name,
        erpnextInvoiceId: order.erpnextInvoiceId,
        erpnextInstance: order.companyLocation.erpnextInstance,
      });
    }
    const couponCode = joinDumpCouponCodes(merchantCouponCode, discountCoupon);
    const merchantName = resolveMerchantName({
      couponCode: merchantCouponCode,
      couponToMerchant,
      assignedMerchant: order.assignedMerchant,
      userToGroup,
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
    const shippingAddress = formatAddress(order.shippingAddress);
    const shippingLookup = {
      totalShipping: decimalToString(order.totalShipping),
      shippingLines: order.shippingLines,
      rawPayload: order.rawPayload,
      sourceName: order.sourceName,
      name: order.name,
      erpnextInvoiceId: order.erpnextInvoiceId,
      erpnextInstance: order.companyLocation.erpnextInstance,
      discountCodes: order.discountCodes,
    };
    const storedShippingRule =
      resolveOrderShippingDisplay(shippingLookup).label ?? shippingRuleFallbackFromOrder(order, shippingAddress);
    const shippingRule = storedShippingRule?.trim()
      ? storedShippingRule
      : (await resolveOrderShippingDisplayForOrder(shippingLookup)).label
        ?? shippingRuleFallbackFromOrder(order, shippingAddress);

    return formatCsvDataLine(csvHeaders, createOrderInvoiceRow({
      invoiceNo,
      erpInvoiceId: order.erpnextInvoiceId,
      sourceName: order.sourceName,
      merchantCouponCode,
      couponCode,
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
      shippingAddress,
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
    }));
          });
        }

        if (!request.signal.aborted) {
          await logReportDownload({
            companyId,
            userId: auth.context?.user?.id,
            reportKey: `orders:${report}:${range}`,
            reportLabel,
            filters,
            fileName,
          });
        }
        controller.close();
      } catch (error) {
        controller.error(error instanceof Error ? error : new Error("Dump failed"));
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
      [DUMP_TOTAL_HEADER]: String(totalCsvRows),
      "Access-Control-Expose-Headers": DUMP_TOTAL_HEADER,
    },
  });
}




