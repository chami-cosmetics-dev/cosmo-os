import { NextRequest, NextResponse } from "next/server";

import { supportsMerchantOrderReviews } from "@/lib/merchant-order-reviews";
import { prisma } from "@/lib/prisma";
import { logReportDownload } from "@/lib/report-download-log";
import { buildCsv, formatAddress, formatIsoDateTime, getCustomerName } from "@/lib/reports/csv";
import { requirePermission } from "@/lib/rbac";

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
    ? `merchant-reviews-${stamp}.csv`
    : `merchant-reviews-${status}-${stamp}.csv`;
}

function buildStatusLabel(status: ExportStatus) {
  if (status === "follow_up") return "Follow Up";
  if (status === "no_response") return "No Response";
  if (status === "pending") return "Pending";
  if (status === "reviewed") return "Reviewed";
  return "All";
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission("orders.read");
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

  const orders = await prisma.order.findMany({
    where: {
      companyId,
      sourceName: { not: "erpnext-pos" },
      merchantReview: status === "all" ? { isNot: null } : { is: { reviewStatus: status } },
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
          customerRating: true,
          customerFeedback: true,
          itemFeedback: true,
          merchantNotes: true,
          followUpNeeded: true,
          reviewMarkedAt: true,
          updatedAt: true,
        },
      },
    },
  });

  const csv = buildCsv(
    [
      "order_number",
      "customer_name",
      "email",
      "phone_number",
      "merchant",
      "location",
      "order_source",
      "order_value",
      "ordered_at",
      "shipping_address",
      "items",
      "review_status",
      "customer_rating",
      "customer_feedback",
      "item_feedback",
      "merchant_notes",
      "follow_up_needed",
      "review_marked_at",
      "review_updated_at",
    ],
    orders.map((order) => {
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

      return {
        order_number: order.orderNumber ?? order.name ?? order.shopifyOrderId,
        customer_name: getCustomerName(order.shippingAddress) || [order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(" ").trim() || "",
        email: order.customerEmail ?? "",
        phone_number: order.customerPhone ?? "",
        merchant: order.assignedMerchant?.name ?? order.assignedMerchant?.email ?? "",
        location: order.companyLocation.name,
        order_source: order.sourceName,
        order_value: `${Number(order.totalPrice).toFixed(2)}${order.currency ? ` ${order.currency}` : ""}`,
        ordered_at: formatIsoDateTime(order.createdAt),
        shipping_address: formatAddress(order.shippingAddress),
        items: itemText,
        review_status: review?.reviewStatus ?? "",
        customer_rating: review?.customerRating ?? "",
        customer_feedback: review?.customerFeedback ?? "",
        item_feedback: review?.itemFeedback ?? "",
        merchant_notes: review?.merchantNotes ?? "",
        follow_up_needed: review?.followUpNeeded ? "Yes" : "No",
        review_marked_at: formatIsoDateTime(review?.reviewMarkedAt),
        review_updated_at: formatIsoDateTime(review?.updatedAt),
      };
    })
  );

  const fileName = buildFileName(status);
  await logReportDownload({
    companyId,
    userId: viewerUserId,
    reportKey: `merchant_reviews:${status}`,
    reportLabel: `Merchant Reviews Export (${buildStatusLabel(status)})`,
    filters: `status=${status}`,
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
