import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { shopifyOrderWebhookSchema } from "@/lib/validation/shopify-order";
import { processOrderWebhook } from "@/lib/order-webhook-process";

export const maxDuration = 60;

export async function POST() {
  const auth = await requirePermission("orders.manage");
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

  const unresolved = await prisma.failedOrderWebhook.findMany({
    where: { companyId, resolvedAt: null },
    orderBy: { createdAt: "asc" },
    include: {
      companyLocation: { include: { defaultMerchant: true } },
    },
  });

  let succeeded = 0;
  let failed = 0;
  let invalidPayload = 0;
  const sampleFailures: Array<{ id: string; shopifyOrderId: string; error: string }> = [];

  for (const item of unresolved) {
    const rawPayload = item.rawPayload as unknown;
    const parsed = shopifyOrderWebhookSchema.safeParse(rawPayload);
    if (!parsed.success) {
      invalidPayload += 1;
      failed += 1;
      const errorMessage = `Stored payload invalid: ${parsed.error.message}`.slice(0, 10000);
      await prisma.failedOrderWebhook.update({
        where: { id: item.id },
        data: {
          errorMessage,
          errorStack: JSON.stringify(parsed.error.flatten(), null, 2).slice(0, 10000),
        },
      });
      if (sampleFailures.length < 10) {
        sampleFailures.push({
          id: item.id,
          shopifyOrderId: item.shopifyOrderId,
          error: errorMessage,
        });
      }
      continue;
    }

    try {
      await processOrderWebhook(parsed.data, item.companyLocation, rawPayload);
      await prisma.failedOrderWebhook.update({
        where: { id: item.id },
        data: { resolvedAt: new Date() },
      });
      succeeded += 1;
    } catch (error) {
      failed += 1;
      const errorMessage = (error instanceof Error ? error.message : String(error)).slice(
        0,
        10000
      );
      await prisma.failedOrderWebhook.update({
        where: { id: item.id },
        data: {
          errorMessage,
          errorStack:
            (error instanceof Error ? error.stack : null)?.slice(0, 10000) ?? null,
        },
      });
      if (sampleFailures.length < 10) {
        sampleFailures.push({
          id: item.id,
          shopifyOrderId: item.shopifyOrderId,
          error: errorMessage,
        });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    total: unresolved.length,
    succeeded,
    failed,
    invalidPayload,
    sampleFailures,
    message: `Retried ${unresolved.length} webhooks: ${succeeded} succeeded, ${failed} still failing.`,
  });
}
