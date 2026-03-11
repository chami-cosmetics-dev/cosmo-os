import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { limitSchema, pageSchema } from "@/lib/validation";

function normalizeMessage(message: string): string {
  return message.replace(/\s+/g, " ").trim();
}

function classifyFailure(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.startsWith("validation failed")) return "Payload validation";
  if (normalized.includes("unique constraint")) return "Database constraint";
  if (normalized.includes("foreign key constraint")) return "Database relation";
  if (normalized.includes("invalid")) return "Invalid data";
  return "Processing error";
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission("orders.read");
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

  const pageResult = pageSchema.safeParse(request.nextUrl.searchParams.get("page"));
  const limitResult = limitSchema.safeParse(request.nextUrl.searchParams.get("limit"));
  const statusParam = request.nextUrl.searchParams.get("status");
  const status = statusParam === "resolved" ? "resolved" : "unresolved";
  const page = pageResult.success ? pageResult.data : 1;
  const limit = limitResult.success ? limitResult.data : 10;
  const skip = (page - 1) * limit;
  const where: Prisma.FailedOrderWebhookWhereInput =
    status === "resolved"
      ? { companyId, resolvedAt: { not: null } }
      : { companyId, resolvedAt: null };

  const [total, failed, failedForSummary] = await Promise.all([
    prisma.failedOrderWebhook.count({
      where,
    }),
    prisma.failedOrderWebhook.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        companyLocation: {
          select: { id: true, name: true, shopifyLocationId: true, shopifyShopName: true, shopifyAdminStoreHandle: true },
        },
      },
    }),
    prisma.failedOrderWebhook.findMany({
      where,
      select: {
        shopifyOrderId: true,
        shopifyTopic: true,
        errorMessage: true,
        createdAt: true,
      },
    }),
  ]);

  const items = failed.map((f) => ({
    id: f.id,
    shopifyOrderId: f.shopifyOrderId,
    shopifyTopic: f.shopifyTopic,
    errorMessage: f.errorMessage,
    errorStack: f.errorStack,
    createdAt: f.createdAt.toISOString(),
    resolvedAt: f.resolvedAt?.toISOString() ?? null,
    companyLocation: f.companyLocation,
  }));

  const distinctOrderIds = new Set<string>();
  const topicCounts = new Map<string, number>();
  const failureTypeCounts = new Map<string, number>();
  const messageCounts = new Map<string, number>();
  let oldestFailureAt: Date | null = null;
  let newestFailureAt: Date | null = null;

  for (const row of failedForSummary) {
    distinctOrderIds.add(row.shopifyOrderId);

    const topic = row.shopifyTopic?.trim() || "unknown";
    topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);

    const failureType = classifyFailure(row.errorMessage);
    failureTypeCounts.set(failureType, (failureTypeCounts.get(failureType) ?? 0) + 1);

    const normalizedMessage = normalizeMessage(row.errorMessage);
    messageCounts.set(normalizedMessage, (messageCounts.get(normalizedMessage) ?? 0) + 1);

    if (!oldestFailureAt || row.createdAt < oldestFailureAt) oldestFailureAt = row.createdAt;
    if (!newestFailureAt || row.createdAt > newestFailureAt) newestFailureAt = row.createdAt;
  }

  const sortedEntries = (map: Map<string, number>) =>
    Array.from(map.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([key, count]) => ({ key, count }));

  return NextResponse.json({
    items,
    total,
    page,
    limit,
    status,
    summary: {
      totalWebhooks: total,
      uniqueOrders: distinctOrderIds.size,
      topTopics: sortedEntries(topicCounts).slice(0, 5).map((item) => ({
        topic: item.key,
        count: item.count,
      })),
      topFailureTypes: sortedEntries(failureTypeCounts).slice(0, 5).map((item) => ({
        type: item.key,
        count: item.count,
      })),
      topErrorMessages: sortedEntries(messageCounts).slice(0, 5).map((item) => ({
        message: item.key,
        count: item.count,
      })),
      oldestFailureAt: oldestFailureAt?.toISOString() ?? null,
      newestFailureAt: newestFailureAt?.toISOString() ?? null,
    },
  });
}
