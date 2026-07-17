import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import { markManyMerchantReviewsFollowUp, supportsMerchantOrderReviews } from "@/lib/merchant-order-reviews";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema, LIMITS } from "@/lib/validation";

const bodySchema = z.object({
  orderIds: z
    .array(cuidSchema)
    .min(1, "At least one order ID is required")
    .max(LIMITS.merchantReviewBulkMark.maxOrderIds, `At most ${LIMITS.merchantReviewBulkMark.maxOrderIds} order IDs allowed`),
});

export async function POST(request: NextRequest) {
  const auth = await requirePermission("merchant_reviews.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!supportsMerchantOrderReviews()) {
    return NextResponse.json(
      { error: "Merchant review table is not available yet. Run the latest Prisma migration first." },
      { status: 503 }
    );
  }

  const payload = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const viewerUserId = auth.context!.user!.id;
  const companyId = auth.context!.user!.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  try {
    const result = await markManyMerchantReviewsFollowUp({
      companyId,
      orderIds: parsed.data.orderIds,
      actorUserId: viewerUserId,
    });

    const sampleIds = result.updatedOrderIds.slice(0, 20);
    await writeAuditLog({
      companyId,
      actorUserId: viewerUserId,
      module: "orders",
      action: "merchant_review_bulk_follow_up",
      entityType: "MerchantOrderReview",
      entityId: sampleIds[0] ?? companyId,
      summary: `Bulk marked ${result.counts.updated} merchant review(s) as Follow up (requested ${result.counts.requested})`,
      afterData: {
        counts: result.counts,
        updatedOrderIdsSample: sampleIds,
      },
    });

    return NextResponse.json({
      ok: true,
      updatedOrderIds: result.updatedOrderIds,
      counts: result.counts,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to mark reviews as Follow up";
    const status = message.includes("not available") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
