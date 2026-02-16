import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";
import { shopifyOrderWebhookSchema } from "@/lib/validation/shopify-order";
import { processOrderWebhook } from "@/lib/order-webhook-process";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("orders.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const idResult = cuidSchema.safeParse(id);
  if (!idResult.success) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const failed = await prisma.failedOrderWebhook.findUnique({
    where: { id: idResult.data },
    include: {
      companyLocation: { include: { defaultMerchant: true } },
    },
  });

  if (!failed) {
    return NextResponse.json({ error: "Failed webhook not found" }, { status: 404 });
  }

  const userId = auth.context!.user!.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });

  if (user?.companyId !== failed.companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rawPayload = failed.rawPayload as unknown;
  const parsed = shopifyOrderWebhookSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Stored payload is invalid",
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  try {
    await processOrderWebhook(
      parsed.data,
      failed.companyLocation,
      rawPayload
    );

    await prisma.failedOrderWebhook.update({
      where: { id: idResult.data },
      data: { resolvedAt: new Date() },
    });

    return NextResponse.json({ ok: true, message: "Order processed successfully" });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await prisma.failedOrderWebhook.update({
      where: { id: idResult.data },
      data: {
        errorMessage: errorMessage.slice(0, 10000),
        errorStack:
          (error instanceof Error ? error.stack : null)?.slice(0, 10000) ?? null,
      },
    });

    return NextResponse.json(
      { error: "Retry failed", details: errorMessage },
      { status: 500 }
    );
  }
}
