import { NextRequest, NextResponse } from "next/server";

import { getCurrentUserContext } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

const ALLOWED_STATUSES = new Set(["in_progress", "completed"]);

export async function POST(request: NextRequest) {
  const context = await getCurrentUserContext();
  if (!context?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const companyId = context.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as {
    explanationId?: unknown;
    status?: unknown;
  } | null;
  const explanationId = typeof body?.explanationId === "string" ? body.explanationId : "";
  const status = typeof body?.status === "string" ? body.status : "";

  if (!explanationId || !ALLOWED_STATUSES.has(status)) {
    return NextResponse.json({ error: "Invalid progress update" }, { status: 400 });
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
        userId: context.user.id,
      },
    },
    update: {
      status,
      lastOpenedAt: now,
      completedAt: status === "completed" ? now : null,
    },
    create: {
      companyId,
      explanationId,
      userId: context.user.id,
      status,
      lastOpenedAt: now,
      completedAt: status === "completed" ? now : null,
    },
  });

  return NextResponse.json({ progress });
}
