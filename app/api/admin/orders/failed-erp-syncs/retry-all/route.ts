import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import {
  buildFailedErpSyncWhere,
  markOrderErpSyncFailed,
  retryOrderErpSync,
} from "@/lib/failed-erp-sync-auto-retry";

export const maxDuration = 60;

export async function POST() {
  const auth = await requirePermission("failed_webhooks.retry");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const userId = auth.context!.user!.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });

  const companyId = user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const failedOrders = await prisma.order.findMany({
    where: buildFailedErpSyncWhere(companyId),
    orderBy: { erpnextSyncFailedAt: "asc" },
    include: {
      companyLocation: { include: { erpnextInstance: true } },
      lineItems: { include: { productItem: true } },
    },
  });

  let succeeded = 0;
  let failed = 0;
  let skippedApproval = 0;
  const sampleFailures: Array<{ id: string; shopifyOrderId: string; error: string }> = [];

  for (const order of failedOrders) {
    try {
      await retryOrderErpSync(order);
      succeeded += 1;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("awaiting finance approval")) {
        skippedApproval += 1;
        continue;
      }

      failed += 1;
      await markOrderErpSyncFailed(order.id, errorMessage, {
        autoRetryCount: order.erpnextSyncAutoRetryCount,
        scheduleAutoRetry: true,
      });

      if (sampleFailures.length < 10) {
        sampleFailures.push({
          id: order.id,
          shopifyOrderId: order.shopifyOrderId,
          error: errorMessage,
        });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    total: failedOrders.length,
    succeeded,
    failed,
    skippedApproval,
    sampleFailures,
    message: `Retried ${failedOrders.length} orders: ${succeeded} succeeded, ${failed} still failing${skippedApproval > 0 ? `, ${skippedApproval} skipped (awaiting approval)` : ""}.`,
  });
}
