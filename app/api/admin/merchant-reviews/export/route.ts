import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import * as XLSX from "xlsx";

import { supportsMerchantOrderReviews } from "@/lib/merchant-order-reviews";
import { getMerchantCouponCode } from "@/lib/order-merchant-coupon";
import { prisma } from "@/lib/prisma";
import { logReportDownload } from "@/lib/report-download-log";
import { formatAddress, getCustomerName } from "@/lib/reports/csv";
import { requirePermission } from "@/lib/rbac";

const DM_GENERAL_MERCHANT_ID = "__dm_general";
const DM_GENERAL_MERCHANT_NAME = "DM General";
const ORDER_DATE_OFFSET = "+05:30";
const ORDER_DATE_TIME_ZONE = "Asia/Colombo";

type ExportStatus = "pending" | "reviewed" | "follow_up" | "no_response" | "all";

function parseStatus(value: string | null): ExportStatus {
  if (value === "pending" || value === "reviewed" || value === "follow_up" || value === "no_response") {
    return value;
  }
  return "all";
}

function buildFileName(status: ExportStatus) {
  const stamp = new Date().toISOString().slice(0, 10);
  return status === "all"
    ? `merchant-reviews-${stamp}.xlsx`
    : `merchant-reviews-${status}-${stamp}.xlsx`;
}

function buildStatusLabel(status: ExportStatus) {
  if (status === "follow_up") return "Follow Up";
  if (status === "no_response") return "No Response";
  if (status === "pending") return "Pending";
  if (status === "reviewed") return "Reviewed";
  return "All";
}

function formatDateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatOrderDateTime(value: Date | null | undefined) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-LK", {
    timeZone: ORDER_DATE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}

function formatOrderDate(value: Date | null | undefined) {
  if (!value) return "";
  return formatDateInTimeZone(value, ORDER_DATE_TIME_ZONE);
}

function parseDateInput(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000${ORDER_DATE_OFFSET}`);
  if (Number.isNaN(parsed.getTime())) return null;
  return value;
}

function getDefaultOrderDateRange() {
  const today = formatDateInTimeZone(new Date(), ORDER_DATE_TIME_ZONE);
  return {
    from: `${today.slice(0, 8)}01`,
    to: today,
  };
}

function getOrderDateRange(searchParams: URLSearchParams) {
  const defaults = getDefaultOrderDateRange();
  let from = parseDateInput(searchParams.get("dateFrom")) ?? defaults.from;
  let to = parseDateInput(searchParams.get("dateTo")) ?? defaults.to;

  if (from > to) {
    [from, to] = [to, from];
  }

  return {
    from,
    to,
    start: new Date(`${from}T00:00:00.000${ORDER_DATE_OFFSET}`),
    end: new Date(`${to}T23:59:59.999${ORDER_DATE_OFFSET}`),
  };
}

function getUserDisplayName(user: {
  knownName?: string | null;
  name?: string | null;
  email?: string | null;
}) {
  return user.knownName?.trim() || user.name?.trim() || user.email?.trim() || null;
}

function buildCouponToUserMap(
  users: Array<{ id: string; knownName: string | null; name: string | null; email: string | null; couponCodes: string[] }>
) {
  const couponToUser = new Map<string, { id: string; name: string }>();
  for (const user of users) {
    const name = getUserDisplayName(user) ?? "Unknown";
    for (const code of user.couponCodes) {
      const normalized = code.trim().toLowerCase();
      if (normalized && !couponToUser.has(normalized)) {
        couponToUser.set(normalized, { id: user.id, name });
      }
    }
  }
  return couponToUser;
}

function resolveReviewMerchant(input: {
  sourceName: string | null;
  discountCodes: unknown;
  rawPayload: unknown;
  couponToUser: Map<string, { id: string; name: string }>;
}) {
  const merchantCouponCode = getMerchantCouponCode({
    sourceName: input.sourceName,
    discountCodes: input.discountCodes,
    rawPayload: input.rawPayload,
    joinAllDiscountCodes: true,
  });
  const merchantCoupons = (merchantCouponCode ?? "")
    .split(",")
    .map((coupon) => coupon.trim().toLowerCase())
    .filter(Boolean);

  for (const code of merchantCoupons) {
    const matchedUser = input.couponToUser.get(code);
    if (matchedUser) {
      return matchedUser;
    }
  }

  return { id: DM_GENERAL_MERCHANT_ID, name: DM_GENERAL_MERCHANT_NAME };
}

function pickCustomerName(order: {
  customer?: { firstName: string | null; lastName: string | null } | null;
  shippingAddress: unknown;
  name: string | null;
}) {
  return (
    getCustomerName(order.shippingAddress) ||
    [order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(" ").trim() ||
    order.name ||
    ""
  );
}

function matchesSearch(
  item: {
    order: {
      id: string;
      orderNumber: string | null;
      name: string | null;
      customerEmail: string | null;
      customerPhone: string | null;
      assignedMerchant: { name: string | null; email: string | null } | null;
      customer: { firstName: string | null; lastName: string | null } | null;
      shippingAddress: unknown;
    };
    reviewMerchant: { name: string };
  },
  query: string
) {
  if (!query) return true;
  const orderLabel = item.order.name ?? item.order.orderNumber ?? item.order.id;
  return [
    orderLabel,
    item.order.orderNumber,
    pickCustomerName(item.order),
    item.order.customerEmail,
    item.order.customerPhone,
    item.order.assignedMerchant?.name,
    item.order.assignedMerchant?.email,
    item.reviewMerchant.name,
  ]
    .filter(Boolean)
    .some((value) => value!.toLowerCase().includes(query));
}

function toSheetName(name: string, usedNames: Set<string>) {
  const fallback = "Merchant";
  const base = (name || fallback)
    .replace(/[\[\]:*?/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31) || fallback;

  let sheetName = base;
  let suffix = 2;
  while (usedNames.has(sheetName)) {
    const suffixText = ` ${suffix}`;
    sheetName = `${base.slice(0, 31 - suffixText.length)}${suffixText}`;
    suffix += 1;
  }
  usedNames.add(sheetName);
  return sheetName;
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission("merchant_reviews.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!supportsMerchantOrderReviews()) {
    return NextResponse.json(
      { error: "Merchant review export is not available yet. Run the latest Prisma migration first." },
      { status: 503 }
    );
  }

  const companyId = auth.context?.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const viewerUserId = auth.context!.user!.id;
  const status = parseStatus(request.nextUrl.searchParams.get("status"));
  const merchantFilter = request.nextUrl.searchParams.get("merchant")?.trim() || "__all";
  const searchQuery = request.nextUrl.searchParams.get("search")?.trim().toLowerCase() ?? "";
  const dateRange = getOrderDateRange(request.nextUrl.searchParams);
  const merchantReviewWhere: Prisma.OrderWhereInput =
    status === "all"
      ? {}
      : status === "pending"
        ? { OR: [{ merchantReview: { is: null } }, { merchantReview: { is: { reviewStatus: "pending" } } }] }
        : { merchantReview: { is: { reviewStatus: status } } };

  const [usersWithCoupons, orders] = await Promise.all([
    prisma.user.findMany({
      where: { companyId, couponCodes: { isEmpty: false } },
      select: { id: true, knownName: true, name: true, email: true, couponCodes: true },
    }),
    prisma.order.findMany({
      where: {
        companyId,
        createdAt: {
          gte: dateRange.start,
          lte: dateRange.end,
        },
        ...merchantReviewWhere,
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        shopifyOrderId: true,
        orderNumber: true,
        name: true,
        sourceName: true,
        totalPrice: true,
        currency: true,
        createdAt: true,
        customerEmail: true,
        customerPhone: true,
        shippingAddress: true,
        discountCodes: true,
        rawPayload: true,
        assignedMerchant: { select: { id: true, name: true, email: true } },
        companyLocation: { select: { id: true, name: true } },
        customer: { select: { firstName: true, lastName: true } },
        lineItems: {
          include: {
            productItem: {
              select: {
                productTitle: true,
                variantTitle: true,
                sku: true,
              },
            },
          },
        },
        merchantReview: {
          select: {
            reviewStatus: true,
            callMade: true,
            callbackDate: true,
            customerResponseStatus: true,
            reviewerFirstName: true,
            reviewerLastName: true,
            reviewerEmail: true,
            reason: true,
            reviewMarkedAt: true,
            updatedAt: true,
          },
        },
      },
    }),
  ]);

  const couponToUser = buildCouponToUserMap(usersWithCoupons);
  const filteredOrders = orders
    .map((order) => ({
      order,
      reviewMerchant: resolveReviewMerchant({
        sourceName: order.sourceName,
        discountCodes: order.discountCodes,
        rawPayload: order.rawPayload,
        couponToUser,
      }),
    }))
    .filter((item) => {
      if (merchantFilter !== "__all" && item.reviewMerchant.id !== merchantFilter) return false;
      return matchesSearch(item, searchQuery);
    });

  const HEADERS = [
    "Order Number",
    "Customer Name",
    "Email",
    "Phone Number",
    "Merchant",
    "Location",
    "Order Source",
    "Order Value",
    "Ordered At",
    "Shipping Address",
    "Items",
    "Review Status",
    "Call Made",
    "Callback Date",
    "Customer Response Status",
    "Customer First Name",
    "Customer Last Name",
    "Customer Email",
    "Reason",
    "Review Marked At",
    "Review Updated At",
  ];

  const workbook = XLSX.utils.book_new();
  const usedSheetNames = new Set<string>();
  const merchantGroups = new Map<
    string,
    {
      merchantName: string;
      rows: Array<(typeof filteredOrders)[number]>;
    }
  >();

  for (const item of filteredOrders) {
    const group = merchantGroups.get(item.reviewMerchant.id) ?? {
      merchantName: item.reviewMerchant.name,
      rows: [],
    };
    group.rows.push(item);
    merchantGroups.set(item.reviewMerchant.id, group);
  }

  const groups = Array.from(merchantGroups.values()).sort((a, b) =>
    a.merchantName.localeCompare(b.merchantName)
  );
  const sheets = groups.length > 0 ? groups : [{ merchantName: "Merchant Reviews", rows: [] }];

  for (const sheet of sheets) {
    const rows = sheet.rows.map(({ order, reviewMerchant }) => {
      const review = order.merchantReview;
      const itemText = order.lineItems
        .map((item) => {
          const parts = [
            item.productItem.productTitle,
            item.productItem.variantTitle,
            item.productItem.sku ? `SKU ${item.productItem.sku}` : "",
            `Qty ${item.quantity}`,
          ].filter(Boolean);
          return parts.join(" - ");
        })
        .join(" | ");

      return [
        order.orderNumber ?? order.name ?? order.shopifyOrderId,
        pickCustomerName(order),
        order.customerEmail ?? "",
        order.customerPhone ?? "",
        reviewMerchant.name,
        order.companyLocation.name,
        order.sourceName,
        `${Number(order.totalPrice).toFixed(2)}${order.currency ? ` ${order.currency}` : ""}`,
        formatOrderDateTime(order.createdAt),
        formatAddress(order.shippingAddress),
        itemText,
        review?.reviewStatus ?? "pending",
        review?.callMade ? "Yes" : "No",
        formatOrderDate(review?.callbackDate),
        review?.customerResponseStatus ?? "",
        review?.reviewerFirstName ?? "",
        review?.reviewerLastName ?? "",
        review?.reviewerEmail ?? "",
        review?.reason ?? "",
        formatOrderDate(review?.reviewMarkedAt),
        formatOrderDate(review?.updatedAt),
      ];
    });

    const worksheet = XLSX.utils.aoa_to_sheet([HEADERS, ...rows]);
    worksheet["!cols"] = [
      { wch: 16 },
      { wch: 24 },
      { wch: 28 },
      { wch: 16 },
      { wch: 20 },
      { wch: 18 },
      { wch: 14 },
      { wch: 16 },
      { wch: 20 },
      { wch: 42 },
      { wch: 48 },
      { wch: 16 },
      { wch: 12 },
      { wch: 16 },
      { wch: 24 },
      { wch: 18 },
      { wch: 18 },
      { wch: 28 },
      { wch: 40 },
      { wch: 20 },
      { wch: 20 },
    ];
    XLSX.utils.book_append_sheet(workbook, worksheet, toSheetName(sheet.merchantName, usedSheetNames));
  }

  const fileName = buildFileName(status);
  const merchantLabel = merchantFilter === "__all" ? "all" : merchantFilter;
  await logReportDownload({
    companyId,
    userId: viewerUserId,
    reportKey: `merchant_reviews:${status}`,
    reportLabel: `Merchant Reviews Export (${buildStatusLabel(status)})`,
    filters: `status=${status};merchant=${merchantLabel};dateFrom=${dateRange.from};dateTo=${dateRange.to};search=${searchQuery}`,
    fileName,
  });

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
