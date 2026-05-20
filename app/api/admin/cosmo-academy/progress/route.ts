import { NextRequest, NextResponse } from "next/server";

import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

const ALLOWED_STATUSES = new Set(["in_progress", "completed"]);

export async function POST(request: NextRequest) {
  const auth = await requirePermission("academy.learn");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const user = auth.context!.user!;
  const companyId = user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as {
    explanationId?: unknown;
    status?: unknown;
    rating?: unknown;
    reviewNotes?: unknown;
  } | null;
  const explanationId = typeof body?.explanationId === "string" ? body.explanationId : "";
  const status = typeof body?.status === "string" ? body.status : "";
  const rating = typeof body?.rating === "number" ? Math.round(body.rating) : null;
  const reviewNotes = typeof body?.reviewNotes === "string" ? body.reviewNotes.trim() : null;

  if (!explanationId || !ALLOWED_STATUSES.has(status)) {
    return NextResponse.json({ error: "Invalid progress update" }, { status: 400 });
  }

  if (status === "completed") {
    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "A rating (1–5) is required to complete a lesson" }, { status: 400 });
    }
    if (!reviewNotes) {
      return NextResponse.json({ error: "A written review is required to complete a lesson" }, { status: 400 });
    }
  }

  const explanation = await prisma.cosmoAcademyExplanation.findFirst({
    where: { id: explanationId, companyId, status: "published" },
    select: { id: true },
  });
  if (!explanation) {
    return NextResponse.json({ error: "Explanation not found" }, { status: 404 });
  }

  const now = new Date();
  const progress = await prisma.cosmoAcademyProgress.upsert({
    where: {
      explanationId_userId: {
        explanationId,
        userId: user.id,
      },
    },
    update: {
      status,
      lastOpenedAt: now,
      completedAt: status === "completed" ? now : null,
      ...(status === "completed" ? { rating, reviewNotes } : {}),
    },
    create: {
      companyId,
      explanationId,
      userId: user.id,
      status,
      lastOpenedAt: now,
      completedAt: status === "completed" ? now : null,
      ...(status === "completed" ? { rating, reviewNotes } : {}),
    },
  });

  return NextResponse.json({ progress });
}
