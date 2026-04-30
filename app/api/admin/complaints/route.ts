import { randomBytes } from "crypto";

import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import { fetchComplaints, isMissingComplaintTableError } from "@/lib/page-data/complaints";
import { prisma } from "@/lib/prisma";
import { hasPermission, requireAnyPermission } from "@/lib/rbac";

const createComplaintSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(5).max(2000),
});

function createId() {
  return `c${randomBytes(12).toString("hex")}`;
}

export async function GET(request: NextRequest) {
  const auth = await requireAnyPermission(["complaints.create", "complaints.read", "complaints.manage"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context.user?.companyId ?? null;
  const userId = auth.context.user?.id ?? null;
  if (!companyId || !userId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const statusParam = request.nextUrl.searchParams.get("status");
  const status =
    statusParam === "open" || statusParam === "in_progress" || statusParam === "resolved"
      ? statusParam
      : "all";
  const canReadAll = hasPermission(auth.context, "complaints.read") || hasPermission(auth.context, "complaints.manage");

  const complaints = await fetchComplaints({
    companyId,
    userId,
    canReadAll,
    status,
    limit: 100,
  });

  return NextResponse.json({ complaints });
}

export async function POST(request: NextRequest) {
  const auth = await requireAnyPermission(["complaints.create", "complaints.manage"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context.user?.companyId ?? null;
  const userId = auth.context.user?.id ?? null;
  if (!companyId || !userId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = createComplaintSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const id = createId();
  const now = new Date();
  try {
    await prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO "Complaint" (
          "id",
          "companyId",
          "createdById",
          "title",
          "description",
          "status",
          "createdAt",
          "updatedAt"
        )
        VALUES (
          ${id},
          ${companyId},
          ${userId},
          ${parsed.data.title},
          ${parsed.data.description},
          'open',
          ${now},
          ${now}
        )
      `
    );
  } catch (error) {
    if (isMissingComplaintTableError(error)) {
      return NextResponse.json(
        { error: "Complaint table is missing. Run the latest Prisma migration." },
        { status: 503 }
      );
    }
    throw error;
  }

  await writeAuditLog({
    companyId,
    actorUserId: userId,
    module: "complaints",
    action: "complaint_created",
    entityType: "Complaint",
    entityId: id,
    summary: `Created complaint: ${parsed.data.title}`,
    afterData: parsed.data,
  });

  return NextResponse.json({ id }, { status: 201 });
}
