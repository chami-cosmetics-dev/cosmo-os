import { NextResponse } from "next/server";

import { getProductItemStatusMeta } from "@/lib/product-item-status";
import { getCurrentUserContext } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const context = await getCurrentUserContext();
  if (!context?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const companyId = context.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const explanations = await prisma.cosmoAcademyExplanation.findMany({
    where: { companyId, status: "published" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      productTitle: true,
      title: true,
      notes: true,
      createdAt: true,
      primaryProductItem: {
        select: {
          sku: true,
          imageUrl: true,
          itemStatusCategory: true,
          itemStatusLabel: true,
          vendor: { select: { name: true } },
          category: { select: { name: true } },
        },
      },
      media: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          mediaType: true,
          url: true,
          mimeType: true,
        },
      },
      progress: {
        where: { userId: context.user.id },
        select: {
          status: true,
          lastOpenedAt: true,
          completedAt: true,
        },
        take: 1,
      },
    },
  });

  const lessons = explanations.map((explanation) => {
    const statusMeta = getProductItemStatusMeta(
      explanation.primaryProductItem.itemStatusCategory,
    );
    const progress = explanation.progress[0] ?? null;

    return {
      id: explanation.id,
      productTitle: explanation.productTitle,
      title: explanation.title,
      notes: explanation.notes,
      createdAt: explanation.createdAt,
      sku: explanation.primaryProductItem.sku,
      imageUrl: explanation.primaryProductItem.imageUrl,
      vendorName: explanation.primaryProductItem.vendor?.name ?? null,
      categoryName: explanation.primaryProductItem.category?.name ?? null,
      priorityLabel: explanation.primaryProductItem.itemStatusLabel || statusMeta.label,
      brandPriority: statusMeta.brandPriority,
      productPriority: statusMeta.productPriority,
      lifecycle: statusMeta.lifecycle,
      media: explanation.media,
      progressStatus: progress?.status ?? "not_started",
      lastOpenedAt: progress?.lastOpenedAt ?? null,
      completedAt: progress?.completedAt ?? null,
    };
  });

  const completedCount = lessons.filter((lesson) => lesson.progressStatus === "completed").length;

  return NextResponse.json({
    lessons,
    summary: {
      total: lessons.length,
      completed: completedCount,
      inProgress: lessons.filter((lesson) => lesson.progressStatus === "in_progress").length,
      notStarted: lessons.filter((lesson) => lesson.progressStatus === "not_started").length,
    },
  });
}
