import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import {
  buildFailedErpSyncWhere,
  markOrderErpSyncFailed,
  retryOrderErpSync,
} from "@/lib/failed-erp-sync-auto-retry";
import {
  buildFailedErpPeSyncWhere,
  markOrderErpPeSyncFailed,
  resolveFailedErpPeRetryMop,
  retryOrderErpPeSync,
} from "@/lib/failed-erp-pe-sync";

export const maxDuration = 120;

const bodySchema = z.object({
  kind: z.enum(["sales_invoice", "payment_entry"]).optional().default("sales_invoice"),
});

const PE_RETRY_ALL_LIMIT = 100;

export async function POST(request: NextRequest) {
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
      { status: 404 },
    );
  }

  const rawBody = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (parsed.data.kind === "payment_entry") {
    return retryAllPaymentEntries(companyId);
  }

  return retryAllSalesInvoices(companyId);
}

async function retryAllSalesInvoices(companyId: string) {
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
  const sampleFailures: Array<{ id: string; shopifyOrderId: string; error: string }> = [];

  for (const order of failedOrders) {
    try {
      await retryOrderErpSync(order);
      succeeded += 1;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      failed += 1;
      await markOrderErpSyncFailed(order.id, errorMessage, {
        incrementAutoRetryCount: true,
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
    kind: "sales_invoice",
    total: failedOrders.length,
    succeeded,
    failed,
    skipped: 0,
    sampleFailures,
    message: `Retried ${failedOrders.length} orders: ${succeeded} succeeded, ${failed} still failing.`,
  });
}

async function retryAllPaymentEntries(companyId: string) {
  const failedOrders = await prisma.order.findMany({
    where: buildFailedErpPeSyncWhere(companyId),
    orderBy: { erpPeSyncFailedAt: "asc" },
    take: PE_RETRY_ALL_LIMIT,
    include: { companyLocation: { include: { erpnextInstance: true } } },
  });

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  const sampleFailures: Array<{ id: string; shopifyOrderId: string; error: string }> = [];

  for (const order of failedOrders) {
    const mopName = resolveFailedErpPeRetryMop(order);
    if (!mopName) {
      skipped += 1;
      if (sampleFailures.length < 10) {
        sampleFailures.push({
          id: order.id,
          shopifyOrderId: order.shopifyOrderId,
          error: "No ERP payment mode recorded — open the row and pick a mode to retry",
        });
      }
      continue;
    }

    try {
      await retryOrderErpPeSync({
        orderId: order.id,
        companyId,
        mopName,
      });
      succeeded += 1;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      failed += 1;
      await markOrderErpPeSyncFailed(order.id, errorMessage, mopName);
      if (sampleFailures.length < 10) {
        sampleFailures.push({
          id: order.id,
          shopifyOrderId: order.shopifyOrderId,
          error: errorMessage,
        });
      }
    }
  }

  const cappedNote =
    failedOrders.length >= PE_RETRY_ALL_LIMIT
      ? ` (first ${PE_RETRY_ALL_LIMIT} only — run again for the rest)`
      : "";

  return NextResponse.json({
    ok: true,
    kind: "payment_entry",
    total: failedOrders.length,
    succeeded,
    failed,
    skipped,
    sampleFailures,
    message: `Retried ${failedOrders.length} payment entries: ${succeeded} succeeded, ${failed} still failing, ${skipped} skipped${cappedNote}.`,
  });
}
