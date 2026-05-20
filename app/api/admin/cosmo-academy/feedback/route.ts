import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePermission("academy.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user!.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const explanations = await prisma.cosmoAcademyExplanation.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      productTitle: true,
      title: true,
      createdAt: true,
      primaryProductItem: {
        select: { imageUrl: true, sku: true },
      },
      progress: {
        where: { status: "completed", rating: { not: null } },
        orderBy: { completedAt: "desc" },
        select: {
          id: true,
          rating: true,
          reviewNotes: true,
          completedAt: true,
          user: {
            select: { name: true, email: true },
          },
        },
      },
    },
  });

  const result = explanations
    .filter((e) => e.progress.length > 0)
    .map((e) => {
      const ratings = e.progress.map((p) => p.rating as number);
      const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
      return {
        id: e.id,
        productTitle: e.productTitle,
        title: e.title,
        createdAt: e.createdAt,
        imageUrl: e.primaryProductItem.imageUrl,
        sku: e.primaryProductItem.sku,
        completionCount: e.progress.length,
        avgRating: Math.round(avgRating * 10) / 10,
        reviews: e.progress.map((p) => ({
          id: p.id,
          rating: p.rating as number,
          reviewNotes: p.reviewNotes,
          completedAt: p.completedAt,
          userName: p.user.name ?? p.user.email ?? "Unknown",
        })),
      };
    });

  return NextResponse.json({ feedback: result });
}
