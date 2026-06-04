import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import { getMerchantOrderReview, saveMerchantOrderReview } from "@/lib/merchant-order-reviews";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

const reviewSchema = z.object({
  reviewStatus: z.enum(["pending", "reviewed", "follow_up", "no_response"]),
  customerRating: z.number().int().min(1).max(5).nullable(),
  customerFeedback: z.string().trim().max(5000).nullable(),
  itemFeedback: z.string().trim().max(5000).nullable(),
  merchantNotes: z.string().trim().max(5000).nullable(),
  followUpNeeded: z.boolean(),
});

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
  const auth = await requirePermission("orders.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const parsedId = cuidSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Invalid order ID" }, { status: 400 });
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
          customerRating: review.customerRating,
          customerFeedback: review.customerFeedback,
          itemFeedback: review.itemFeedback,
          merchantNotes: review.merchantNotes,
          followUpNeeded: review.followUpNeeded,
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
  const auth = await requirePermission("orders.read");
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
      customerRating: parsed.data.customerRating,
      customerFeedback: parsed.data.customerFeedback?.trim() || null,
      itemFeedback: parsed.data.itemFeedback?.trim() || null,
      merchantNotes: parsed.data.merchantNotes?.trim() || null,
      followUpNeeded: parsed.data.followUpNeeded,
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
        customerRating: review.customerRating,
        followUpNeeded: review.followUpNeeded,
      },
    });

    return NextResponse.json({
      ok: true,
      review: {
        reviewStatus: review.reviewStatus,
        customerRating: review.customerRating,
        customerFeedback: review.customerFeedback,
        itemFeedback: review.itemFeedback,
        merchantNotes: review.merchantNotes,
        followUpNeeded: review.followUpNeeded,
        reviewMarkedAt: review.reviewMarkedAt?.toISOString() ?? null,
        updatedAt: review.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save merchant review";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
