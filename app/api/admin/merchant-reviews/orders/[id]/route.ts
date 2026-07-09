import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import { getMerchantOrderReview, saveMerchantOrderReview } from "@/lib/merchant-order-reviews";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

const reviewSchema = z.object({
  reviewStatus: z.enum(["pending", "reviewed", "follow_up", "no_response"]),
  callMade: z.boolean(),
  callbackDate: z.string().trim().nullable(),
  customerResponseStatus: z.string().trim().max(100).nullable(),
  reviewerFirstName: z.string().trim().max(100).nullable(),
  reviewerLastName: z.string().trim().max(100).nullable(),
  reviewerEmail: z.string().trim().email().max(255).nullable(),
  reason: z.string().trim().max(5000).nullable(),
});

function parseCallbackDate(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function resolveOrderForViewer(orderId: string, companyId: string) {
  return prisma.order.findFirst({
    where: {
      id: orderId,
      companyId,
    },
    select: {
      id: true,
      companyId: true,
      shopifyOrderId: true,
      orderNumber: true,
      name: true,
      sourceName: true,
      totalPrice: true,
      currency: true,
      createdAt: true,
      customerEmail: true,
      customerPhone: true,
      assignedMerchantId: true,
      assignedMerchant: { select: { id: true, name: true, email: true } },
      companyLocation: { select: { id: true, name: true } },
      shippingAddress: true,
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
    },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("merchant_reviews.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const parsedId = cuidSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Invalid order ID" }, { status: 400 });
  }

  const companyId = auth.context!.user!.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }
  const order = await resolveOrderForViewer(parsedId.data, companyId);
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const review = await getMerchantOrderReview(order.id);

  return NextResponse.json({
    order: {
      id: order.id,
      shopifyOrderId: order.shopifyOrderId,
      orderNumber: order.orderNumber,
      name: order.name,
      sourceName: order.sourceName,
      totalPrice: order.totalPrice.toString(),
      currency: order.currency,
      createdAt: order.createdAt.toISOString(),
      customerEmail: order.customerEmail,
      customerPhone: order.customerPhone,
      assignedMerchant: order.assignedMerchant,
      companyLocation: order.companyLocation,
      shippingAddress: order.shippingAddress,
      lineItems: order.lineItems.map((item) => ({
        id: item.id,
        productTitle: item.productItem.productTitle,
        variantTitle: item.productItem.variantTitle,
        sku: item.productItem.sku,
        quantity: item.quantity,
        price: item.price.toString(),
      })),
    },
    review: review
      ? {
          reviewStatus: review.reviewStatus,
          callMade: review.callMade,
          callbackDate: review.callbackDate?.toISOString() ?? null,
          customerResponseStatus: review.customerResponseStatus,
          reviewerFirstName: review.reviewerFirstName,
          reviewerLastName: review.reviewerLastName,
          reviewerEmail: review.reviewerEmail,
          reason: review.reason,
          reviewMarkedAt: review.reviewMarkedAt?.toISOString() ?? null,
          updatedAt: review.updatedAt.toISOString(),
        }
      : null,
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("merchant_reviews.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const parsedId = cuidSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Invalid order ID" }, { status: 400 });
  }

  const payload = await request.json().catch(() => ({}));
  const parsed = reviewSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const viewerUserId = auth.context!.user!.id;
  const companyId = auth.context!.user!.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }
  const order = await resolveOrderForViewer(parsedId.data, companyId);
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  try {
    const review = await saveMerchantOrderReview({
      companyId: order.companyId,
      orderId: order.id,
      merchantUserId: order.assignedMerchantId ?? viewerUserId,
      reviewStatus: parsed.data.reviewStatus,
      customerRating: null,
      customerFeedback: null,
      itemFeedback: null,
      merchantNotes: null,
      followUpNeeded: false,
      callMade: parsed.data.callMade,
      callbackDate: parseCallbackDate(parsed.data.callbackDate),
      customerResponseStatus: parsed.data.customerResponseStatus?.trim() || null,
      reviewerFirstName: parsed.data.reviewerFirstName?.trim() || null,
      reviewerLastName: parsed.data.reviewerLastName?.trim() || null,
      reviewerEmail: parsed.data.reviewerEmail?.trim() || null,
      reason: parsed.data.reason?.trim() || null,
      reviewMarkedAt: parsed.data.reviewStatus === "reviewed" ? new Date() : null,
    });

    await writeAuditLog({
      companyId: order.companyId,
      actorUserId: viewerUserId,
      module: "orders",
      action: "merchant_review_saved",
      entityType: "Order",
      entityId: order.id,
      summary: `Saved merchant review for order ${order.orderNumber ?? order.name ?? order.id}`,
      afterData: {
        reviewStatus: review.reviewStatus,
        callMade: review.callMade,
        callbackDate: review.callbackDate,
        customerResponseStatus: review.customerResponseStatus,
      },
    });

    return NextResponse.json({
      ok: true,
      review: {
        reviewStatus: review.reviewStatus,
        callMade: review.callMade,
        callbackDate: review.callbackDate?.toISOString() ?? null,
        customerResponseStatus: review.customerResponseStatus,
        reviewerFirstName: review.reviewerFirstName,
        reviewerLastName: review.reviewerLastName,
        reviewerEmail: review.reviewerEmail,
        reason: review.reason,
        reviewMarkedAt: review.reviewMarkedAt?.toISOString() ?? null,
        updatedAt: review.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save merchant review";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
